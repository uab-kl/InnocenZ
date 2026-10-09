---
name: v2-shorts-prompt-style-08oct
description: "Owner's V2 short-prompt style (now Higgsfield; 9 Oct BAR rewrite: one covered bar outfit per short, every part set in a bar, bass-drop bar switch) — from Thu 8 Oct 2026: round crown-Z badge in the very top-left, big title top-centre with NO 'POV' label, different Malaysian Chinese girl per PR short, sad English talk-to-camera monologue (selfie vlog + first-person cutaway), Part 2 sad→happy SWITCH, English-only speech and subtitles"
metadata:
  node_type: memory
  type: project
  originSessionId: e03eb10b-304b-437d-b23f-ca2a81413a4e
  modified: 2026-10-09T09:52:26.059Z
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

**Later on 9 Oct — seamless, 30 s, look and feel** — owner: "if i copy the prompt one part by one part , or all 3 parts copy direct also make sure is seamlessly and naturally … talking , subtitle background same , the caption nice , bar style feel , Exaggerated movements and facial expressions … Transition no weird", "dont exceed 30 seconds", "the problem statement need match with the environment background", "need the benefit of the innocenz how can innocenz help the look and feel":
- **Every short is exactly 30 s:** Part 1 9 s + Part 2 16 s + Part 3 5 s. `p2_plan` caps Part 2, and the checker fails anything over 30.
- **Two ways to generate:** each part works pasted with the others or generated alone from the previous part's last frame. It states its window in the short, ends on a steady frame and keeps one voice.
- **One caption style** in all parts (`SUB_STYLE`): white bold text on a dark-plum box with a gold edge.
- **ACTING and TRANSITIONS lines:** big exaggerated acting; clean transitions with no morphing; the end card dissolves out of the bar.
- **The device floats** from the switch to the end. The checker's `HOLD` rule fails "held / at her side / in one hand".
- **Next pass:** the problem must fit its bar background, and InnocenZ's benefit must be shown as a felt "after" in the bar, plus the research on 30-second service ads.

**v9, 9 Oct evening (all 24 verified, on Drive as v9 once uploaded)** — owner's last rules that day:
- **Casting:** PRs are beautiful Malaysian Chinese women aged 20–30. Agency and outlet people are men or women aged 30–50 (and looking it), "malaysian chinese and indian priority". The changes:
  - Siti→Divya (no hijab, which would offend in a bar)
  - Azlan→Marcus
  - Faizal→Arjun
  - Elaine, Daniel, Richard and Jordan re-cast as Chinese or Indian
  - Raymond 48, Chloe 30, Richard 47
  - Enforced by `STAFF_AGE`, `STAFF_NAME` and `OLD_ETHNIC`.
- **Research** (TikTok, Meta and YouTube guidance plus 27 ads; playbook at `Downloads\InnocenZ-marketing-08Oct\InnocenZ-30s-ad-research-playbook.md`):
  - The owner kept the 9 s sad Part 1, with the whole hook in its first 3 s.
  - CTA is "✨ Link in bio", shown and said. Description links aren't clickable on Shorts, TikTok or Reels.
  - Each bar background shows its problem, and the benefit is the person's visible "after".
- **No blur frame:** crash or snap zooms and whip pans are rewritten to clean push-ins, the writers never say "blur", and the CRISP line applies.
- **Lip-sync:** a line said TO CAMERA has the face clear. `SPOKEN_TRIM` keeps every "Yess" line at ≤ 4 words a second; 4.0 worked in pr1.MOV.
- **Paid ads:** TikTok Malaysia bans ads for bars and hostess-type work, so paid boosting needs a separate bar-free cut. Organic posting is fine, with the AI label switched on.

