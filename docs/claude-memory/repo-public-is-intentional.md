---
name: repo-public-is-intentional
description: "GitHub uab-kl/InnocenZ is PUBLIC ON PURPOSE (owner, 28 Sep 2026) — do not list the visibility itself as a bug; still keep personal data and secrets out of commits"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-28T05:46:31.169Z
---

The owner, 28 Sep 2026, after the whole-project audit listed "the GitHub repository is public" as
🔴 #1: *"don't mind the public status of the repo as that was set so that i can intentionally for
configuration."*

**Why:** the visibility is a deliberate configuration choice, not an oversight, so reporting it
again is noise that buries real findings.

**How to apply:** never re-raise "the repo is public" as a finding or a to-do. What still matters
BECAUSE it is public: do not commit personal data (IC numbers, phones, emails, photos), passwords,
keys or DB addresses into `docs/`, seeds, scripts or memories — the visibility makes every such
commit a publication. Flag a NEW leak of that kind when you see one; do not flag the visibility.

Related: [[production-version-probe]].
