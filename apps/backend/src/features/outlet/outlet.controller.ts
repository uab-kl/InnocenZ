import { Request, Response } from 'express';
import { OutletRepositoryClass } from './outlet.repository';
import { OutletMemberRepositoryClass } from './outlet-member.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { guardMemberChange } from '@/util/member-change-guard';
import {
  CreateOutletSchema,
  UpdateOutletSchema,
  UpdateGeoFenceSchema,
  GeocodeQuerySchema,
  AddOutletMemberSchema,
  UpdateOutletMemberSchema,
} from '@/schema/outlet.schema';
import { addressQueryFromOutlet, geocodeAddress } from './geocode';
import { OutletFilter, OutletStatus } from './outlet.model';
import { saveOrgLogoFromBase64 } from '@/util/org-logo';
import { r2DeleteStoredRef } from '@/util/r2';

export class OutletControllerClass {
  constructor(
    private outletRepository: OutletRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
  ) {}

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const filter: OutletFilter = {
        name: req.query.name as string | undefined,
        status: req.query.status as OutletStatus | undefined,
        onboardedByAgencyId: req.query.onboardedByAgencyId as string | undefined,
      };
      const { outlets, totalCount } = await this.outletRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: outlets,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[OutletController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Batch lookup: outlets linked to the given users. Resolves the signed-in
   * operator's own outlet + role at session start (mirrors agency memberships). */
  async listMemberships(req: Request, res: Response) {
    try {
      const raw = (req.query.userIds as string | undefined) ?? '';
      const userIds = raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (userIds.length === 0) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      if (userIds.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'At most 200 userIds can be requested at once',
          data: null,
        });
      }
      const status = (req.query.status as string | undefined) ?? 'active';
      const memberships = await this.outletMemberRepository.listMembershipsByUserIds(userIds, {
        status: status === 'all' ? undefined : status,
      });
      res.status(200).json({ success: true, message: 'OK', data: memberships });
    } catch (error) {
      logger.error('[OutletController.listMemberships] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const outlet = await this.outletRepository.getById(paramId(req.params.id));
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: outlet });
    } catch (error) {
      logger.error('[OutletController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateOutletSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const outlet = await this.outletRepository.create({
        ...parsed.data,
        lat: parsed.data.lat !== undefined ? String(parsed.data.lat) : undefined,
        lng: parsed.data.lng !== undefined ? String(parsed.data.lng) : undefined,
        status: 'pending_review',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Outlet created', data: outlet });
    } catch (error) {
      logger.error('[OutletController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdateOutletSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const {
        lat,
        lng,
        logoBase64,
        logoFileName,
        logoContentType,
        clearLogo,
        ...rest
      } = parsed.data;
      const addressTouched =
        rest.addressLine1 !== undefined ||
        rest.addressLine2 !== undefined ||
        rest.city !== undefined ||
        rest.postcode !== undefined ||
        rest.state !== undefined ||
        rest.country !== undefined;
      let outlet = await this.outletRepository.update(id, {
        ...rest,
        lat: lat !== undefined ? String(lat) : undefined,
        lng: lng !== undefined ? String(lng) : undefined,
        updatedBy: getActor(req),
      });
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      // Logo is not a column on the Zod rest shape that maps 1:1 — strip above,
      // then upload to R2 (or clear) and store only the object key. Always
      // delete the previous R2 object so Remove does not leave an orphan.
      const previousLogo = outlet.logoImage;
      if (clearLogo) {
        await r2DeleteStoredRef(previousLogo);
        const cleared = await this.outletRepository.update(id, {
          logoImage: null,
          updatedBy: getActor(req),
        });
        if (cleared) outlet = cleared;
      } else if (logoBase64 && logoFileName) {
        try {
          const logoKey = await saveOrgLogoFromBase64({
            kind: 'outlet',
            orgId: outlet.id,
            orgName: outlet.name,
            fileName: logoFileName,
            contentType: logoContentType,
            base64: logoBase64,
          });
          const withLogo = await this.outletRepository.update(id, {
            logoImage: logoKey,
            updatedBy: getActor(req),
          });
          if (withLogo) outlet = withLogo;
          // New key uploaded — drop the old object (ignore if same / missing).
          if (previousLogo && previousLogo !== logoKey) {
            await r2DeleteStoredRef(previousLogo);
          }
        } catch (logoError) {
          const msg =
            logoError instanceof Error ? logoError.message : 'Logo upload failed';
          return res.status(400).json({ success: false, message: msg, data: null });
        }
      }

      // The check-in fence must FOLLOW the venue: an address edit re-geocodes
      // the saved address and moves the pin in the same save, so the fence can
      // never keep guarding the old street. Callers that place a pin
      // explicitly (the geo-fence card) are left alone, and a failed lookup
      // keeps the previous pin rather than un-fencing the venue.
      let message = 'Outlet updated';
      if (addressTouched && lat === undefined && lng === undefined) {
        const outcome = await geocodeAddress(addressQueryFromOutlet(outlet));
        if (outcome.ok && outcome.candidates[0]) {
          const top = outcome.candidates[0];
          const moved = await this.outletRepository.update(id, {
            lat: String(top.lat),
            lng: String(top.lng),
            updatedBy: getActor(req),
          });
          if (moved) {
            outlet = moved;
            message = 'Outlet updated — check-in pin moved to the new address';
          }
        } else {
          logger.warn(
            `[OutletController.update] address changed for outlet ${id} but geocode gave no match — pin left where it was`,
          );
        }
      }

      res.status(200).json({ success: true, message, data: outlet });
    } catch (error) {
      logger.error('[OutletController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async setGeoFence(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdateGeoFenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const outlet = await this.outletRepository.update(id, {
        lat: String(parsed.data.lat),
        lng: String(parsed.data.lng),
        geoFenceRadius: parsed.data.geoFenceRadius,
        updatedBy: getActor(req),
      });
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Geo-fence updated', data: outlet });
    } catch (error) {
      logger.error('[OutletController.setGeoFence] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * DELETE /outlet/:id/geo-fence
   * Drops the pin, which turns attendance verification back OFF for the venue:
   * verifyWithinGeoFence measures nothing once lat/lng are null, so every
   * check-in here is accepted again. The radius is left alone so re-pinning the
   * venue later keeps the distance the operator already chose.
   */
  async clearGeoFence(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const outlet = await this.outletRepository.update(id, {
        lat: null,
        lng: null,
        updatedBy: getActor(req),
      });
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Geo-fence removed', data: outlet });
    } catch (error) {
      logger.error('[OutletController.clearGeoFence] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * GET /outlet/geocode?address=...
   * Address -> candidate pins. Saves nothing; the operator confirms one and
   * commits it through setGeoFence, which is the only path that turns fencing
   * on for a venue.
   */
  async geocode(req: Request, res: Response) {
    try {
      const parsed = GeocodeQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const outcome = await geocodeAddress(parsed.data.address);
      if (!outcome.ok) {
        // 404 for "nothing matched"; 503 for a key/quota/network problem, so the
        // form can tell "try another address" apart from "try again later".
        const status = outcome.reason === 'no_match' ? 404 : 503;
        return res.status(status).json({ success: false, message: outcome.message, data: null });
      }
      res.status(200).json({ success: true, message: 'OK', data: outcome.candidates });
    } catch (error) {
      logger.error('[OutletController.geocode] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * GET /outlet/:id/geocode
   * Same lookup, but built from the outlet's OWN stored address columns — the
   * common case, since the address was already typed during onboarding. Still
   * read-only.
   */
  async geocodeOwnAddress(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const outlet = await this.outletRepository.getById(id);
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const address = addressQueryFromOutlet(outlet);
      if (address.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'This outlet has no address saved yet — add one, or drop the pin on the map.',
          data: null,
        });
      }
      const outcome = await geocodeAddress(address);
      if (!outcome.ok) {
        const status = outcome.reason === 'no_match' ? 404 : 503;
        return res.status(status).json({ success: false, message: outcome.message, data: null });
      }
      res.status(200).json({ success: true, message: 'OK', data: { query: address, candidates: outcome.candidates } });
    } catch (error) {
      logger.error('[OutletController.geocodeOwnAddress] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async approve(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const outlet = await this.outletRepository.update(id, { status: 'active', updatedBy: getActor(req) });
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Outlet approved', data: outlet });
    } catch (error) {
      logger.error('[OutletController.approve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async suspend(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const outlet = await this.outletRepository.update(id, { status: 'suspended', updatedBy: getActor(req) });
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Outlet suspended', data: outlet });
    } catch (error) {
      logger.error('[OutletController.suspend] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // --- Members ---

  async listMembers(req: Request, res: Response) {
    try {
      const outletId = paramId(req.params.id);
      const existing = await this.outletRepository.getById(outletId);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      const members = await this.outletMemberRepository.listByOutletWithUser(outletId);
      res.status(200).json({ success: true, message: 'OK', data: members });
    } catch (error) {
      logger.error('[OutletController.listMembers] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async addMember(req: Request, res: Response) {
    try {
      const outletId = paramId(req.params.id);
      const parsed = AddOutletMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.outletMemberRepository.getByOutletAndUser(outletId, parsed.data.userId);
      if (existing) {
        return res.status(409).json({ success: false, message: 'User is already a member of this outlet', data: null });
      }
      const actor = getActor(req);
      const member = await this.outletMemberRepository.add({
        outletId,
        userId: parsed.data.userId,
        subRole: parsed.data.subRole,
        status: 'active',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Member added', data: member });
    } catch (error) {
      logger.error('[OutletController.addMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateMember(req: Request, res: Response) {
    try {
      const outletId = paramId(req.params.id);
      const memberId = paramId(req.params.memberId);
      const parsed = UpdateOutletMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      // The route's scope guard proves the caller owns the outlet in `:id`, and
      // says nothing about `:memberId` — the row actually being written. Without
      // this, an operator could address their OWN venue and mutate a member of
      // somebody else's. 404, not 403: a foreign member id must not be confirmed.
      const target = await this.outletMemberRepository.getById(memberId);
      if (!target || target.outletId !== outletId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const members = await this.outletMemberRepository.listByOutlet(outletId);
      const refusal = guardMemberChange({ members, target, next: parsed.data });
      if (refusal) {
        return res.status(409).json({ success: false, message: refusal, data: null });
      }

      const member = await this.outletMemberRepository.update(memberId, { ...parsed.data, updatedBy: getActor(req) });
      if (!member) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member updated', data: member });
    } catch (error) {
      logger.error('[OutletController.updateMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async removeMember(req: Request, res: Response) {
    try {
      const outletId = paramId(req.params.id);
      const memberId = paramId(req.params.memberId);

      // Same two checks as updateMember, and for the same reasons.
      const target = await this.outletMemberRepository.getById(memberId);
      if (!target || target.outletId !== outletId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const members = await this.outletMemberRepository.listByOutlet(outletId);
      const refusal = guardMemberChange({ members, target });
      if (refusal) {
        return res.status(409).json({ success: false, message: refusal, data: null });
      }

      const removed = await this.outletMemberRepository.remove(memberId);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member removed', data: null });
    } catch (error) {
      logger.error('[OutletController.removeMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
