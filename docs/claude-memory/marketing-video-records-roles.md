---
name: marketing-video-records-roles
description: "Video work: the Excel is what the videos follow, the Timeline tab is its human-readable log, the two MDs are the cross-device handoff — every entry carries weekday + date, done, next, per series (V1 v1(n) / V2 rNN)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3547ef05-ac42-423f-a26b-cba36f709120
  modified: 2026-09-25T08:51:51.830Z
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
