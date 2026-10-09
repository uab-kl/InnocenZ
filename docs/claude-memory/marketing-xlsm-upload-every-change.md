---
name: marketing-xlsm-upload-every-change
description: "Owner's standing OK (8 Oct 2026): after EVERY change, upload marketing-v17-v1-v2.xlsm as a new version of the same Drive file in folder 1Ry8q893qlov_ePsY7JjMQX42PUVIs4V1 — no need to ask again"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e03eb10b-304b-437d-b23f-ca2a81413a4e
  modified: 2026-10-08T04:20:08.573Z
---

Owner, 8 Oct 2026, verbatim: *"https://drive.google.com/drive/folders/1Ry8q893qlov_ePsY7JjMQX42PUVIs4V1 can you put at here just update the marketing-v17-v1-v2.xlsm everytime if make changes"*.

**Why:** the owner works from the Drive copy (opened in Google Sheets) and generates Genspark clips from it; a fixed workbook that sits only on the local disk is invisible to them.

**How to apply:**
- After every verified workbook change, upload it as a **new version of the SAME file** (Drive ID `1VQDGONrZJ2j-aHVt5XkYj2wJ3AFK2UM1`) via Claude in Chrome → the file's ⋮ → File information → Manage versions → Upload new version. Never upload a second copy and never rename it, because the ID and link must not change.
- Before uploading, re-read Drive's `modifiedTime`. If it moved since the copy you built on, download again (`curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`) and rebuild on top of it, because an open Sheets tab saves over files.
- After uploading, download it back and byte-compare it with the built file.
- Still zip-patch the file and never round-trip it through a converter ([[never-round-trip-marketing-xlsx]]). The records rules in [[marketing-video-records-roles]] still apply.
