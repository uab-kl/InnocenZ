---
name: never-round-trip-marketing-xlsx
description: "A Google-Sheets/converter round-trip of marketing.xlsx silently deleted a whole sheet, all 8 drawings and 49 of 66 formulas"
metadata: 
  node_type: memory
  type: project
  originSessionId: c6cdc664-67bd-4076-92b6-99ab40e57077
  modified: 2026-09-22T04:11:02.173Z
---

On 22 Sep 2026 `C:\Users\jinkg\Downloads\marketing.xlsx` came back from being opened and
re-saved outside desktop Excel having lost, with **no error and no repair dialog**:

- all **8** `xl/drawings/drawing*.xml` (the header artwork on every tab) and all 8
  `xl/worksheets/_rels/*`,
- the entire **Weekly Tracker** sheet, 33 rows of content,
- **49 of 66 formula cells** — every one that read that tracker, including `Start Here!E31`
  (`INDEX('Weekly Tracker'!D11:D36, COUNT(...))`), which drives the dashboard. Those cells came
  back as frozen literals, so the dashboard silently stopped updating.

**Why:** the fingerprints all point to a converter rather than Excel — inline strings rewritten
into `xl/sharedStrings.xml`, LF newlines become CRLF, every drawing and worksheet-rels entry
stripped, formulas flattened to their cached values, and the tab order changed. Google Sheets
does exactly this on an upload-and-download, and a Drive folder was in play. The package went
32 entries → 23. Not proven to be Sheets, but proven NOT to be the zip-patch: the backup taken
*before* that session's patch already showed the damage.

**How to apply:** edit this workbook in **desktop Excel only**; upload a COPY to Drive if it
needs to be viewable there. After ANY edit, before declaring it done, compare against the last
known-good backup: entry count, worksheet count, `drawings=8`, `ws_rels=8`, and the
**formula-cell count (66)** — every one of these losses is invisible in the UI, which is why
the damage survived an earlier verification pass that only read cell values. Recovery that
worked: re-apply the added sheets to `marketing.backup-22Sep.xlsx` with the JSZip patch scripts
rather than trying to repair the damaged file. Related:
[[arrange-tabs-most-important-first]], [[buildsteps-workbook-house-style]],
[[absent-evidence-is-about-the-instrument]].
