---
name: truncate-on-open-destroys-the-file
description: "`open(path,'w')` EMPTIES the file before the write can fail — a UnicodeEncodeError left resolve-tier-wages.ts at 0 bytes. Encode first, write to a temp, then os.replace."
metadata:
  node_type: memory
  type: feedback
---

**Encode the whole new text BEFORE the target file is opened.** Written 13 Sep 2026, after a
Python edit script emptied `apps/backend/src/features/shift-assignment/resolve-tier-wages.ts`
to **0 bytes**.

## What happened

```python
io.open(p, 'w', encoding='utf-8', newline='').write(s)   # <- DO NOT
```

`open(..., 'w')` truncates **on open**. The encode then failed —
`UnicodeEncodeError: surrogates not allowed`, because the string carried a hand-written
surrogate PAIR (`🔴`) instead of `\U0001F534` — and by then the file was already
empty. The traceback points at the `.write()`, which reads as *"nothing was written"*, when
in fact everything had been deleted.

Recovered with `git show HEAD:<path>` piped back through Python. (A plain `git checkout --`
was refused by GateGuard as destructive, which was the right call — the facts had to be
stated first.)

## The rule

```python
def save(path, text):
    data = text.encode('utf-8')      # fails HERE, with the file untouched
    tmp = path + '.tmp-edit'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)            # atomic
```

Three properties, and all three matter:

1. **Encode before opening.** Any encoding error happens while the target is intact.
2. **Write bytes to a temp.** A crash mid-write leaves the original whole.
3. **`os.replace`** is atomic on Windows and POSIX alike.

The same helper carries `load()` (returns the text and its detected newline) and a `rep()`
that ASSERTS its anchor appears exactly once — an anchor matching 0 or 2 places is the other
way these scripts do damage quietly.

## Emoji in Python string literals

Use the astral escape, never a hand-written surrogate pair. Python strings are not UTF-16: a
written-out pair is two unpaired surrogates and `.encode('utf-8')` refuses them. It looks
fine as *source*, so the failure appears only at write time — exactly when the truncating
`open` has already fired.

Same family as [[green-signals-that-lie]] and
[[absent-evidence-is-about-the-instrument]]: the tool reported something other than what it
did.
