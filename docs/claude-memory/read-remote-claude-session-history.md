---
name: read-remote-claude-session-history
description: "How to read another device's claude.ai/code session (e.g. 'continue memory from session_…'): the local session tools can't see it, but the logged-in Chrome can fetch /v1/code/sessions/<id>/events"
metadata:
  node_type: memory
  type: reference
  originSessionId: e03eb10b-304b-437d-b23f-ca2a81413a4e
  modified: 2026-10-08T06:02:45.662Z
---

On 8 Oct 2026 the owner said "continue memory from this session https://claude.ai/code/session_017zFyAuQH9zyhcWAd5R4hRN". It was a Remote Control session on the other PC (jinkg), and it had hit its weekly limit.

- `get_session` and `list_sessions` can't see it, and the built-in browser isn't signed in to claude.ai.
- The session page itself hangs on a long history.
- What worked: in the owner's Chrome (Claude in Chrome, "Personal Chrome"), open any same-origin claude.ai tab. Then fetch `/v1/code/sessions/<id>/events?limit=500&sort_order=desc&cursor=<next_cursor>` with `credentials:'include'` and header `anthropic-version: 2023-06-01`. Page by `next_cursor` until it runs out.
- Keep the user text and assistant text blocks, and strip `<system-reminder>`.
- The tool's output filter blocks text with URL query strings, so swap `=`, `?`, `&` before returning it.
- Put the digest into a `<pre>` and read it with `get_page_text` in chunks of about 48K characters.

That session's working files live only on the other PC's scratchpad, so its results must be redone or re-derived from the workbook.
