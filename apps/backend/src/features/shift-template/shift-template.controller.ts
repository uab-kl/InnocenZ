import path from 'node:path';
import type { Request, Response } from 'express';
import type { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository';
import type { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import type { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import {
  CreateShiftTemplateSchema,
  UpdateShiftTemplateSchema,
} from '@/schema/shift-template.schema';
import { getActor } from '@/util/actor';
import { decodeLogoBase64, orgFolder } from '@/util/org-logo';
import { uuidParam } from '@/util/params';
import { sanitizePathSegment } from '@/util/profile-image';
import { r2Configured, r2DeleteStoredRef, r2PutObject } from '@/util/r2';
import { isOutletCaller, type OrgScope, resolveOrgScope } from '@/util/org-scope';
import type { ShiftTemplateRepositoryClass } from './shift-template.repository';
import type { ShiftEventKind } from '@/features/shift/shift.model';

const COVER_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const COVER_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The owner's folder plan, verbatim: an `event-type/` folder per venue, split
 * into `normal-event/` and `special-event/`, the file named by the event and the moment —
 * `outlet/<slug>-<uuid>/event-type/special-event/chinese-new-year-1790….png`.
 * One object per template: a replaced cover deletes the old object.
 */
async function saveCoverToR2(input: {
  outletId: string;
  outletName: string | null | undefined;
  eventKind: ShiftEventKind;
  templateName: string;
  base64: string;
  fileName?: string;
  contentType?: string;
}): Promise<string> {
  if (!r2Configured()) {
    throw new Error('Image storage (R2) is not configured on this server');
  }
  const fromName = input.fileName ? path.extname(input.fileName).toLowerCase() : '';
  const fromType =
    Object.entries(COVER_EXT).find(([, ct]) => ct === input.contentType?.toLowerCase())?.[0] ??
    '';
  const ext = COVER_EXT[fromName] ? fromName : fromType;
  if (!ext) throw new Error('Only JPG, PNG and WebP images are allowed');
  const body = decodeLogoBase64(input.base64);
  if (!body.length) throw new Error('Cover image is empty');
  if (body.length > COVER_MAX_BYTES) throw new Error('Cover must be 5 MB or smaller');
  const name = sanitizePathSegment(input.templateName) || 'event';
  const key = `outlet/${orgFolder(input.outletId, input.outletName)}/event-type/${input.eventKind}-event/${name}-${Date.now()}${ext}`;
  return r2PutObject({ key, body, contentType: COVER_EXT[ext]! });
}

export class ShiftTemplateControllerClass {
  constructor(
    private shiftTemplateRepository: ShiftTemplateRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private outletRepository: OutletRepositoryClass,
  ) {}

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  /**
   * The one venue this call is about: an outlet caller's own venue (or a named
   * one of theirs), an admin's explicit ?outletId. Null = refuse upstream.
   */
  private resolveOutletId(scope: OrgScope, requested?: string): string | null {
    if (scope.isAdmin) return requested ?? null;
    if (!isOutletCaller(scope)) return null;
    if (requested) return scope.outletIds.includes(requested) ? requested : null;
    return scope.outletIds[0] ?? null;
  }

  /** GET /shift-template — the caller's gallery. */
  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const requested = typeof req.query.outletId === 'string' ? req.query.outletId : undefined;
      let outletIds: string[];
      if (scope.isAdmin) {
        if (!requested) {
          return res
            .status(400)
            .json({ success: false, message: 'outletId is required', data: null });
        }
        outletIds = [requested];
      } else if (isOutletCaller(scope)) {
        outletIds = requested
          ? scope.outletIds.filter((id) => id === requested)
          : scope.outletIds;
      } else {
        return res.status(403).json({ success: false, message: 'Outlet only', data: null });
      }
      const data = await this.shiftTemplateRepository.listByOutletIds(outletIds);
      return res.json({ success: true, message: 'Shift templates retrieved', data });
    } catch (error) {
      console.error('[shift-template] list failed', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to list shift templates', data: null });
    }
  }

  /** POST /shift-template — new card, optionally with its cover in one call. */
  async create(req: Request, res: Response) {
    try {
      const parsed = CreateShiftTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
          data: null,
        });
      }
      const scope = await this.resolveScope(req);
      const outletId = this.resolveOutletId(scope, parsed.data.outletId);
      if (!outletId) {
        return res
          .status(403)
          .json({ success: false, message: 'You can only manage your own outlet', data: null });
      }

      const { coverBase64, coverFileName, coverContentType, ...fields } = parsed.data;
      let coverImage: string | undefined;
      if (coverBase64) {
        const outlet = await this.outletRepository.getById(outletId);
        coverImage = await saveCoverToR2({
          outletId,
          outletName: outlet?.name,
          eventKind: fields.eventKind,
          templateName: fields.name,
          base64: coverBase64,
          fileName: coverFileName,
          contentType: coverContentType,
        });
      }

      const actor = getActor(req);
      const row = await this.shiftTemplateRepository.create({
        ...fields,
        outletId,
        coverImage,
        createdBy: actor,
        updatedBy: actor,
      });
      return res.status(201).json({ success: true, message: 'Template created', data: row });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template';
      // unique(outlet_id, name) — say the real reason, not a 500.
      if (/duplicate key|unique/i.test(message)) {
        return res.status(409).json({
          success: false,
          message: 'A template with this name already exists — pick another name',
          data: null,
        });
      }
      console.error('[shift-template] create failed', error);
      return res.status(400).json({ success: false, message, data: null });
    }
  }

  /** PUT /shift-template/:id — edit; cover replace deletes the old object. */
  async update(req: Request, res: Response) {
    try {
      const id = uuidParam(req.params.id);
      const existing = id ? await this.shiftTemplateRepository.getById(id) : null;
      const scope = await this.resolveScope(req);
      const allowed =
        existing &&
        (scope.isAdmin || (isOutletCaller(scope) && scope.outletIds.includes(existing.outletId)));
      if (!existing || !allowed || !id) {
        // 404 for both missing and out-of-scope — a foreign template must not
        // be distinguishable from a nonexistent one.
        return res.status(404).json({ success: false, message: 'Template not found', data: null });
      }
      const parsed = UpdateShiftTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
          data: null,
        });
      }

      const { coverBase64, coverFileName, coverContentType, removeCover, ...fields } =
        parsed.data;
      let coverImage: string | null | undefined;
      if (coverBase64) {
        const outlet = await this.outletRepository.getById(existing.outletId);
        coverImage = await saveCoverToR2({
          outletId: existing.outletId,
          outletName: outlet?.name,
          eventKind: fields.eventKind ?? existing.eventKind,
          templateName: fields.name ?? existing.name,
          base64: coverBase64,
          fileName: coverFileName,
          contentType: coverContentType,
        });
        await r2DeleteStoredRef(existing.coverImage);
      } else if (removeCover) {
        await r2DeleteStoredRef(existing.coverImage);
        coverImage = null;
      }

      const row = await this.shiftTemplateRepository.update(id, {
        ...fields,
        ...(coverImage !== undefined ? { coverImage } : {}),
        updatedBy: getActor(req),
      });
      return res.json({ success: true, message: 'Template updated', data: row });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update template';
      if (/duplicate key|unique/i.test(message)) {
        return res.status(409).json({
          success: false,
          message: 'A template with this name already exists — pick another name',
          data: null,
        });
      }
      console.error('[shift-template] update failed', error);
      return res.status(400).json({ success: false, message, data: null });
    }
  }

  /** DELETE /shift-template/:id — the cover object goes with the row. */
  async remove(req: Request, res: Response) {
    try {
      const id = uuidParam(req.params.id);
      const existing = id ? await this.shiftTemplateRepository.getById(id) : null;
      const scope = await this.resolveScope(req);
      const allowed =
        existing &&
        (scope.isAdmin || (isOutletCaller(scope) && scope.outletIds.includes(existing.outletId)));
      if (!existing || !allowed || !id) {
        return res.status(404).json({ success: false, message: 'Template not found', data: null });
      }
      await this.shiftTemplateRepository.remove(id);
      // After the row is gone: an R2 hiccup must not resurrect the template,
      // and r2DeleteStoredRef already swallows/logs its own failures.
      await r2DeleteStoredRef(existing.coverImage);
      return res.json({ success: true, message: 'Template deleted', data: null });
    } catch (error) {
      console.error('[shift-template] delete failed', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to delete template', data: null });
    }
  }
}
