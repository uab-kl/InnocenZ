---
name: audit-update-cadence
description: "STANDING INSTRUCTION — update the published audit artifact after EVERY change, not at the end of a session. Includes the republish mechanics that are easy to get wrong."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 87e19249-6c61-4544-bb60-dc76df7f3630
  modified: 2026-07-30T11:31:52.882Z
---

**Update the audit after every change. Not at the end of the session, not when asked — every time.**

Stated explicitly by the user on 30 Jul 2026 after a slice where I committed code and reported back
without touching the audit. Until then it was recorded only as an inference ("the user asks for it
after almost every piece of work"); it is now a rule.

**Why:** the audit is how the user reads project state — more than the commits, more than my summary
message. A commit the audit does not mention is, from their side, work that did not happen. It is
also the artifact they share onward, so a stale page misinforms other people, not just them.

**How to apply:**

- After each commit, patch the audit and republish. A one-line HEAD/unpushed bump is a legitimate
  update — do not wait to accumulate something "worth" publishing.
- **Republish by passing the same `url`** to the Artifact tool
  (`https://claude.ai/code/artifact/0c66cb02-c767-4a67-ad9d-617e399983b3`). Without `url`, a session
  that did not originally publish it mints a NEW link and the user loses the one they have.
- A new session has no source file. **The published HTML is saved to disk by WebFetch** — and the
  prior session's scratchpad copy usually still exists under
  `%LOCALAPPDATA%\Temp\claude\C--Users-User-Documents-Cursor-InnocenZ\<session>\scratchpad\`.
  Copy the newest into the current session's scratchpad and patch it with Edit. **Never rebuild the
  page from scratch** — it is ~150 KB of accumulated reasoning.
- Publishing 409s until this session has fetched the live version. WebFetch the URL first; that also
  proves nobody else changed it underneath you. **Do not use `force`** unless the user asks to
  overwrite another session's version.
- Convention: a closed finding stays on the page **struck through with a green fix note**, never
  deleted. The point is to show what moved.
- Check the page does not contradict itself after an edit — section ledes and scoreboard tiles go
  stale independently of the entries under them. See [[audit-entries-are-leads]].

Related: [[current-state-and-audit]] holds the URL and the rest of the resume state.
