import { Request, Response, NextFunction } from 'express';
import { logger } from '@/util/logger';
import { fetchAuditOldData } from '@/features/audit-log/audit-log.repository';
import { logRestMutation, redactSensitive, resolveEntityFromPath, resolveRestAction } from '@/features/audit-log/audit-log.wrapper';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function platformAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.originalUrl.split('?')[0].endsWith('/health')) {
    next();
    return;
  }

  const path = req.originalUrl.split('?')[0];
  const action = resolveRestAction(req.method, path);
  if ((action === 'UPDATE' || action === 'DELETE') && !req.auditLogged) {
    try {
      const entity = resolveEntityFromPath(path);
      req.auditOldData = await fetchAuditOldData(entity, req);
    } catch (error) {
      logger.warn('[platformAuditMiddleware] Failed to fetch old data for audit log', error);
    }
  }

  let responseBody: unknown = null;
  const originalJson = res.json.bind(res);
  res.json = function patchedJson(body: unknown) {
    responseBody = body;
    return originalJson(body);
  };

  const requestBody = redactSensitive(req.body);

  res.on('finish', () => {
    if (req.auditLogged) {
      return;
    }

    void logRestMutation(req, res.statusCode, requestBody, responseBody).catch((error) => {
      logger.error('[platformAuditMiddleware] Failed to write audit log', error);
    });
  });

  next();
}
