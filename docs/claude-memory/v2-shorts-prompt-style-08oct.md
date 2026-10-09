---
name: v2-shorts-prompt-style-08oct
description: "Owner's V2 short-prompt style (now Higgsfield; 9 Oct BAR rewrite: one covered bar outfit per short, every part set in a bar, bass-drop bar switch) — from Thu 8 Oct 2026: round crown-Z badge in the very top-left, big title top-centre with NO 'POV' label, different Malaysian Chinese girl per PR short, sad English talk-to-camera monologue (selfie vlog + first-person cutaway), Part 2 sad→happy SWITCH, English-only speech and subtitles"
metadata:
  node_type: memory
  type: project
  originSessionId: e03eb10b-304b-437d-b23f-ca2a81413a4e
  modified: 2026-10-09T04:49:26.758Z
---

The owner gave these rules on Thu 8 Oct 2026, in the V2 ProblemStatementsSellingPoin tab, F · G · H, rows 8–35 of `marketing-v17-v1-v2.xlsm`. They come from reviewing the club-girl reference, five Instagram reels and the first Genspark test of PR #1.

- **Logo:** `innocenz-logo-round.png` is the crown-Z badge cut out as a circle with transparent corners. It goes as a small circle in the VERY top-left corner (110 px, 24 px in). The old `innocenz-logo-dark` badge has square dark corners and rendered as a box.
- **Title:** top-centre, white bold, just the hook plus one emoji, e.g. "you worked all week and got one total, no details 😩". There is NO "POV" label: the owner removed it after the first test. In Part 2 a red strike-through flips it to "✅ Solved with InnocenZ".
- **Part 1 (≈9 s):** the avatar tells their own SAD story to camera in English, 2–4 lines, 12–22 words in all. Talk-to-camera beats are selfie vlog (phone at arm's length). At least one cutaway is first-person POV (hands). Emotion goes worried → frowning → aggrieved / on the verge of tears → fighting back tears → hurt and tearful, and hair goes neat → messy. Use easy words: the owner rejected "lump sum".
- **Part 2:** STILL SAD 0–1 s → THE SWITCH by 2 s (tears gone, hair sleek, warm gold) → the ways + the benefit. The claims, the Part 2/3 spoken lines and the cards stay word for word.
- **Speech and subtitles are English only.** The owner confirmed "only this version", with no 中文 subtitle.
- **PRs:** every PR short has a DIFFERENT beautiful Malaysian Chinese girl, aged 25–30, with the club-girl glam style (`innocenz-pr-look-reference.png`, face crop only). Jia Xin, Jess, Joanne, Mei Ling, Xin Yi, Pei Shan, Hui Min and Phoebe each have their own hair and outfit. Agency and outlet presenters stay as they were.

**Added 9 Oct 2026, after the owner finished PR #1 as the REFERENCE short:**
- **Devices:** a PR holds a PHONE; agency and outlet presenters hold an iPad in all three parts, and their Part 1 selfie vlog is filmed on the iPad. The checker enforces it.
- **Floating device:** whenever the device shows the InnocenZ app up close or cards come out of it, it FLOATS with no hand on it. A generated "third hand" holding the phone looked wrong.
- **Title:** after the switch it is plain "Solved with InnocenZ", spelled out. The ✅ rendered as a white mark inside "Innocen▫Z", and the round logo must stay top-left.
- **Part 2:** the avatar reads each card label aloud, because the slow cards were silent. Voice is required.
- **Same person:** Parts 2 and 3 carry Part 1's look word for word (LOOK line). A last-frame screenshot is needed only when a part is generated on its own.
- **Higgsfield, one paste:** the owner generates in Higgsfield, not Genspark, by pasting F · G · H of one row TOGETHER as one input. Each part therefore opens with a "ONE SHORT … PART n of 3" line. The sheet's how-to cells say Higgsfield; the dated history in master A3 and Timeline C84 keeps "Genspark" on purpose.
- **PR #1 is pr1.MOV:** the owner's finished short. Its row must match the video: a crumpled paper pay slip close-up, seated on the sofa throughout, and in Part 3 arms folded with a gold sparkle burst. The other rows may differ by role and problem.
- **No "lump sum" anywhere in a prompt.** The problem quote and the benefit text carried it into context lines that Part 2 is told to "say aloud", so `easy_words()` in build.py swaps it. Master column B, the owner's problem text, still says it.
- **Part 3:** the title reads "✨ Link in the description below", with the gold logo animating under it, and the end card uses the premium END CARD DESIGN.
- **Generations cost real money:** the owner said "token to generate video cannot claim back". Every prompt gets a fixer pass plus an adversarial verifier before hand-off.

**BAR rewrite, 9 Oct 2026 (after Agency #1's opening)** — owner: "more bar feel when 转场", "all pr outlet and agency outfit need more like in bar style , dont exposed too much", "each video each person each problem statement same outfit", "all need bar-style bar atmosphere feel, bar outfit across Parts 1-3, in each problem statement and each person each role":
- **Outfit:** every person (PR, agency, outlet) wears ONE classy, COVERED bar outfit in all three parts. Never off-shoulder, plunging, sheer, midriff, mini or thigh slit. The 24 outfits are fixed in `OUTFITS` in build.py. The PR reference still is used for face and make-up only, never its outfit.
- **Place:** every short happens in a bar, lounge or club. Part 1 is the gloomy after-hours side, Part 2's switch is the bar coming alive, and Part 3 is the same bar glowing.
- **The switch:** DJ riser → bass drop, purple-and-gold club beams, mirror-ball specks, haze and a glass clink.
- **Already-filmed shorts:** PR #1 and Agency #1 were filmed in the old outfit and room, so their openings must be re-generated.
- **No character limit** now (the owner briefly asked for 20,000, then lifted it).
- **Title fix:** the switched title is gold on a deep-purple band. An older "white bold" line contradicted it in all 24 rows and was removed.

**Why:** these are the owner's own corrections after seeing the reels and the first Genspark result. Ask before reverting any of them.

**How to apply:**
- The tooling is in this session's scratchpad `v2/`: `build.py` (deterministic lines + a checker that caught 20/20 planted faults), `patch_xlsm.py` (an in-place shared-string swap) and `out/<vid>.txt` (the creative parts).
- Rebuild on top of the newest Drive copy and verify every cell.
- Then upload per [[marketing-xlsm-upload-every-change]]. Related: [[marketing-video-records-roles]], [[never-round-trip-marketing-xlsx]].
