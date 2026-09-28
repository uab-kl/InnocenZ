import { Request, Response, NextFunction } from 'express';
import { logger } from '@/util/logger';

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    // `req.ip` honours `trust proxy` (main.ts); the raw header is client input.
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'unknown',
      responseTime: `${responseTime}ms`,
      statusCode: res.statusCode,
    });
  });

  next();
}
