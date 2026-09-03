---
name: shared-checkout-git-state-moves
description: "This working tree is shared with other agent sessions — files get auto-staged and directories move mid-task, so git status is not all yours; plus TEST_SCRIPT.md is committed CRLF, so any edit to it shows a 9,000-line whole-file diff unless you use -c core.autocrlf=false"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: efcdecd7-22b8-4478-b091-4c5c79c63a5e
  modified: 2026-08-06T08:28:21.771Z
---

**6 Aug 2026.** Two surprises in one session, both about the working tree rather than the code.

## Another session edits this same checkout

A tool hook said it plainly — *"Another chat's dev server is running in this folder"* — and it was
not only a server: mid-task, `apps/backend/src/features/pr/` became
`features/pr-personnel/` ([[backend-pr-feature-renamed-pr-personnel]]), and by the end of the session
**eight files were staged in the index that I never staged**, including two I had only created.

**Why:** the owner runs more than one agent against one directory, and hooks in this setup stage
work automatically.

**How to apply:**
- `git status` is **not** a report on your own work. Before saying "the tree contains X", check
  whether X is yours. Never "clean up" someone else's staged or unstaged changes, and never
  `git checkout --` / `reset` a path you did not write.
- A path that worked an hour ago can be gone. A failed `Read` means **look for the file**, not
  "the code was deleted".
- A `tsc` or test failure may be another session's half-finished state. Say so instead of reporting
  it as breakage in your own change.

## TEST_SCRIPT.md is committed with CRLF, and `core.autocrlf=true`

Editing it at all produces a **~9,400-line whole-file diff**: the blob has `\r\n`, autocrlf cleans
the worktree copy to `\n`, so every line differs. It looks like catastrophic churn around a 50-line
edit.

- Read the real change with **`git -c core.autocrlf=false diff -- TEST_SCRIPT.md`**, and stage it the
  same way (`git -c core.autocrlf=false add`) to keep the blob CRLF.
- The file showed clean before my first edit only because of git's **stat cache** — git had not
  re-read it, so the conversion never ran. A clean `git status` on a file nobody has touched is not
  proof its endings agree with the index.
- I burned several rounds converting the file back and forth trying to make the diff small. Don't:
  check with `-c core.autocrlf=false` **first**, then decide whether anything is actually wrong.
  Rewriting line endings to chase a diff is churn, and it can collide with whatever the other
  session is doing to the same file. The owner's call on 6 Aug was blunt and worth keeping:
  *"just ignore the testscript for now"*.
