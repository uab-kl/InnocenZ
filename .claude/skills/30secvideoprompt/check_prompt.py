"""Check a /30secvideoprompt Seedance prompt before the owner spends credits.

    python -I check_prompt.py <seedance_prompt.txt> [<source_FGH.txt>]

<source_FGH.txt> = the short's full F · G · H prompts from the workbook (the three cells pasted one after another). With it,
every spoken line, card label, the problem title and the end-card tagline are checked word for word against the source.
Exit code 1 if anything fails. Plain stdlib; run with -I.
"""
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
MAX_SECONDS, MAX_WPS, MAX_CHARS = 30, 4.0, 10000  # no documented Seedance 2.5 cap; aim for ~9,000, warn past 10,000
CTA = "Find out more — link in bio."

p = open(sys.argv[1], encoding="utf-8").read()
src = open(sys.argv[2], encoding="utf-8").read() if len(sys.argv) > 2 else None
fails, warns = [], []
F, W = fails.append, warns.append


def words(s):
    return len([w for w in s.replace("—", " ").split() if re.search(r"\w", w)])


# 1. blocks and references
for block in ("REFERENCES:", "STYLE:", "TEXT", "SHOTS", "SOUND:"):
    if block not in p:
        F(f"missing block {block}")
for ref in ("@Image 1", "@Image 2"):
    if ref not in p:
        F(f"{ref} never used — every logo must point at an attached image")
if re.search(r"@logo\b", p, re.I):
    F("'@logo' does not bind in Higgsfield — use @Image 1 / @Image 2 picked from the @ menu")

# 2. timeline: contiguous from 0, ends at the stated length, at most 30 s
shots = [(float(a), float(b), line) for a, b, line in
         re.findall(r"^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) s — (.*)$", p, re.M)]
if not shots:
    F("no SHOTS lines of the form '0–2 s — …'")
else:
    if shots[0][0] != 0:
        F("the first shot must start at 0 s")
    for (a1, b1, _), (a2, b2, _) in zip(shots, shots[1:]):
        if b1 != a2:
            F(f"timeline gap or overlap: {a1}–{b1} s then {a2}–{b2} s")
    end = shots[-1][1]
    if end > MAX_SECONDS:
        F(f"the short runs {end} s — the owner's limit is {MAX_SECONDS} s")
    m = re.search(r"(\d+)-second", p)
    if not m or float(m.group(1)) != end:
        F(f"STYLE must state the length as '{int(end)}-second' (found {m.group(0) if m else 'none'})")

# 3. speech: quoted text is speech; each line fits its seconds
spoken = []
for a, b, line in shots:
    for q in re.findall(r'"([^"]+)"', line):
        if words(q) >= 2 and q.rstrip()[-1:] in ".!?":
            st = re.search(r"from (\d+(?:\.\d+)?) s", line)
            start = float(st.group(1)) if st and a <= float(st.group(1)) < b else a
            wps = words(q) / max(b - start, 0.1)
            spoken.append(q)
            if wps > MAX_WPS:
                F(f"{a}–{b} s: {words(q)} words in {b - start:.1f} s = {wps:.1f}/s (max {MAX_WPS}) — {q[:50]!r}")
if CTA not in spoken:
    F(f"the end card must say the call to action once: \"{CTA}\"")

# 4. on-screen text is in [brackets]; subtitles carry every on-camera line
brackets = re.findall(r"\[([^\]]+)\]", p)
# card labels and end-card lines must be on screen IN the shots — the subtitle list repeats the spoken card words, so a
# wrong label on the card itself would otherwise hide behind its subtitle
shots_sec = re.search(r"^SHOTS\b(.*?)^SOUND:", p, re.M | re.S)
shot_brackets = [x.rstrip(".") for x in re.findall(r"\[([^\]]+)\]", shots_sec.group(1))] if shots_sec else []
sub_block = re.search(r"Subtitles[^\n]*", p)
sub_line = sub_block.group(0) if sub_block else ""
sub_text = " ".join(re.findall(r"\[([^\]]+)\]", sub_line))
# two accepted forms: an explicit list of every line in [brackets] with its times, or (shorter, for long prompts) the rule
# "each … line in quotes … word for word, only while … says it … none on the end card" — the quotes in SHOTS are the copy
rule_form = re.search(r"each [^\n]*line[^\n]*in quotes[^\n]*word for word", sub_line) and "none on the end card" in sub_line.lower()
if not sub_line:
    F("no Subtitles line under TEXT")
elif not rule_form:
    for s in spoken:
        if s != CTA and s not in sub_text:
            F(f"spoken line missing from the subtitle list: {s[:60]!r}")
if sub_line and "end card" not in sub_line.lower():
    F("the Subtitles line must say there is no subtitle on the end card")
for need in ("Solved with InnocenZ", "✨ Link in bio", "InnocenZ", CTA):
    if need not in brackets:
        F(f"on-screen text missing (must be in [brackets]): [{need}]")

