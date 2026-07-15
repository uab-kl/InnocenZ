import { Request, Response } from 'express';
import { OutletRepositoryClass } from './outlet.repository';
import { OutletMemberRepositoryClass } from './outlet-member.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import {
  CreateOutletSchema,
  UpdateOutletSchema,
  UpdateGeoFenceSchema,
  AddOutletMemberSchema,
  UpdateOutletMemberSchema,
} from '@/schema/outlet.schema';
import { OutletFilter, OutletStatus } from './outlet.model';

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
        subscriptionId: req.query.subscriptionId as string | undefined,
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
      const { lat, lng, ...rest } = parsed.data;
      const outlet = await this.outletRepository.update(id, {
        ...rest,
        lat: lat !== undefined ? String(lat) : undefined,
        lng: lng !== undefined ? String(lng) : undefined,
        updatedBy: getActor(req),
      });
      if (!outlet) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Outlet updated', data: outlet });
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
      const members = await this.outletMemberRepository.listByOutlet(outletId);
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
      const memberId = paramId(req.params.memberId);
      const parsed = UpdateOutletMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
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
      const memberId = paramId(req.params.memberId);
      const removed = await this.outletMemberRepository.remove(memberId);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member removed', data: null });
    } catch (error) {
      logger.error('[OutletController.removeMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
