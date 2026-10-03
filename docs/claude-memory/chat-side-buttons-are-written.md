---
name: chat-side-buttons-are-written
description: "Landing chat side buttons (\"I run an agency\"…) are answered by GEMINI as a \"side pick\" whose page path the server guarantees (owner's final call, 3 Oct 2026) — not the written intro"
metadata:
  node_type: memory
  type: project
  originSessionId: 3547ef05-ac42-423f-a26b-cba36f709120
  modified: 2026-10-03T11:39:50.923Z
---

The landing chat's four side buttons — "I'm a PR", "I run an agency", "I run an outlet", "Something else" — are answered by **Gemini**, like every other reply (owner's 1 Oct rule: "the chatbot reply from the gemini api, no hardcoded"), but as a **side pick**: the page sends `sidePick: true`, the server tells Gemini how many numbered steps that side's Overview has (`overviewStepCount`: PR 6, agency 7, outlet 8), lets the reply carry them all, and refuses a reply missing more than one (`accept` in `raceModels` → the next model answers; the short reply is never remembered). The written intro (`CHAT_INTROS`) is only the backup when no model keeps the pages.

**Why:** owner, 3 Oct 2026. Gemini's backup model had answered "I run an agency" with one sentence and no pages; the owner first chose "Keep written page path" (side buttons hard-coded), then the same evening: *"can make all reply is come from the gemini * keep the UI"* — so Gemini answers, and the server enforces the page-path look. Final state = (x) in TEST_SCRIPT §10; (ix) is superseded.

**How to apply:** do not switch side buttons back to the written intro, and do not drop the `accept` check or the raised step cap — without them Gemini sometimes returns a bare welcome and the 7th/8th steps are cut at 6. Editing a side's page path = edit `CHAT_INTROS` then `pnpm chat:facts` (Gemini's Overview comes from the same text); if an Overview heading is renamed, the `overviewStepCount` test fails until `OVERVIEW_FOR` in landing-chat.service.ts is updated. Related: [[record-every-enhancement-in-the-book]].

**Update, later 3 Oct:** the check is by page NAME, not count — `overviewStepLabels` + `keepsPagePath` (a 中文 agency reply once labelled all 7 steps "总览 Overview" and passed a count-only check). "Something else" is a side pick too: its Overview has 4 POINTS, counted as steps; and the not-sure rule (off-topic replies) must never fire on the site's own buttons. All 8 side taps (EN/中文) were checked live.