**Seedance one-paste prompts, 9 Oct:** the owner now generates whole shorts in one paste with Seedance 2.5 (Higgsfield at about 210 credits for 30 s, or Genspark's AI Video), and wants each short ≤ 30 s, shorter being better. The project skill `/30secvideoprompt` (`.claude/skills/30secvideoprompt/`) turns one row's F · G · H into a ~9k-character Seedance prompt.
- It holds a template, rules, `check_prompt.py`, and two reviewed examples: AG-01 Grace (28 s) and OU-01 Kenneth (29 s).
- The prompts are saved in `Downloads\InnocenZ-marketing-08Oct\*-SEEDANCE-*.txt`.
- Image 1 = round badge, Image 2 = square gold logo (`innocenz-logo-white`).
- Artlist's FREE models are image-only; for video, use Seedance 2.5 (paid credits).

**Later on 9 Oct — two lessons from a wasted render:**
- **Paste only the Seedance prompt.** The owner pasted OU-01's whole 58,316-character F · G · H into Higgsfield. The 30 s render was Part 1 stretched out: no switch, app, cards or end card, a hand holding an iPhone, and "PR's" with the wrong emoji. The workbook cells are the director's brief; only `*-SEEDANCE-*.txt` goes into Seedance.
- **The title never covers the person** (owner: "the top title make no hide or cover the person"). The top 30% of the frame is a clear band for the badge, title and small logo only. The person is framed below it with headroom, head and raised hands under 30% down. `check_prompt.py` fails a prompt without this wording.

**Evening of 9 Oct — renders checked, v10 built:**
- **Casting.** The owner said 40, then 35, then settled on: "make the agency and outlet age no exceed 40 years old , pr no exceed 30 years old". So agency and outlet people are 30–40 *and look it*: no grey or salt-and-pepper hair, no reading glasses, no "mature". PRs are 20–30.
  - Eight people were re-cast: Marcus 39, Kavitha 38, Daniel 40, Raymond 40, Kenneth 40 (short black hair), Vikram 38, Richard 40, Hari 40.
  - Grace keeps 38, with plain glasses.
  - Enforced by `STAFF_AGE`, `OLD_AGE_LOOK`, `verify_v8.py` and the skill's `check_prompt.py`.
- **Titles follow PR #1's finished short.** On the Agency 1 render the owner said "the center title is too below": the CapCut title at 15–24% covered Grace's glasses. Then: "The center title can make like the pr1 which is the success pr full shorts video, no hide and cover the pr" + "All follows". Measured on pr1.MOV:
  - the problem title's two lines sit at **11–19%**, just above the head (CapCut top edge **210 px**, was 290)
  - "Solved with InnocenZ" is a **full-width deep-purple band across the very top, to ~12%** (CapCut: down to 230 px)
  - the head starts at about 17–21%
  - subtitles sit at about 65–75%

  Every selfie, medium shot and close-up carries its own "top of the head under 21% down". In Grace's render each shot's own framing beat the global rule: a push-in lifted her head to 12% for 11 s. The small logo under the last title is now 10% of the frame width (was 18%).
- **The first one-paste Seedance render** (Agency 1, Grace v3) carried all three parts through. Where it failed:
  - no top title at all
  - "Innocentz" misspelt, plus card and subtitle typos
  - an Apple logo on the tablet
  - her finger on the floating screen, and her hand laying the tablet down
  - an extreme close-up that put the subtitle on her lips
  - a crown with no Z on the app (Image 2 was probably the wrong file)

  The skill's lessons 23–24 hold the wording that prevents each one.
- **v10 workbook** (`Downloads\InnocenZ-marketing-08Oct\marketing-v17-v1-v2.xlsm`, v9 kept as `.v9-backup.xlsm`). It carries the casting, title and small-logo changes above, plus the end-card voice spread over the last two beats. The read-back found 0 failures; the same new checks give 152 failures on v9. The mutation test catches 36/36. The owner has to upload it to Drive.

**Why:** these are the owner's own corrections after seeing the reels and the first Genspark result. Ask before reverting any of them.

**How to apply:**
- The tooling is in this session's scratchpad `v2/`: `build.py` (deterministic lines + a checker that caught 20/20 planted faults), `patch_xlsm.py` (an in-place shared-string swap) and `out/<vid>.txt` (the creative parts).
- Rebuild on top of the newest Drive copy and verify every cell.
- Then upload per [[marketing-xlsm-upload-every-change]]. Related: [[marketing-video-records-roles]], [[never-round-trip-marketing-xlsx]].
