import { Request, Response } from 'express';
import { LimitTypeRepositoryClass } from './limit-type.repository.js';
import { LimitType } from './limit-type.model.js';
import { LimitTypeSchema } from '@/schema/subscription.schema.js';
import { paginate } from '@/util/pagination.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { Error } from '@/error/index.js';

function filterLimitTypes(
  limitTypes: LimitType[],
  code?: string,
  name?: string,
  status?: string,
): LimitType[] {
  return limitTypes.filter((limitType) => {
    if (code && !limitType.code.toLowerCase().includes(code.toLowerCase())) return false;
    if (name && !limitType.name.toLowerCase().includes(name.toLowerCase())) return false;
    if (status && limitType.status !== status) return false;
    return true;
  });
}

export class LimitTypeControllerClass {
  constructor(private limitTypeRepository: LimitTypeRepositoryClass) {}

  async getLimitTypes(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const limitTypes = filterLimitTypes(
        await this.limitTypeRepository.getAllLimitTypes(),
        req.query.code as string | undefined,
        req.query.name as string | undefined,
        req.query.status as string | undefined,
      );
      res.status(200).json({ success: true, message: 'Successfully fetched limit types', ...paginate(limitTypes, page, pageSize) });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getLimitTypeById(req: Request, res: Response) {
    try {
      const limitType = await this.limitTypeRepository.getLimitTypeById(paramId(req.params.id));
      if (!limitType) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: limitType });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createLimitType(req: Request, res: Response) {
    try {
      const parsed = LimitTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.limitTypeRepository.createLimitType({
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        configSchema: parsed.data.configSchema ?? null,
        status: parsed.data.status,
        createdBy: getActor(req),
        updatedBy: getActor(req),
      });
      if (!data) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Limit type created', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateLimitType(req: Request, res: Response) {
    try {
      const parsed = LimitTypeSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.limitTypeRepository.updateLimitType(paramId(req.params.id), {
        ...parsed.data,
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Limit type updated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async inactiveLimitType(req: Request, res: Response) {
    try {
      const data = await this.limitTypeRepository.updateLimitType(paramId(req.params.id), {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Limit type deactivated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
