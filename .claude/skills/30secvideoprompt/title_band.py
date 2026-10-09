"""Owner rules (9 Oct 2026): "the top title make no hide or cover the person"; on the Agency 1 render "the center title
is too below"; then "The center title can make like the pr1 which is the success pr full shorts video, no hide and cover
the pr" + "All follows". Bring an older Seedance prompt to PR #1's layout (measured on pr1.MOV): the problem title in the
upper 11-19% just above the head, "Solved with InnocenZ" a full-width deep-purple band across the very top (top edge to
12%), the person framed below with the top of the head under 21%.

usage: python -I title_band.py <prompt.txt> <she|he> ["old|||new" ...]   (extra exact replacements, each must match once)"""
import re
import sys

f, who = sys.argv[1], sys.argv[2]
her, she, obj = ("her", "she", "her") if who == "she" else ("his", "he", "him")
p = open(f, encoding="utf-8").read()


def rep(old, new):
    global p
    assert p.count(old) == 1, f"not exactly once: {old[:70]}"
    p = p.replace(old, new)


BAND = (f"• Layout as in PR #1's finished short: the top 20% of the frame holds only the badge, the title and the small logo; "
        f"{she} is always framed below it with headroom, the top of {her} head and raised hands under 21% down, so the title "
        f"never covers any part of {obj}. Problem title centred in the upper 11–19%, just above {her} head")
SOLVED = ("gold letters on a full-width deep-purple band across the very top (top edge to 12% down), small gold crown above "
          "the words, thin gold underline")
# any earlier title line, up to the words "big white bold rounded letters"
m = re.search(r"• (?:Layout as in PR #1|The top \d\d% of the frame|Title (?:centred in the upper 15–25%|in the top quarter))"
              r"[^\n]*?(?=,? big white bold)", p)
assert m, "no title line found"
rep(m.group(0), BAND)
p = p.replace("gold letters on a deep-purple band, small gold crown above, thin gold underline", SOLVED)
p = p.replace("@Image 2 = the square gold crown-Z logo", "@Image 2 = the square gold crown-above-Z logo")
p = re.sub(r"head and shoulders (?:large )?in the middle of the frame(?:, head below the title| with headroom, the top of "
           r"(?:her|his) head under \d\d% down)", f"head and shoulders in the middle of the frame with headroom, the top of "
           f"{her} head under 21% down", p)
p = re.sub(r"under 2[2-9]% down|under 30% down", "under 21% down", p)
for a, b in [("the word [InnocenZ] at the top", "the word [InnocenZ] (spelled I-n-n-o-c-e-n-Z) at the top"),
             ("the word [InnocenZ], gold cards", "the word [InnocenZ] (spelled I-n-n-o-c-e-n-Z), gold cards"),
             ("[InnocenZ] fades in below in champagne-gold serif letters,", "[InnocenZ] fades in below in champagne-gold serif "
              "letters, spelled I-n-n-o-c-e-n-Z,")]:
    if a in p and b not in p:
        rep(a, b)
p = re.sub(r"A small @Image 2 logo(?:, about \d\d% of frame width,)? pops in (?:with a sparkle )?under the title(?:, inside "
           r"the top band)?,? above (her|his) head\.",
           lambda m: f"A small @Image 2 logo, about 10% of frame width, pops in with a sparkle under the title, inside the top "
                     f"band, above {m.group(1)} head.", p)
for pair in sys.argv[3:]:
    a, b = pair.split("|||")
    rep(a, b)
open(f, "w", encoding="utf-8").write(p)
print(f, len(p), "chars")
