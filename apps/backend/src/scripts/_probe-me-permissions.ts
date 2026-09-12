// Does /auth/me return modulePermissions for every lane? READ-ONLY.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

const rows: Array<{lane:string;email:string;org:string|null;kind:string|null}> = [];
for (const [tbl, fk, kind] of [['outlet_user','outlet_id','outlet'],['agency_user','agency_id','agency']] as const) {
  const r = await db.execute(sql`
    select distinct on (m.sub_role) m.sub_role, u.email, m.${sql.raw(fk)} as org
    from main.${sql.raw(tbl)} m join main."user" u on u.id = m.user_id
    where m.status='active' and u.email is not null
      and not exists (select 1 from main.user_role ur join main.role r on r.id=ur.role_id
                      where ur.user_id=u.id and r.role_name='admin')
    order by m.sub_role, u.email`);
  for (const x of (r.rows ?? r) as any[]) rows.push({lane:`${kind}/${x.sub_role}`, email:x.email, org:x.org, kind});
}
rows.push({lane:'admin', email: process.env.DEFAULT_ADMIN_EMAIL ?? 'uab.innocenz@gmail.com', org:null, kind:null});

let empty=0;
for (const w of rows) {
  const h: Record<string,string> = { Authorization: `Bearer ${jwt.generateAccessToken({loginMethod:'email',loginCriteria:w.email} as never)}` };
  if (w.org && w.kind) { h['x-org-id']=w.org; h['x-org-kind']=w.kind; }
  const res = await fetch(`${BASE}/auth/me`, { headers: h });
  const b: any = await res.json();
  // ⚠️ the API field is `permissions`; `modulePermissions` is the WEB's name
  //    for it after use-profile maps it. Reading the wrong one showed 0 for
  //    every lane and looked like a total outage.
  const mp = b?.data?.permissions ?? [];
  if (mp.length === 0) empty++;
  console.log(`${w.lane.padEnd(24)} http=${res.status} modulePermissions=${String(mp.length).padEnd(4)} portals=${JSON.stringify(b?.data?.portals ?? [])}`);
}
console.log(`\n${empty} of ${rows.length} lanes received NO module permissions.`);
process.exit(0);
