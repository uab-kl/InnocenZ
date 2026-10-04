---
name: marketing-video-records-roles
description: "Video work: the Excel is what the videos follow, the Timeline tab is its human-readable log, the two MDs are the cross-device handoff — every entry carries weekday + date, done, next, per series (V1 v1(n) / V2 rNN)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3547ef05-ac42-423f-a26b-cba36f709120
  modified: 2026-09-27T14:50:27.626Z
---

Owner, 25 Sep 2026, verbatim in substance: the video work has two formats — **V1** (guidance,
numbered `v1(1)`, `v1(2)` … and continued in order) and **V2** (commercial ads, revised as
`r10`, `r11`, `r12` … full storyline). *"The excel is the most important of the video what
follow for, md file is for the different device take for to continue … video is the output."*

The three records and their jobs:

- **The Excel** — `marketing-v17-v1-v2.xlsm`, Drive ID `1VQDGONrZJ2j-aHVt5XkYj2wJ3AFK2UM1`,
  ONE workbook only. It is the SOURCE the videos are made from. If the Excel and a video
  disagree, the Excel wins and the video is redone.
- **The Timeline tab** — the HUMAN-READABLE version of progress, for the owner to read.
- **`JKvideorules.md` and `JKcodex.md`** — the HANDOFF so another device or session can
  continue. Each must list, per series: what is done and what is next for V1 (`v1(1)`,
  `v1(2)` …) and for every V2 revision (r10, r11, r12 …).
- **The videos** — the output, and nothing else goes in the video folders.

**Every MD entry carries the weekday and the date**, what was done that day, and what to do
next. Newest at the top; earlier records are preserved below, never deleted.

⚠️ **Preserved means WORD FOR WORD** — owner, 25 Sep 2026: *"the history of making each version
of video dont remove it"*. Rewriting an earlier revision's script IN PLACE is deleting it: on
25 Sep the r13 edit rewrote the r12 storyboards inside the r12 record, so the MDs no longer held
the words of the films actually rendered (caught before the owner relied on it, then restored).
A new revision is a NEW section on top; the old revision's text is never touched. Owner, same
day: *"other device no destroy any md or excel just follow and continue do it"* — any device or
tool (Codex included) only follows and ADDS; it never replaces or destroys the MDs or the Excel.
That rule is now written INTO both MDs' "Standing rule" and Timeline!D36, because Codex on the
other device reads those files, not this memory. When a
workbook cell is reworded, its old wording goes into the MDs' "Archive — workbook wording
replaced" section at the end. Prove it before handing over: the previous MD must appear inside
the new one whole (`new.count(old) == 1`). ⚠️ Compute the
weekday with a calendar (`python -c "import datetime;print(datetime.date(2026,9,25).strftime('%A'))"`),
never from memory: on 25 Sep 2026 Claude wrote "Thursday" into agent instructions and chat for a
date that is a FRIDAY — caught only because one agent checked it.

