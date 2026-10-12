"""Cut one checked Seedance prompt into the workbook's three cells F · G · H (owner, 9 Oct 2026: "i want that 3 prompt copy
and paste together also can generate nicely with details" — chose: F · G · H = one short prompt cut in three, the long
briefs kept word for word in K · L · M).

  F = REFERENCES … TEXT, SHOTS up to the switch          (Part 1, the problem)
  G = SHOTS from THE SWITCH to the [✨ Link in bio] moment (Part 2, InnocenZ)
  H = the last line, the end card, SOUND                  (Part 3, the ending)

Each part opens with one plain line saying which part it is; pasted together they are the whole prompt, unchanged.

  python -I split_fgh.py <prompt.txt> <out_prefix>     → <out_prefix>-F.txt, -G.txt, -H.txt (prints the cut points)
"""
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
src, pre = sys.argv[1], sys.argv[2]
p = open(src, encoding="utf-8").read().rstrip("\n") + "\n"
lines = p.split("\n")
shot = re.compile(r"^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) s — ")
shots = [(i, float(m.group(1)), float(m.group(2))) for i, l in enumerate(lines) if (m := shot.match(l))]
end = shots[-1][2]
sw = next(i for i, a, b in shots if "THE SWITCH" in lines[i])
link = re.search(r"At (\d+(?:\.\d+)?) s it dissolves in place into \[✨ Link in bio\]", p)
assert link, "TEXT must say when the title dissolves into [✨ Link in bio]"
lt = float(link.group(1))
h0 = next(i for i, a, b in shots if a == lt)
t_sw, t_h = next(a for i, a, b in shots if i == sw), lt
fmt = lambda x: f"{x:g}"
head = {
    "F": f"PART 1 of 3 (0–{fmt(t_sw)} s) — paste F, G and H together, one after another, as ONE prompt for ONE "
         f"{fmt(end)}-second video.",
    "G": f"PART 2 of 3 ({fmt(t_sw)}–{fmt(t_h)} s) — the same prompt, straight on from Part 1.",
    "H": f"PART 3 of 3 ({fmt(t_h)}–{fmt(end)} s) — the same prompt, straight on from Part 2, to the last frame.",
}
body = {"F": "\n".join(lines[:sw]).rstrip("\n"), "G": "\n".join(lines[sw:h0]).rstrip("\n"), "H": "\n".join(lines[h0:]).rstrip("\n")}
assert body["F"] + "\n" + body["G"] + "\n" + body["H"] + "\n" == p, "the three parts must rebuild the prompt exactly"
for k in "FGH":
    txt = head[k] + "\n" + body[k] + "\n"
    open(f"{pre}-{k}.txt", "w", encoding="utf-8").write(txt)
    print(f"{k}: {len(txt):>5} chars  starts at line {1 + (0 if k == 'F' else sw if k == 'G' else h0)}")
print(f"cut at {fmt(t_sw)} s (THE SWITCH) and {fmt(t_h)} s (✨ Link in bio); whole = {sum(len(head[k]) + len(body[k]) + 2 for k in 'FGH')} chars")
