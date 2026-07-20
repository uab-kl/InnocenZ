import { Request, Response } from 'express';
import { AgencyRepositoryClass } from './agency.repository';
import { AgencyMemberRepositoryClass } from './agency-member.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import {
  CreateAgencySchema,
  UpdateAgencySchema,
  AddAgencyMemberSchema,
  UpdateAgencyMemberSchema,
} from '@/schema/agency.schema';
import { AgencyFilter, AgencyMemberSubRole, AgencyStatus, agencyMemberSubRoleValues } from './agency.model';

function parseSubRole(value: unknown): AgencyMemberSubRole | undefined {
  if (typeof value !== 'string') return undefined;
  return (agencyMemberSubRoleValues as readonly string[]).includes(value)
    ? (value as AgencyMemberSubRole)
    : undefined;
}

export class AgencyControllerClass {
  constructor(
    private agencyRepository: AgencyRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
  ) {}

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const filter: AgencyFilter = {
        name: req.query.name as string | undefined,
        agencyCode: req.query.agencyCode as string | undefined,
        status: req.query.status as AgencyStatus | undefined,
      };
      const { agencies, totalCount } = await this.agencyRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: agencies,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[AgencyController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Batch lookup: agencies linked to the given users (used by admin PR list). */
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

      // `subRole=all` returns every sub-role (mirrors `status=all`); it is how a
      // signed-in operator resolves their own owner/finance membership. Absent
      // stays 'pr' for the admin PR list that this endpoint was built for.
      const subRoleParam = req.query.subRole as string | undefined;
      const subRole = subRoleParam === 'all' ? undefined : (parseSubRole(subRoleParam) ?? 'pr');
      const status = (req.query.status as string | undefined) ?? 'active';
      const memberships = await this.agencyMemberRepository.listMembershipsByUserIds(userIds, {
        subRole,
        status: status === 'all' ? undefined : status,
      });
      res.status(200).json({ success: true, message: 'OK', data: memberships });
    } catch (error) {
      logger.error('[AgencyController.listMemberships] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const agency = await this.agencyRepository.getById(paramId(req.params.id));
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: agency });
    } catch (error) {
      logger.error('[AgencyController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateAgencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const agencyCode = await this.agencyRepository.generateUniqueCode();
      const agency = await this.agencyRepository.create({
        ...parsed.data,
        agencyCode,
        status: 'pending_review',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Agency created', data: agency });
    } catch (error) {
      logger.error('[AgencyController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdateAgencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const agency = await this.agencyRepository.update(id, { ...parsed.data, updatedBy: getActor(req) });
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Agency updated', data: agency });
    } catch (error) {
      logger.error('[AgencyController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async approve(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, { status: 'active', updatedBy: getActor(req) });
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Agency approved', data: agency });
    } catch (error) {
      logger.error('[AgencyController.approve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async suspend(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, { status: 'suspended', updatedBy: getActor(req) });
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Agency suspended', data: agency });
    } catch (error) {
      logger.error('[AgencyController.suspend] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async listMembers(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const subRole = parseSubRole(req.query.subRole);
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const members = await this.agencyMemberRepository.listByAgency(agencyId, {
        subRole,
        status: status === 'all' ? undefined : status,
        search,
      });
      res.status(200).json({ success: true, message: 'OK', data: members });
    } catch (error) {
      logger.error('[AgencyController.listMembers] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async addMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const parsed = AddAgencyMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.agencyMemberRepository.getByAgencyAndUser(agencyId, parsed.data.userId);
      if (existing) {
        return res.status(409).json({ success: false, message: 'User is already a member of this agency', data: null });
      }
      const actor = getActor(req);
      const member = await this.agencyMemberRepository.add({
        agencyId,
        userId: parsed.data.userId,
        subRole: parsed.data.subRole,
        status: 'active',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Member added', data: member });
    } catch (error) {
      logger.error('[AgencyController.addMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateMember(req: Request, res: Response) {
    try {
      const memberId = paramId(req.params.memberId);
      const parsed = UpdateAgencyMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const member = await this.agencyMemberRepository.update(memberId, { ...parsed.data, updatedBy: getActor(req) });
      if (!member) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member updated', data: member });
    } catch (error) {
      logger.error('[AgencyController.updateMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async removeMember(req: Request, res: Response) {
    try {
      const memberId = paramId(req.params.memberId);
      const removed = await this.agencyMemberRepository.remove(memberId);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member removed', data: null });
    } catch (error) {
      logger.error('[AgencyController.removeMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
