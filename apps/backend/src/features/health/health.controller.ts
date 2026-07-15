import { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';

class HealthControllerClass {
  healthCheck(_req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      message: 'OK',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    });
  }

  async dbHealthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      await db.execute(sql`SELECT 1`);
      const responseTime = Date.now() - startTime;

      res.status(200).json({
        success: true,
        message: 'Database connection healthy',
        data: {
          status: 'healthy',
          responseTimeMs: responseTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('[HealthController.dbHealthCheck] Database connection error:', error);
      res.status(500).json({
        success: false,
        message: Error.DATABASE_CONNECTION_ERROR,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

export { HealthControllerClass };
