import { Request } from 'express';

/** Stamp for unauthenticated / system-driven writes (e.g. public register). */
export const SYSTEM_ACTOR = 'system';
export function getActor(req: Request): string {
  return req.user?.id ?? SYSTEM_ACTOR;
}
