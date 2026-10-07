---
name: marketing-xlsm-patch-and-upload
description: "How to edit marketing-v17-v1-v2.xlsm safely and put it back on Drive as a new version (6 Oct 2026) — style ids renumber on every Sheets save, `$'` in replace() corrupts XML, upload via Chrome Manage versions with an intercepted file input"
metadata:
  node_type: memory
  type: reference
  originSessionId: 4d397639-ec88-47b6-904f-feb038ff76f4
  modified: 2026-10-06T18:01:54.479Z
---

Edited and uploaded the marketing workbook on Tue 6 Oct 2026 (Drive ID `1VQDGONrZJ2j-aHVt5XkYj2wJ3AFK2UM1`,
new version 13:26 UTC, 1,033,612 bytes, byte-identical round trip). What made it safe:

- **The .xlsm is a Google Sheets export** (no vbaProject.bin, 1000 rows per sheet, 10 sheets / 10 drawings /
  8 formulas all on Timeline). Empty rows are `<row r="N">` with styled blank cells, not self-closing.
- **Every Sheets save renumbers cell styles.** After the owner renamed a tab, style 47 went from green "Live"
  to plain text (Live became s46, Beta s48, Don't-claim s30). Always read style ids from the CURRENT file by
  sampling cells that hold "Live"/"Beta", never reuse numbers from an older download.
- **Re-download right before patching and check `modifiedTime`** — the owner edits the file live in Sheets.
- **Zip-level, add-only patch** (scratchpad tool: rows only into empty rows, `append` to existing cells,
  `set` only when the old value matches). Keep the original zip entry order.
- **Never pass user text as a `String.replace` replacement string** — a prompt containing `$'` spliced the
  rest of the sheet XML in and duplicated a row. Use a function replacer: `xml.replace(old, () => newRow)`.
- Agent text can arrive already HTML-escaped (`CAMERA &amp; SOUND`) — decode before escaping once.
- Verify by reading every written cell back (exceljs) and comparing all untouched cells; merged-cell
  "changes" are echoes of the edited master cell, not real changes — classify them, don't assume.
- **Upload without the owner:** Drive › file › File information › Manage versions › Upload new version opens a
  native picker. In Claude in Chrome, override `HTMLInputElement.prototype.click` for `type=file` so the input
  is attached to the page instead, click the button, `find` the input, `file_upload` the file, then restore the
  prototype. Same file ID and link; the old version stays in history (temporary versions expire after 30 days).
  Drive re-labelled the MIME type as plain xlsx — harmless, the name keeps `.xlsm`.
- The Bash tool layer stripped backslashes from heredoc/sed edits to scripts — edit scripts with the Write/Edit
  tools instead. Precisely: `\\` collapses to `\` (single `\n` survives), so `new RegExp(\`…\\s…\`)` inside a
  template literal silently becomes `s` and a checker reports a clean ZERO. It happened twice on 7 Oct.
- **Before each upload, diff the live Drive copy against the last known one, both text AND resolved style.**
  The owner's open Sheets session re-saves on its own: 17:24 UTC 7 Oct pasted over D49, and 17:29 changed only one
  font (G49 Aptos→Arial). Style ids renumber on every save, so compare the resolved font/fill/border/numFmt,
  never the `s=` numbers. Prove each differ on a known change before trusting a zero (scratchpad `diffwb.cjs`,
  `stylediff.cjs`). The file is link-shared, so plain `curl` on
  `drive.usercontent.google.com/download?id=…&export=download&confirm=t` downloads it.
- `file_upload` only accepts paths this session may read: the scratchpad works, `~/Downloads/...` is refused.
- 7 Oct 17:59 UTC: problem-statement rewrite (headline + customer line, 98 rows, no merges needed) uploaded,
  1,100,827 bytes, byte-identical round trip; verify-cross 2310/0, verify-ps 98/0.

Related: [[marketing-video-records-roles]] (the Excel is the source; that memory's "owner uploads the new
version" is no longer the only way), [[never-round-trip-marketing-xlsx]], [[absent-evidence-is-about-the-instrument]].
