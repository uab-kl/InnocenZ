---
name: click-through-testing-techniques
description: "How to click-test all 4 roles in the Browser pane — per-tab pinned sessions, shared locale, toasts that vanish, MC photo upload without a camera, and reading the server's refusal body"
metadata:
  node_type: memory
  type: reference
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-28T03:55:28.892Z
---

Learned 28 Sep 2026 running every role's click-throughs in one Browser pane (admin, agency, outlet on
localhost:3000; PR app on localhost:8081).

- **Sessions are pinned per TAB** (sessionStorage `*::pinned` keys), so one tab per role works — but
  never open a new tab or sign out; a new tab has no pinned session. `innocenz-portal-locale` is
  localStorage (SHARED by all :3000 tabs) and each account also persists its own locale, so do the
  中文 pass last, one portal at a time, and switch each account back to EN afterwards.
- **Toasts disappear in < 4 s.** Before clicking, install a MutationObserver that records the text of
  `[data-sonner-toast],[role=status],[role=alert],[class*=toast]` into `window.__toastLog`, then read it.
  A clean log after a write is a real finding (member reactivate/deactivate had none).
- **Server refusals:** `read_network_requests` sees the localhost:7777 calls; fetch the body by
  requestId to get the exact sentence (e.g. the send gate's 409 "overtime claim(s) not yet decided").
- **MC / proof photo without a camera:** override `HTMLInputElement.prototype.click` once so the
  picker's hidden file input receives a canvas-generated PNG via DataTransfer + `change` event.
- **Coordinate clicks miss** (screenshot frame 800 wide vs viewport 1006); click by `ref` from `find`,
  or `element.click()` for RN-web tab bars and unlabeled checkboxes.
- Verify every write with a READ ONLY-transaction probe of the rows before/after (see
  [[write-never-landed-check-first]]); a toast is not proof the row changed.
