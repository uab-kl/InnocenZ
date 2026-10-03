---
name: record-every-enhancement-in-the-book
description: "Owner wants EVERY enhancement recorded in the InnocenZ_latest Excel book in the same slice — page 1 \"What changed\" line + the area page's rows"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3547ef05-ac42-423f-a26b-cba36f709120
  modified: 2026-10-03T09:14:04.362Z
---

Every enhancement goes into the owner's **InnocenZ_latest** book in the same work slice, not later:
1. a dated, plain-language line at the top of page 1 START HERE → "What changed — newest first";
2. the area's own page rows — for the website chat that is page 7 The API: its row in "Gemini chat — problem report" (problem / effect / cause / fix / status / proof) and any "how it works" section it changes (e.g. "How the chat picks its Gemini model").
Then rebuild, copy to `Downloads\InnocenZ_latest.xlsx`, and tell the owner the Google Sheet (Drive folder 1Ry8q893qlov_ePsY7JjMQX42PUVIs4V1) needs re-importing — uploading it through the owner's Chrome needs a fresh OK each time.

**Why:** owner, 3 Oct 2026: *"gog recorded everytime in the excel when enhancement ?"* — page 7 was current but the page-1 change list had silently stopped at 2 Oct, so seven 3 Oct enhancements were missing from the first page the owner reads.

**How to apply:** the book is built OUTSIDE the repo (owner: *"dont modify the innocenz folder repo"* for the book) by `build_v2.py` + `result-v2.json` (page-1 highlights live in `other[key=changes].result.highlights`) + `gemini_problems.json`, kept in the session scratchpad's `book/` folder — a new session will not have them, so rebuild from the Downloads xlsx or regenerate. This book is NOT `InnocenZ_BuildSteps.xlsx` (CLAUDE.md: that one carries no dates and no log). Detailed history still goes to TEST_SCRIPT.md §10. Related: [[buildsteps-workbook-house-style]], [[verify-against-test-script]], [[sync-memory-mirrors]].
