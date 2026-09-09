---
name: new-outlet-needs-starter-templates
description: A new InnocenZ outlet gets its 12 starter event templates automatically at creation — they are the venue's examples to delete, so nothing may ever re-run the seeding
metadata:
  type: project
---

**Creating an outlet now creates its 12 starter event cards automatically** (9 Sep 2026). Do NOT
add them by hand — the earlier version of this note said to, and that is obsolete.

`features/shift-template/starter-templates.ts` owns the list and `createStarterTemplates()`.
It is called from BOTH ways a venue can come into existence:

- public sign-up — `AuthController.createOrgForSignup`, outlet branch
- admin-only `POST /outlet` — `OutletController.create`

Wiring it to one only would have made the gallery depend on which door the venue came through.

**They are EXAMPLES, not fixtures (owner, 9 Sep 2026).** The venue renames, re-covers and deletes
them freely.

⚠️ **Which is why the seeding runs ONCE, at creation, and nothing may call it on boot, on login,
or from a job.** A second run re-inserts cards a venue deliberately removed, and the venue has no
way to make them stay gone — the failure `initRoles()` already has with roles, where a deleted
role reappears on the next backend start. `onConflictDoNothing` guards against duplicates, NOT
against resurrection. `seed-shift-templates.ts` still walks every active venue and will do exactly
this: it is now for covers and backfill only, and carries that warning at the top.

**Deleting a template is safe**, and this was checked on the live database, not inferred:
`shift.template_id` carries an **ON DELETE SET NULL** foreign key (`confdeltype = 'n'`). It lives
in the DDL only, not the Drizzle model — a `.references()` there would be a module cycle — so it
reads as "no FK at all" if you only look at the model. Every read path LEFT joins, and a shift
keeps its own `event_name` / `event_kind`, so no shift vanishes and the night keeps its identity.
The only loss is the cover picture on past shifts, whose R2 object is deleted with the row.

**Creation deliberately does two things less than a hand-run seed:**

- It **cannot roll back the registration.** A venue that outlives its plan cannot be billed, so
  those commit together; example cards carry no such weight, so failure is caught and logged.
- It writes **no covers.** Sign-up will not wait on an R2 upload, and the gallery renders a
  styled placeholder until the venue uploads its own through the edit pencil. There is still no
  committed source for the 8 default pictures — they exist only in R2 and on one machine's disk,
  so a venue created today starts with placeholders.

Related: [[innocenz-database-rules]], [[outlet-post-job-today-calendar]].
