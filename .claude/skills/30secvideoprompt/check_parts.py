"""Check a THREE-PART prompt (workbook cells F · G · H) before the owner spends credits. Owner, 9 Oct 2026: "make that i
paste the prompt 1,2 and 3 together , or 1 each 2 and 3 each , to genspark or higgsfields also make the shorts looks
naturally and seamlessly , no exceed 30 second , no remove all the important details".

    python -I check_parts.py <three_part_prompt.txt> [<source_FGH.txt>]

The file holds the three parts one after another, each starting with a line "PART n of 3 · a–b s — …".
1. Pasted TOGETHER: the whole text must pass check_prompt.py (timeline 0 → end ≤ 30 s, speech ≤ 4 words/s, every line,
   card, title and tagline word for word, layout, ages, bans, length).
2. Pasted ONE AT A TIME: every part must stand on its own — its own window and clip length in the header, its own shots
   inside that window, its own SOUND line; Parts 2 and 3 a "SAME AS PART 1:" recap naming the person (name, age), both
   logo images, the device, the head framing and the never-cover rule, plus the title they show.
Exit code 1 if anything fails.
"""
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
src = sys.argv[2] if len(sys.argv) > 2 else None
p = open(path, encoding="utf-8").read()
fails = []
F = fails.append

r = subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(os.path.abspath(__file__)), "check_prompt.py"), path]
                   + ([src] if src else []), capture_output=True, text=True, encoding="utf-8")
print("— together —\n" + r.stdout.strip())
if r.returncode:
    F("the three parts pasted together fail check_prompt.py (see above)")

heads = list(re.finditer(r"^PART ([123]) of 3 · (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) s — ([^\n]*)$", p, re.M))
if [h.group(1) for h in heads] != ["1", "2", "3"]:
    F(f"need the three headers 'PART 1/2/3 of 3 · a–b s — …' in order (found {[h.group(1) for h in heads]})")
    print("\n".join("  FAIL: " + f for f in fails)); sys.exit(1)
parts = [p[h.start(): (heads[i + 1].start() if i < 2 else len(p))] for i, h in enumerate(heads)]
who = re.search(r"^(?:WOMAN|MAN): ([^,\n]+), (\d+),", p, re.M)
name, age = (who.group(1), who.group(2)) if who else ("?", "?")
device = "phone" if re.search(r"\bHer phone\b|\bHis phone\b|front camera of her phone|her phone's|his phone's", parts[0]) else "tablet"
shot = re.compile(r"^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) s — ", re.M)
fmt = lambda x: f"{x:g}"
prev_end = 0.0
print("— one at a time —")
for i, (h, part) in enumerate(zip(heads, parts), 1):
    a, b, rest = float(h.group(2)), float(h.group(3)), h.group(4)
    tag = f"Part {i} ({fmt(a)}–{fmt(b)} s)"
    if a != prev_end:
        F(f"{tag}: starts at {fmt(a)} s, but the previous part ends at {fmt(prev_end)} s")
    prev_end = b
    ss = [(float(x), float(y)) for x, y in shot.findall(part)]
    if not ss:
        F(f"{tag}: no timed shots")
    else:
        if ss[0][0] != a or ss[-1][1] != b:
            F(f"{tag}: its shots run {fmt(ss[0][0])}–{fmt(ss[-1][1])} s, not the header's {fmt(a)}–{fmt(b)} s")
        for (x1, y1), (x2, y2) in zip(ss, ss[1:]):
            if y1 != x2:
                F(f"{tag}: gap or overlap {fmt(x1)}–{fmt(y1)} then {fmt(x2)}–{fmt(y2)} s")
    secs = round(b - a)
    if i == 1:
        if not re.search(rf"Pasted alone, make a {secs}-second clip", rest):
            F(f"{tag}: the header must say 'Pasted alone, make a {secs}-second clip'")
        for block in ("REFERENCES:", "STYLE:", "PLACE:", "TEXT", "SHOTS"):
            if block not in part:
                F(f"{tag}: Part 1 must carry the {block} block")
    else:
        if not re.search(rf"Pasted alone, make a {secs}-second clip that starts exactly on a screenshot of Part {i - 1}'s last frame", rest):
            F(f"{tag}: the header must say 'Pasted alone, make a {secs}-second clip that starts exactly on a screenshot of "
              f"Part {i - 1}'s last frame'")
        recap = re.search(r"^SAME AS PART 1:([^\n]*)", part, re.M)
        if not recap:
            F(f"{tag}: no 'SAME AS PART 1:' recap — pasted alone it would not know who or where")
        else:
            rc = recap.group(1)
            for need, why in ((f"{name}, {age}", "the person's name and age"), ("@Image 1", "the badge image"),
                              ("@Image 2", "the logo image"), (device, "the device"), ("under 21% down", "the head framing"),
                              ("never covers any part of", "the never-cover rule")):
                if need not in rc:
                    F(f"{tag}: the recap lacks {why} ({need!r})")
            if i == 2 and "full-width deep plum-purple band across the very top" not in rc:
                F(f"{tag}: the recap must describe the [Solved with InnocenZ] band")
            if i == 3 and "[✨ Link in bio]" not in rc:
                F(f"{tag}: the recap must say the title becomes [✨ Link in bio]")
    if not re.search(rf"^SOUND {fmt(a)}–{fmt(b)} s:", part, re.M):
        F(f"{tag}: needs its own line 'SOUND {fmt(a)}–{fmt(b)} s: …'")
    if i == 2 and "THE SWITCH" not in part:
        F(f"{tag}: THE SWITCH belongs in Part 2")
    if i == 3 and "[Find out more — link in bio.]" not in part:
        F(f"{tag}: the end card belongs in Part 3")
    print(f"  {tag}: {len(part):>5} chars, clip {secs} s")
for f in fails:
    print("  FAIL:", f)
print("RESULT:", "OK" if not fails else f"{len(fails)} problem(s)")
sys.exit(1 if fails else 0)
