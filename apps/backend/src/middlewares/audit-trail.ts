import { Request, Response, NextFunction } from 'express';
import { authRepository as defaultAuthRepository } from '@/composition-root.js';
import { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { logger } from '@/util/logger.js';
import { Error } from '@/error/index.js';

interface AuditTrailType {
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

export enum AuditTrailAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
}

export const createAuditTrailMiddleware = (
  authRepository: AuthRepositoryClass = defaultAuthRepository,
) => {
  return (action: AuditTrailAction) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      let user = req.user;

      if (!user) {
        const token = req.header('Authorization')?.split(' ')[1];
        if (!token) {
          logger.error('Audit Trail: access token is missing or invalid');
          res.status(401).json({ message: Error.UNAUTHORIZED });
          return;
        }

        user = (await authRepository.getUserDataByToken(token)) ?? undefined;
        if (!user) {
          logger.error('Audit Trail: user could not be retrieved');
          res.status(401).json({ message: Error.UNAUTHORIZED });
          return;
        }
      }

      const entity = req.body as AuditTrailType;
      const actor = user.email ?? user.phoneNum ?? user.id;

      if (action === AuditTrailAction.CREATE) {
        entity.createdBy = actor;
        entity.updatedBy = actor;
      } else if (action === AuditTrailAction.UPDATE) {
        entity.updatedBy = actor;
        entity.updatedAt = new Date();
      }

      next();
    };
  };
};

export const auditTrailMiddleware = createAuditTrailMiddleware();
