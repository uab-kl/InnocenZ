---
name: buildsteps-workbook-house-style
description: "How to edit Downloads/InnocenZ_BuildSteps.xlsx — must patch sheet XML directly (ExcelJS round-trip drops its 6 drawings), plus the exact style indices for each row type"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2d5daca3-17f0-489a-9c73-11b89f83101e
  modified: 2026-07-27T07:15:03.777Z
---

`C:\Users\User\Downloads\InnocenZ_BuildSteps.xlsx` is a Google-Sheets export with 6 tabs; **Build Steps** is `xl/worksheets/sheet6.xml`. Every tab carries a `xl/drawings/drawingN.xml`, so an ExcelJS **read → save round-trip silently drops all 6 drawings**. Edit by unzipping with JSZip, string-patching the sheet XML, re-zipping. Rows 1–1000 already exist as pre-materialised `s="2"` blanks, so appending = replacing an existing row range, never `spliceRows`.

**NEVER hardcode style indices from memory — always re-probe.** Opening and saving the workbook in Excel reorders both `<fills>` and `<cellXfs>`, silently repointing every `s=` you wrote. This bit once on 2026-07-27: a Section-4 banner written as `s=6` (purple before the save) rendered green after it. Two traps that caused it:

- Parse `cellXfs` with `/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g`. The naive `/<xf [\s\S]*?(\/>|<\/xf>)/g` terminates at the `<alignment/>` child and mis-indexes the whole table.
- Better still, read the `s=` off untouched reference rows and copy those: Build Steps r5 (section banner), r6 (teal sub), r7 (step), r11 (grey box, all 6 columns), r41 (blank); Overall r36 (part banner), r37 (body). For a colour no reference row uses, find the xf with the target `fillId` plus `fontId="4" borderId="1"` — that is the banner shape.

Row-type roles (indices as of the 2026-07-27 post-Excel-save state — verify, do not trust):

| Row type | Build Steps | Overall |
|---|---|---|
| Section/part banner | `6` green · `9` gold · `7` blue · `5` purple · `28` red · `23` orange | same table |
| Sub-section banner (teal) | `13` | — |
| Step / body row | `8` | `8` |
| Grey copy-paste box | A=`17` B=`18` C=`20` D,E,F=`21`, merge `C{r}:F{r}` | — |
| Footer strip (near-black) | `10` | — |
| Blank | `2` | `2` |

Column layout: A=`☐` · B=step code · C=numbered plain-word DO steps · D=📁 Where · E=✔ Check it worked · F=⏱ estimate. Widths 5/22/80/30/34/8. Grey boxes use Courier New 9 and each code line ends with a `← in plain words` note. Write cells as `t="inlineStr"` to avoid touching `sharedStrings.xml`, and remember to bump `<mergeCells count>`.

**2026-07-27:** added **SECTION 4 — WhatsApp OTP for PR account creation** (Build Steps rows 76–99, sub-sections 4A–4E, footer rewritten at row 101) and the matching **PART 9** on Overall (rows 60–66), which pushed TOP 10 NEXT ACTIONS to PART 10 and the tab title from "3 big features" to 4.

Drafted it as **SMS** first and had to rewrite the whole thing — [[otp-channel-split]] had already dropped SMS entirely in favour of WhatsApp, and the MCMC sender-registration step I documented in detail is the exact blocker that decision was made to avoid. **Check [[otp-channel-split]] and [[pr-signup-mobile]] before writing any OTP content**, even when the request says "SMS". The same draft also claimed the sign-up screens were unbuilt when `SignUpScreen.tsx` already existed. Lesson: when a request names a technology that a memory contradicts, surface the conflict before producing the artefact, not after.

Content is anchored on verified repo facts: `POST /auth/register` exists and already rejects duplicate phones, `user.phone_num` is already unique, `apps/mobile/src/lib/api.ts` already sends `channel:'whatsapp'`, and register is unauthenticated with a client-supplied `roleId` (the hole the gate closes). See [[backend-port-7777]] for local run setup.