# 5. owner's standing bans
for pat, why in ((r"crash[- ]zoom|snap[- ]zoom|whip[- ]?(?:pan|zoom)|swish[- ]pan", "blurring camera move"),
                 (r"\bblur(?:red|ry|s)?\b|motion blur", "never ask for blur"),
                 (r"link in the description", "the CTA is 'Link in bio'"),
                 (r"\bmini\b|off[- ]shoulder|plung|low[- ]cut|cleavage|\bsheer\b|midriff|thigh[- ]slit", "revealing outfit word")):
    m = re.search(pat, p, re.I)
    if m:
        F(f"{why}: {m.group(0)!r}")
# owner, 9 Oct 2026: "the top title make no hide or cover the person" — a clear top band, the person framed below it
if not re.search(r"title never covers any part of", p):
    F("owner rule: TEXT must say the title never covers any part of the person (clear top band, framed below it)")
if "SELFIE" in p and "headroom" not in p:
    F("owner rule: selfie framing must keep headroom so the head stays below the title band")
# owner, 9 Oct: "the center title is too below", then "The center title can make like the pr1 which is the success pr full
# shorts video, no hide and cover the pr" — PR #1's layout: problem title 11–19%, Solved = a full-width band at the very top
if re.search(r"upper (?:15–25|8–17)%", p) or "upper 11–19%" not in p:
    F("owner rule: the problem title sits in the 'upper 11–19%' just above the head, as in PR #1 (15–25% covered Grace)")
if "full-width deep-purple band across the very top" not in p:
    F("owner rule: [Solved with InnocenZ] is a full-width deep-purple band across the very top, as in PR #1")
if re.search(r"under (?:2[2-9]|30)% down", p):
    F("owner rule: the head anchor is 'under 21% down' (PR #1's framing)")
# owner, 9 Oct: "make the agency and outlet age no exceed 40 years old , pr no exceed 30 years old"
who = re.search(r"^(?:WOMAN|MAN): ([^,\n]+), (\d+),([^\n]*)", p, re.M)
if not who:
    F("the WOMAN:/MAN: line must start 'Name, age,'")
else:
    is_pr = bool(re.search(r"\ba PR\b(?!\s+agency)", who.group(3)))  # "finance manager of a PR agency" is staff
    lo, hi = (20, 30) if is_pr else (30, 40)
    if not lo <= int(who.group(2)) <= hi:
        F(f"owner rule: {who.group(1)} is {who.group(2)} — a {'PR' if is_pr else 'agency/outlet person'} must be {lo}–{hi}")
    old = re.search(r"salt-and-pepper|grey(?:ing)? (?:hair|temples?|streaks?|stubble|beard|goatee)|grey at the temples|"
                    r"reading glasses|\bmature\b|forties|fifties|silver(?:-grey)? hair", p, re.I)
    if old and not is_pr:
        F(f"owner rule: an older look is still described ({old.group(0)!r}) — agency/outlet people look 30–40")
snd = re.search(r"SOUND:(.*)", p, re.S)
if not snd or not re.search(r"no music", snd.group(1), re.I):
    F("SOUND must say there is no music before the switch")
if len(p) > MAX_CHARS:
    W(f"{len(p)} characters — long prompts lose detail; aim for under {MAX_CHARS}")

# 6. against the source F · G · H
if src:
    src_spoken = re.findall(r'^\d+–\d+ s · [^"\n]*?:\s*"([^"]+)"', src, re.M)
    for q in src_spoken:
        q2 = re.sub(r"\bYeah lah\b", "Yess", q)
        if q not in spoken and q2 not in spoken:
            F(f"source line missing or changed: {q[:70]!r}")
    t = re.search(r'ONLY these words: "([^"]+)"', src)
    if t:
        want = re.sub(r"\s+", " ", t.group(1)).strip()
        title = re.search(r"\[([^\]]+)\] / \[([^\]]+)\]", p)
        got = re.sub(r"\s+", " ", f"{title.group(1)} {title.group(2)}").strip() if title else ""
        if got != want:
            F(f"problem title not word for word: source {want!r}, prompt {got!r}")
    for lab in re.findall(r'Card[^\n"]*?"([^"]+)"', src):
        if lab.rstrip(".") not in shot_brackets:
            F(f"card label missing from the SHOTS: [{lab}]")
    for tag in re.findall(r'(?:END CARD|end card)[^\n]*\n(?:  [^\n]*\n)*?  ON SCREEN:[^\n]*?"([^"]+)"', src):
        if tag.rstrip(".") not in shot_brackets and "Link in" not in tag:
            F(f"end-card line missing from the SHOTS: [{tag}]")

print(f"{len(p)} chars · {len(p.split())} words · {len(shots)} shots · ends at {shots[-1][1] if shots else '?'} s · "
      f"{len(spoken)} spoken lines")
for w in warns:
    print("  warn:", w)
for f in fails:
    print("  FAIL:", f)
print("RESULT:", "OK" if not fails else f"{len(fails)} problem(s)")
sys.exit(1 if fails else 0)
