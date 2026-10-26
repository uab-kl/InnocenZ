---
name: chat-model-languages-en-zh-only
description: Landing-chat model choice is judged on English (incl. Manglish) and 中文 only — Malay is not a requirement because the app has no Malay option
metadata:
  node_type: memory
  type: project
  originSessionId: c6149557-0222-4a06-a504-22fe17a46c02
  modified: 2026-10-12T02:45:36.235Z
---

When comparing AI models for the landing chat, judge language quality on **English (Manglish included) and 中文 only**. Malay is NOT a selection criterion.

**Why:** the team said so on 12 Oct 2026 ("malay should not be worried over as our app currently does not include malay options"). The code agrees: portals `SUPPORTED_LOCALES = ["en", "zh"]` (apps/web/src/lib/portal-i18n/locale-prefs.ts) and the landing page is `"en" | "zh"`. The "malay" keys in the portal translations are PR profile fields (spoken language, race), not a UI language.

**How to apply:** in model comparisons (workbook "7 The API" row 197+, the "Landing Chat Model Comparison" artifact), drop "Malay untested" as a weakness and weigh 中文 quality instead. Visitors may still TYPE Malay or Manglish; the written backup's ~1,200 phrasings cover that, and it is not a reason to prefer a model. Revisit only if a Malay UI option is added. Related: [[chat-follows-the-system]].
