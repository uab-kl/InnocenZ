import { Request, Response } from 'express';
import { ModuleRepositoryClass } from './module.repository';
import { ModuleType } from './module.model';
import { ModuleSchema } from '@/schema/rbac.schema';
import { paginate } from '@/util/pagination';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';

function filterModules(modules: ModuleType[], moduleName?: string, status?: string): ModuleType[] {
  return modules.filter((module) => {
    if (moduleName && !module.moduleName.toLowerCase().includes(moduleName.toLowerCase())) return false;
    if (status && module.status !== status) return false;
    return true;
  });
}

export class ModuleControllerClass {
  constructor(private moduleRepository: ModuleRepositoryClass) {}

  async getModules(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const modules = filterModules(
        await this.moduleRepository.getAllModules(),
        req.query.moduleName as string | undefined,
        req.query.status as string | undefined,
      );
      res.status(200).json({ success: true, message: 'Successfully fetched modules data', ...paginate(modules, page, pageSize) });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getModuleById(req: Request, res: Response) {
    try {
      const module = await this.moduleRepository.getModuleById(paramId(req.params.id));
      if (!module) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: module });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createModule(req: Request, res: Response) {
    try {
      const parsed = ModuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.moduleRepository.createModule({
        ...parsed.data,
        createdBy: getActor(req),
        updatedBy: getActor(req),
      });
      res.status(201).json({ success: true, message: 'Module created', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateModule(req: Request, res: Response) {
    try {
      const parsed = ModuleSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.moduleRepository.updateModule(paramId(req.params.id), {
        ...parsed.data,
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Module updated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async inactiveModule(req: Request, res: Response) {
    try {
      const data = await this.moduleRepository.updateModule(paramId(req.params.id), {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Module deactivated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
