import { Request } from 'express';

export function getActor(req: Request): string {
  return req.user?.email ?? req.user?.phoneNum ?? 'system';
}
