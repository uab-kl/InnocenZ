---
name: shared-checkout-git-state-moves
description: "This working tree is shared with other agent sessions — files get auto-staged and directories move mid-task, so git status is not all yours; plus the TEST_SCRIPT.md line-ending trap, whose flag advice INVERTED on 3 Sep 2026 (the blob is LF now, so plain git diff is the accurate one) — measure BOTH diffs before believing either"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: efcdecd7-22b8-4478-b091-4c5c79c63a5e
  modified: 2026-09-03T05:32:48.038Z
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

## TEST_SCRIPT.md line endings — ⚠️ THE FIX BELOW IS NOW INVERTED (re-measured 3 Sep 2026)

**Read this half first.** On 3 Sep 2026 the blob is **LF**, not CRLF — it was re-committed
normalized at some point after 6 Aug. The worktree copy is still CRLF and `core.autocrlf` is still
`true`, so the two commands have swapped roles:

- **plain `git diff -- TEST_SCRIPT.md` is now the ACCURATE one.** A 17-line insertion measured
  `17 insertions, 0 deletions`. Stage it with a plain `git add`; autocrlf stores LF and the commit
  shows the real change.
- **`git -c core.autocrlf=false` is now the one that lies** — it compares the CRLF worktree against
  an LF blob, so every line differs: the same 17-line edit read `7,380 insertions, 7,363 deletions`.

Still true on 4 Oct 2026: `git ls-files --eol -- TEST_SCRIPT.md` prints `i/lf  w/crlf  attr/` —
LF in the index, CRLF in the worktree, and **no `.gitattributes` rule** for the file (that file pins
only `*.sh` and `tools/deploy/*` to LF). `core.autocrlf=true` comes from the **system** gitconfig
(`C:/Program Files/Git/etc/gitconfig`), not the repo's own config — so another device, or a
re-commit, can change the answer. `git ls-files --eol` is the one-command way to read which side
is which before choosing a flag.

The lasting rule is not either flag, it is: **measure both before believing either.** Which
direction the mismatch runs is a property of the blob on the day, and the blob changed underneath a
memory that named one specific flag as the answer.

The original 6 Aug finding, kept because the mechanism is the useful part:

On 6 Aug the file was committed with **CRLF** and `core.autocrlf=true`. Editing it at all produced a
**~9,400-line whole-file diff**: the blob had `\r\n`, autocrlf cleaned the worktree copy to `\n`, so
every line differed. It looked like catastrophic churn around a 50-line edit.

- At that time you read the real change with `git -c core.autocrlf=false diff -- TEST_SCRIPT.md`
  and staged it the same way (`git -c core.autocrlf=false add`) to keep the blob CRLF. **That is
  now backwards — see above.**
- The file showed clean before my first edit only because of git's **stat cache** — git had not
  re-read it, so the conversion never ran. A clean `git status` on a file nobody has touched is not
  proof its endings agree with the index.
- I burned several rounds converting the file back and forth trying to make the diff small. Don't:
  measure **both** diffs **first** (on 6 Aug that meant checking with `-c core.autocrlf=false`), then
  decide whether anything is actually wrong. Rewriting line endings to chase a diff is churn, and it
  can collide with whatever the other session is doing to the same file. The owner's call on 6 Aug
  was blunt and worth keeping: *"just ignore the testscript for now"*.
