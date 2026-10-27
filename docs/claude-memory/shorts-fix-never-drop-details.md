---
name: shorts-fix-never-drop-details
description: "Owner, 12 Oct 2026: when fixing the Seedance/Higgsfield short prompts, never remove important details — only repetition may go; prove it with a before/after detail check"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4d397639-ec88-47b6-904f-feb038ff76f4
  modified: 2026-10-12T08:02:56.576Z
---

Owner, 12 Oct 2026, verbatim: *"dont throw the details that to make this shorts , keep the important details"* and, on seeing
the version history, *"is this ok the prompt is getting longer , when i call you fix dont remove the important details"*.

**Why:** the details (person, covered outfit, hair/tears by time, bar, problem props in the background, emotions, gestures,
framing anchors, title/subtitle/card/end-card text, sound cues, lip-sync seconds) are what make each short look right; the
owner would rather have a longer prompt than a thinner video.

**How to apply:**
- A fix may ADD what is needed; it may only REMOVE repetition (a part restating the person/place, "pasted alone" lines, a
  rule said twice). Never trim a detail to save characters.
- After any rebuild, run the sentence-level detail check (every source sentence's content words must still appear; scratchpad
  `sd/` one-liner, proved by deleting a PLACE paragraph → flags 3 → 8) and show the owner what disappeared and why.
- Length: rows are 12,750–13,290 characters after the 12 Oct 08:01 brand/cards/link fix (12,000–12,500 after the
  one-paste rebuild); a 13,500-character paste is proven to render all three parts. If a fix pushes a row past ~13,500,
  say so before uploading rather than cutting detail silently.
- The detail check is `sd/detailcheck.cjs <old-dir> <new-dir>`: every content word (4+ letters) that vanished, per row —
  only the words the fix meant to replace may appear.

Related: [[v2-shorts-prompt-style-08oct]].
