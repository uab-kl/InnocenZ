---
name: innocenz-daily-test-tracker
description: InnocenZ daily 4-role test tracker — repo TEST_SCRIPT.md + Google Sheet + pending daily cloud routine (blocked on Drive connector)
metadata: 
  node_type: memory
  type: project
  originSessionId: c98f75b8-c595-43fb-89e2-fa8cc1eb88ce
  modified: 2026-07-23T01:53:34.164Z
---

Daily run-through test tracking for InnocenZ's 4 roles. Owners: **jk** = PR-mobile + Admin; **SL** = Outlet + Agency (web).

**Artifacts:**
- Repo doc: `TEST_SCRIPT.md` at repo root — spine test S1–S12 (§3), solo checklists (§4), Done registry (§8), To-Do backlog with P1/P2/P3 (§9), daily Changelog (§10), daily update schedule (§7).
- Google Sheet "**InnocenZ Daily Test Tracker**" (id `1rRv10biU5iuJS-bIeJ-8pEFrPiKxFC7P1jigymsjfn4`) in Drive folder "**Innocenz Daily Test Script**" (id `1jmo1umN8DbH_778bn0icBFh2ir-L7aKu`, owner jy.ng@unitedalliedbusiness.com). Created from CSV; one tab; filterable by Section/Priority/Status.

**The spine (P1, do first):** B = Agency assign PR in roster; E = wage/tip/commission auto-sync from outlet rate card → PR; F = PR this-week dispute ↔ Agency payroll verify.

**FINAL decision (2026-07-23): Option 2 — no automation.** `TEST_SCRIPT.md` is the SINGLE source of truth; append a §10 Changelog row (columns: Date / What changed·done / Area·role link / Status) on each merge to `main`. A Google Doc is regenerated from the latest .md ON REQUEST (fresh Doc each time — recreate accepted).

**Confirmed dead ends (do NOT re-attempt):** (1) Cloud routines CANNOT use the Google Drive connector — the `schedule` skill shows zero attachable connectors even AFTER the user connected Drive at claude.ai/customize/connectors (Google Drive is a first-party connector, not exposed to routine `mcp_connections`). (2) Claude's Google Drive connector is create-only (tools: Create file, Copy file + 6 read-only; NO update, NO delete, NO cell formatting) — so it cannot edit a Doc/Sheet in place or style a Sheet. True in-place auto-sync would need a GitHub Action + Google service account (offered; user declined the setup). The plain Sheet was dropped/removed. Kept Doc: "InnocenZ Daily Test Script (v2)" id `1e9GW8aI65N0pc9wckbP1s-9TxDI88KCyl3ba_tMNbSI`. To refresh the Doc: create_file with contentMimeType text/html (BMP-safe markers only — 4-byte emoji like 🔴 mangle; use colored ● spans + P1/P2/P3), parentId `1jmo1umN8DbH_778bn0icBFh2ir-L7aKu`.

Related: [[innocenz-admin-backlog]], [[pr-mobile-backend-wiring]], [[innocenz-tier-rate-card]].