**Drive layout (owner, 25 Sep 2026):** the owner uploads ONLY the Excel and the two MDs as new
versions — "dont add any more md files for me". Making history lives in ONE subfolder,
"InnocenZ-history (all revisions + render kits)" `1DzWFGoPI1psdsJPJ2KoF4QSED2eUaZSY`, with
`videos-all-revisions` `1fksb3YPVx3LXL-2k6LLSNiAqawFSm8Z1` (videos only) and `render-kits`
`1dfLojkaSZSuydd_8Ct2skmIglpOpbmMJ` — "for future also": every new revision's kit goes there, and a
new revision is always NEW files (V2 r05–r10 and V1 V33 were lost to in-place uploads; the owner's PC
still held them). V1 = real app/website screen recordings; V2 = animated full-storyline ads per role
with a memory hook per selling point. The Timeline tab's section 5 is the video register.
"Latest" folders (owner, 25 Sep, replacing an earlier main-folder idea): "the latest will always
come in the latest" — new V2 films go into "V2 latest Full storyline" (1KQ6w2kEj05S3BZUwYgEHCojmMqOMyfTA,
was "V2 r12++ Full storyline"), new V1 into "InnocenZ-V1-latest.mp4" (1NtYE3fIv-4r2wgotvp4d356oIkrSEirW,
was "InnocenZ-V1-DONE.mp4"), always as NEW files; the version replaced is MOVED (same ID) into
videos-all-revisions → InnocenZ-video-history → V1 (1MHPDoBcUJfnGPOBHKdSfd_iVgPzAAywS) or
V2 (1DPBcs1qyrufBjLNSo8xrOGknowJsDvlm). V34 stays in the V1 latest folder (a new topic doesn't
replace it); next V1 renders named by topic, e.g. InnocenZ-V1-002-v35.mp4. The owner renames folders
freely — IDs never change, so always re-read Drive before writing folder NAMES into the records. ⚠️ The Drive connector signs in as jy.ng@unitedalliedbusiness.com and gets
"caller does not have permission" moving files owned by jinkgan48@gmail.com — the owner moves those.

**Handoff header (26 Sep 2026):** Codex now opens both MDs with "# START HERE: cross-device handoff" (entry
link, restore steps, next work, file IDs, folder rules). It replaced my proposed READ FIRST box — do not add a
second header. Codex's record scripts PREPEND dated sections; the older "Standing rule"/"Mistakes not to
repeat" sit far below it. r14 kit = FOUR zips `InnocenZ-V2-r14-kit-part-0N-of-04.zip` in render-kits (274 MB,
split for the 100 MB connector limit, with resume.py/requirements.txt); my single 132 MB
`InnocenZ-V2-render-kit-r14.zip` is a redundant subset the owner uploaded at 13:28. V2 latest keeps the 2
newest exports per role (owner). Codex is the active writer: re-download the newest Drive copy before building
anything, and prefer telling Codex over writing the MDs/Excel myself.

**Check after every Codex session (27 Sep 2026):** Codex reliably updates the status cells and prepends an MD
section, but it (1) re-uploads films into the SAME IDs (subtitle fix, then layout repair, then one PR cue: 3× in
one evening), (2) rewords cells without archiving the old wording (113 cells from 25–27 Sep had survived nowhere,
including the Agency r14 coverage-corrected scene rows V2!A100–F113 it rewrote in place), and (3) does not add new
videos or moves to Timeline section 5. The diff method: chain every workbook copy held locally and flag old values
found in neither the next workbook nor either MD (`lost_cells.json`, scripts `excel_fix_0927.py` / `md_fix_0927.py`).
Codex kept writing 13 min after my download, so re-read Drive modified times right before handing files over.
The in-app browser opens "anyone with link" Drive videos without login, but a fresh upload shows only its first
frame until Drive finishes processing. Folder names on 27 Sep: "V1-latest.mp4", "videos-all-revisions-historyy".

**Why:** a session on another machine starts with no memory of this one — the MDs are the only
thing that travels with the work, and a video made from a stale or inconsistent record has to be
thrown away. Found 25 Sep: the r12 scripts were identical across the Excel and both MDs
(45/45 chapters, mutation-tested), but the Excel's V2 sheet held rows 80–130 TWICE — the r12
edit appended them after row 1000 instead of replacing the empty rows — so any tool reading the
first copy of a row would have generated a video from blank scripts.

**How to apply:** at every milestone update the Excel (V2 Commercial Ads + Timeline), then both
MDs, keeping the scene text identical across all three. Before calling an Excel edit done, check
every sheet for duplicate or out-of-order `<row r>` elements as well as the counts in
[[never-round-trip-marketing-xlsx]]. The Drive connector can rename and move files but cannot
replace their contents — the owner uploads the finished file via Manage versions → Upload new
version, which keeps the file ID. Related: [[arrange-tabs-most-important-first]].
