import { Router, Request, Response } from 'express';
import { portalRepository } from './portal.repository';
import { Error } from '@/error/index';

const portalRoutes = Router();

portalRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const data = await portalRepository.getAllPortals();
    return res.status(200).json({ success: true, message: 'OK', data });
  } catch {
    return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
  }
});

portalRoutes.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code ?? '');
    const data = await portalRepository.getPortalByCode(code);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Portal not found', data: null });
    }
    return res.status(200).json({ success: true, message: 'OK', data });
  } catch {
    return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
  }
});

export default portalRoutes;
