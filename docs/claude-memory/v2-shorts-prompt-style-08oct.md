---
name: v2-shorts-prompt-style-08oct
description: "Owner's V2 short-prompt style (now Higgsfield; 9 Oct BAR rewrite: one covered bar outfit per short, every part set in a bar, bass-drop bar switch) — from Thu 8 Oct 2026: round crown-Z badge in the very top-left, big title top-centre with NO 'POV' label, different Malaysian Chinese girl per PR short, sad English talk-to-camera monologue (selfie vlog + first-person cutaway), Part 2 sad→happy SWITCH, English-only speech and subtitles"
metadata:
  node_type: memory
  type: project
  originSessionId: e03eb10b-304b-437d-b23f-ca2a81413a4e
  modified: 2026-10-15T04:17:07.204Z
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
  - CTA was "✨ Link in bio", shown and said, because description links aren't clickable on Shorts, TikTok or Reels.
    **SUPERSEDED 12 Oct 2026 by the owner's own call: "✨ Link In Descriptions"** (see the 12 Oct brand section below).
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

**Late 9 Oct — F · G · H become one short prompt in three parts (v11):**
- **The owner's ask:** "make that i paste the prompt 1,2 and 3 together , or 1 each 2 and 3 each , to genspark or higgsfields … no exceed 30 second , no remove all the important details". "Mostly" they paste all three together.
- **Format:** every row's F · G · H is ONE checked Seedance prompt in three parts, about 12,500 characters together.
  - Part 1 holds REFERENCES · STYLE · PERSON · PLACE · TEXT, its shots and a `SOUND 0–A s:` line.
  - Parts 2 and 3 each carry a header (window, clip length, "starts exactly on a screenshot of Part n's last frame"), a `SAME AS PART 1:` recap, their own shots and their own SOUND line.
- **Long briefs** moved word for word to K · L · M ("not for pasting"). The top notes went to a new "V2 Change log" tab.
- **Seedance reads about 15,000 characters.** Kenneth's 58,000-character paste filmed Part 1 only; Grace's 8,000 came out whole.
- **Never tag "PR #1" in a prompt.** The model has never seen it. The measured design is in `Downloads\InnocenZ-marketing-08Oct\PR-01-pr1MOV-frame-by-frame-design.md`:
  - problem title at 12.5–18.5%
  - "Solved" a full-width #391F3F band to 12–14%
  - subtitle box at 64–77%
  - end-card positions
- **Checker gaps found and fixed.** In some briefs the source-matching never saw the Yess line or the card labels: quote marks inside the heading, "CARD ONE/FIRST CARD/HAPPY — CARD ONE" spellings. It now fails loudly when it cannot see three labels or five lines. It also checks:
  - subtitle timing against the spoken shot
  - the words "only while … says it"
- **Tools:** `check_parts.py` (each part alone + together) and `split_fgh.py`, both in the skill. Grace's hand-made model is `examples/AG-01-Grace-3part.txt`.

**12 Oct — a session on another device rebuilt all 24 as ONE-PASTE prompts; Drive is the master.** Read the Drive file's
"V2 Change log" (rows 29–33) before touching any prompt. On 12 Oct the owner decided:
- **Prompt layout:** F = header + REFERENCES … TEXT + Part 1; G = Part 2 shots; H = Part 3 + one SOUND block.
- **Wording:** curly “ ” speech quotes (Sheets doubles straight quotes); "Yes", not "Yess"; [✨ Link In Descriptions] and "Find out more — link in descriptions."; "Title stays." / "Band stays." on every shot.
- **Brand and devices:** InnocenZ as plain letters ("nothing on or between the n and the Z"), the hyphen spelling is gone; the tablet is "11-inch … as big as an A4 sheet, always landscape".
- **Length:** rows ~13,000–13,700 characters (owner: keep details rather than trim).

A second, independent check the same day (checker `scratchpad/chk1012/check_v12.py`, 13/13 planted faults caught) fixed 4 gaps the other session left:
- the tagline "whole at once" fix reached only 14 rows
- PR-01/04/05 still said "PR #1"
- the third card in OU-01/08 and PR-06 did not jump out
- the downward point-of-view shots drew the face (Outlet 3 render) → "the frame filled edge to edge by the table top and his hands"

Instrument lessons:
- A Google Sheets save pads a tab with empty rows to 1000 and renumbers the styles. Append log rows after the last row WITH cells, copy the styles from that row, and drop the 15.75 pt fixed height.
- A title emoji may be described in the TEXT heading, not beside the title. Search the whole prompt.
- Subtitles now sit inside the shot lines, so card labels must be read with the "Subtitle:" tail removed.
- Renders the owner downloads are 480p. Drive refuses downloads over 10 MB (outlet2 and agency1 were not viewable).

**Evening of 12 Oct — the OWNER now adds the title and the band; the video model draws neither.**
The decision came after the Agency 3 render, made with "Seedance 2.5 Draft" at 480p. It drew "{ your three pay spreadshoets }" (the [ ] marks drawn as braces, 🤯 drawn as "?") and "Solved with InnoceinZ", "InocentZ", "Built from ships".

Owner: "remove the center title 0s-10s title and the 10s-26s , i will add it". So all 24 prompts have:
- no problem title, no red strike-through
- no [Solved with InnocenZ] band, no [✨ Link In Descriptions], no small band logo
- "the top 20% of the frame stays clean background with only the round badge — no words there, a title is added later in editing"
- every "under 21% down" head anchor kept

Asked how to fix the words, the owner chose "keep words, use full 720p". So subtitles, cards, the tablet screen and the end card are still drawn by the model. Generate with full Seedance 2.5, NOT Draft. The A2 notes say so.

Checker: `scratchpad/chk1012/check_v13.py`. It fails all 24 old rows, catches 11/11 planted faults, and passes the 24 new rows. Rows are 11,594–12,443 characters.

Root cause, for future questions: video models paint letters and "correct" InnocenZ towards "Innocent". Attached pictures (the badge) are copied perfectly every time; typed words are not.

Before handing over a workbook, re-check the Drive modifiedTime. It moved twice in one evening: an owner upload at 11:19, then a Google re-save at 14:20 that changed only the styles. Rebuild on the newest copy.

**Night of 9 Oct — v11 built (the owner must upload it):**
- **Priority order.** Each role's 8 rows are re-ordered most-helpful first, using a 9-judge ranking. Every row moved whole with its V-number.
  - PR: 01 02 04 03 06 07 08 05
  - Agency: 01 02 05 03 06 08 07 04
  - Outlet: 01 04 03 02 08 05 06 07
- **Story spine** (in SKILL.md): hook → countable pain → switch on the same device → 3 proofs, strongest first, acted out on the problem's own props → payoff.
- **Devices.** PR = phone; agency and outlet = a "magazine-sized tablet", never the word "iPad".
- **Quality passes.** A 72-agent design pass, then one fresh reviewer per role walked every short second by second. The fixes also made the shared wording the same across all 24.
- **Result.** All 24 are 13,470–13,494 characters, and `check_parts` reports OK. `build_v11.py` read back 24 rows with 0 failures; 248 formulas; only the 4 V2 tabs changed, plus the new Change log tab.
- **Files.** `Downloads\…\marketing-v17-v1-v2.xlsm`; the old v10 is kept as `.v10-backup.xlsm`.
- **Left for a render to settle.**
  - Text can still come out garbled → fix it in CapCut.
  - OU-03/04 2–4 s hands-POV: if a face appears, switch to "a top-down shot straight onto the table".
  - Emoji in AG titles and OU-03/04/08 have no description.
  - Every file is within ~30 characters of the 13,500 limit, so any addition needs an equal trim.

**Mon 12 Oct 2026 — PR ages 20–28** (owner: "pr all the ages 20 to 28"; supersedes 20–30). Jia Xin 30 → 28, Joanne 29 → 27;
the other six were already 25–28. Agency/outlet stay 30–40. `sd/onepaste-check.cjs` enforces it. (The repo skill's
`check_prompt.py` still says 20–30 — the repo was not edited; update it when the repo may change.)

**Mon 12 Oct 2026 — ONE PASTE**: the owner copies F:H together from Sheets into Higgsfield and does NOT use CapCut. Copy test:
Sheets wraps each multi-line cell in "…" and DOUBLES inner straight quotes, TABs between cells → speech uses curly “ ”.
Each row = one prompt in three cells: F header "ONE N-second vertical 9:16 short — F, G and H … one continuous video" +
REFERENCES/STYLE/person/PLACE/TEXT + Part 1 shots; G = Part 2 shots; H = Part 3 shots + one SOUND block last. No "Pasted
alone"/"SAME AS PART" (they told Seedance "make a 9-second clip" inside a 29-second video). Keep every detail ("dont throw
the details"): cap 12,500 chars, aim ≤ 12,000. Checker `sd/onepaste-check.cjs` (Node port of check_prompt.py + one-paste
rules; 15/15 planted faults caught). Brief `sd/onepaste-spec.md`.
DONE + uploaded 12 Oct 07:12 UTC (1,303,856 bytes, byte-identical): all 24 rows rebuilt by /30secvideoprompt agents (writer →
3-lens reviewer → fixer; 9 real findings in 7 rows, all applied), 11,966–12,487 chars per row, ≤ 7 @Image mentions; role-tab
row-5 headers, master headers (rows 7·17·27) and both A2 notes now say "select F · G · H, copy, paste as ONE prompt";
change log row 30. Read-back: 242 written cells exact, 10,892 others unchanged, checker 0 problems on all 24.

**Mon 12 Oct 2026 — titles & subtitles fixed in all 24 rows (owner: "just fix the title and suntitles words for me"),
uploaded 06:10 UTC, 1,312,905 bytes, byte-identical round trip.** What the renders got wrong: outlet 1's 6–8 s line
jumped into the title box and its title vanished from 4 s; "Innocen'z", "InnocentZ", "Innocentz", "InocenZ",
"InnocerZ"; "Yess" drawn as "Yes"/"Yees"; "PR's" for PRs; "chip" for chit; "receit"; a garbled 15-word subtitle; the
check-in card drawn as a MIDDLE FINGER. Short subtitles (≤ 6 words) came out word-perfect; the big "Solved with
InnocenZ" band usually spelled right. The owner's finished pr1 uses CapCut subtitles of 4–6 words, "Yes — with InnocenZ…".
- Each spoken line's exact subtitle chunks (≤ 6 words, own seconds) now sit at the end of the shot that speaks it
  ("Subtitle: 12–13.3 s […] · …"); the one long list in Part 1 is gone. One rule per part: spoken words only in the bottom
  box. A SPELLING line per part (only the words on screen in that part). "Yess" → "Yes" in voice AND subtitle. Part 2
  names the exact title it strikes out. Part 1 shots end "Title stays.", Part 2 shots after the switch "Band stays."
  Card icons: plain gold objects, never a hand or finger.
- Length: rows were 13,47x–13,49x (the other device's cap); now 13,498–14,161. No published Seedance limit; evidence = a
  13,500-char one-paste rendered all three parts, the 58,316-char brief stopped after ~Part 1. Don't grow past ~14.2k.
- Tooling (scratchpad `sd/`, this machine): `words.cjs check <rows>` (9/9 planted faults caught), `fixwords.cjs`,
  `mkedits.cjs`, `verify-sd.cjs` (reads the patched file back; master-list formulas kept via patch.cjs's new `fcache` op,
  which rewrites only a formula cell's cached `<v>`). The master tab's F·G·H are FORMULAS to the role tabs — patch both.
- Still true: AI text is never 100% — check every word on the first render and fix single words in CapCut.

**Mon 12 Oct 2026 — brand Z · cards · link (uploaded 08:01 UTC, 1,350,590 bytes, byte-identical round trip; change log
row 31).** From the owner's Agency 2 render: "why that the Solved with InnocenZ that Z got problem ?" (band "Innocem▪Z",
end card "Innocem.Z"), "the animation why stick together" (cards piled up; "One weekly roster" twice; padlock on the
wrong card), "change the Link in Bio to Link in descriptions" then the exact words "✨ Link In Descriptions".
- **Brand:** never the hyphen spelling I-n-n-o-c-e-n-Z (a separator invites a mark inside the word). SPELLING line =
  "InnocenZ = one solid eight-letter word — capital I, then nnocen, then a capital Z set tight against the n"; the first
  [Solved with InnocenZ], the app-screen [InnocenZ] and the end-card [InnocenZ] each carry "(one solid word, its capital Z
  set tight against the n)".
- **Link:** band dissolves into [✨ Link In Descriptions]; pill and off-screen voice "Find out more — link in descriptions."
  (plural, the owner's words). Also changed in the FULL BRIEF · Part 3 column M. Change log keeps the old words as history.
- **Cards: ONE tidy column, never a stack.** Every row had told Seedance "settle in front of the first / overlapping /
  joins them / one neat stack" — a stack is drawn overlapping and overlapping cards trade icons and labels. Now card 1
  "the top slot of the card column", card 2 "the middle slot, a clear gap below the first", card 3 "the bottom slot …
  above the subtitle", the after-beat "hold their tidy column, evenly spaced, each fully visible", and TEXT has
  "• Cards: … top [A], middle [B], bottom [C] … a clear gap between each … only its own icon and label".
- **Tablet size:** agency/outlet "magazine-sized (as big as an A4 sheet)" — Agency 2 drew a phone. Never "held in both
  hands" in the device line (it fights the after-switch float).
- Rows 12,750–13,290 chars; checker cap now 13,500 (proven-whole), warn 13,300. Checker gained card/brand/link rules
  (12/12 planted faults caught). Scripts: `sd/fixbrand.cjs` → `fixcards.cjs` → `fixdevice.cjs`, `mkedits3.cjs`.
- Left as is: the hyphen spelling inside the FULL BRIEF columns L/M (not pasted).

**Mon 12 Oct 2026, later — InnocenZ n·Z + tablet (uploaded 08:27 UTC, 1,351,415 bytes, byte-identical; change log row 32).**
Outlet 3 render (Vikram): band "Innocen▪Z" with a small white mark on the n, and a PHONE floating for an outlet. Owner:
"the InnocenZ the word n fix it" · "just make sure no the white at the n of InnocenZ" · "take phone ,agency and the outlet
take ipad". The owner REJECTED a wordmark-image fix ("your crop background is black , but this is different") — the band
keeps its own bold-gold-on-purple look; never add an Image 3 wordmark.
- **Brand (SUPERSEDES the "one solid word … set tight against the n" note above — it squeezed the n):** SPELLING
  "InnocenZ = eight plain letters, one font, one colour: capital I, nnocen, capital Z — nothing on or between the n and the
  Z"; first band "[Solved with InnocenZ] (plain gold letters, nothing on or between the n and the Z; the crown only above the
  middle)"; every drawn [InnocenZ] (app screen, end card) carries "nothing on or between the n and the Z". Theory: the logos
  are crown-above-Z, so the model hangs a mini crown/sparkle on the word's Z.
- **Device:** PR = phone; agency/outlet = tablet "an 11-inch screen as big as an A4 sheet, always landscape (wider than
  tall)", app "on its wide landscape screen", "a slim menu down its left edge" instead of a bottom bar. Every row ALREADY
  said tablet and Seedance still drew its default phone — landscape is the shape a phone never has. Never write "iPad"
  (draws an Apple logo) and never "held in both hands" in the device line (fights the after-switch float).
- Rows 12,787–13,388 chars. Checker: brand + device rules, 10/10 new planted faults caught. Script `sd/fixbrand2.cjs`,
  `mkedits4.cjs`; `sd/diffwb.cjs` (cell values) + `sd/diffstyle.cjs` (formatting) compare two workbooks.
- **Drive trap:** between uploads the file was RE-SAVED at 08:06 by Google Sheets (owner opened it): 227 KB smaller,
  mimeType → macroenabled, inline strings moved to sharedStrings, readingOrder dropped. diffwb: 0 of ~11k values differ;
  diffstyle: only 9 readingOrder flags. So a modifiedTime change is not always an edit — diff values AND formatting, then
  build on the last good version if nothing real changed. Tell the owner to reload any open Sheets tab before editing.

**Mon 12 Oct 2026, evening — render review (uploaded 10:31 UTC, 1,352,748 bytes, byte-identical; change log row 33).**
Owner: "does this google sheet is correct ? … all the shorts by each role with problem statement … this is my output folder
(Drive 1zjkYZbBII-olfYLLhZGvtsLWxPuz14gu) some (mistake )". The link (gid 1619124456) = master "V2 ProblemStatementsSellingPoin".
- Sheet verdict: correct — 24 rows, 8 per role ranked, master rows 8–15/18–25/28–35 are live formulas to role rows 6–13, 0 stale
  caches, every title/cards/tagline matches its problem/solution/purpose (`sd/crosscheck.cjs`). Column I (Video) still lists
  the OLDER filmed set (V-PR-xx ids, "Recorded short: PR 05 …"), not the new Seedance renders.
- Output folder renders are named "<role><n> (<mistake>)". Read them with Drive download → `sd/renders/*.mp4` → ffmpeg
  `fps=0.5,scale=288:-2,tile=5x3` contact sheet. Every labelled mistake came from an OLDER prompt version (check which: the
  end-card text tells the version). Six faults no version had fixed, now fixed + enforced by the checker (6/6 planted):
  red strike line lingering under the band → "the red line fading with the old words"; InnocenZ misspelt in SUBTITLES →
  "Subtitles spell InnocenZ exactly as the band does."; card icon drawn as a loose clipboard → "Each icon sits small ON its
  own card."; end-card line "word by word" cut off at the last frame → "whole at once, readable before the end"; band kept
  both lines so the small logo sat beside the Z → "fade out fully — one line at a time — and in their place fades";
  "red-rimmed eyes" drew blood-red eyes/red tears → "glassy, teary".
- Rows now 13,017–13,622 chars; checker cap 14,200 (06:10 ceiling), warn 13,500 (longest proven whole). Scripts:
  `sd/fixrender.cjs`, `mkedits5.cjs`, `mutv4.cjs`.

**Mon 12 Oct (other device's session, change log rows 34–35) — SUPERSEDES the in-video title/band rules above.** Owner: "remove
the center title 0s-10s title and the 10s-26s , i will add it" (after a Draft-480p render drew "Solved with InnoceinZ"). The
video NO LONGER draws the problem title, strike-through, [Solved with InnocenZ] band, [✨ Link In Descriptions] or the small
band logo — the top 20% stays clean (round badge only) and the OWNER ADDS THEM IN AN EDITOR. Subtitles, cards, app word and
end card stay in the video. Generate with full Seedance 2.5 at 720p, never "Draft". Rows ~11,600–12,500 chars. The file on
Drive is now `marketing-v17-v1-v2.xlsx` (renamed from .xlsm). My `sd/onepaste-check.cjs` still demands the band — it FAILS
these rows by design; do not "fix" the prompts back to it.

**Tue 13 Oct 2026 — K·L·M timelines + E post descriptions (uploaded 03:50 UTC, 910,842 bytes, byte-identical; log row 36).**
Owner: "redo the KLM cause i no copy all that and paste , so put the subtitle and the title at what seconds" · "at the E for
each video , add one more that the description of each video , what can put at the description when i posted the video".
- K·L·M = "ON SCREEN · Part 1/2/3": what to ADD in the editor (title 0→switch, band switch→link, ✨ link line → end card, the
  row's own band look, the badge to keep clear) and what the VIDEO draws (switch, cards in/out, every subtitle with seconds,
  silent gaps, end card, CTA voice). Built by `sd/timeline.cjs` from the current prompts + the last prompts that had titles
  (`rows1012pm/`); 3 review rounds by agents until 24/24 clean. The old long briefs (72 cells) are archived word for word in
  `Downloads\InnocenZ-v2-shorts-part1\v2-shorts-FULL-BRIEF-KLM-archive-2026-10-13.txt`.
- E = purpose + "📌 POST DESCRIPTION": hook (problem quote + title emoji), what InnocenZ does (ONLY column C, confirmed in code),
  3 ✅ card lines, end-card line, "👉 Find out more: [paste your InnocenZ link here]" (owner must fill — no public link yet),
  5–7 hashtags (#InnocenZ first, a Malaysia tag, no alcohol/nightlife/hostess words). Writers + adversarial claim checkers
  (17/24 tightened), then `sd/desccheck.cjs` (7/7 planted faults).
- Six H repairs: "; ." / ":." left by the 12 Oct band removal (AG-01, AG-03, AG-07, PR-08) and "the stack fades" →
  "the card column fades" (OU-02, OU-08).
- **Drive traps (13 Oct):** the file was re-saved TWICE while I worked (03:01 real edits by the other session; 03:46 a
  Sheets re-save with 0 value changes, 4 font changes) — check modifiedTime right before uploading and rebuild on the newest.
  Every Sheets re-save RENUMBERS cell styles — take a new row's style from its neighbour row, never a hard-coded index.
- **Cast, shorts #6–#8 of every role (owner, 13 Oct: "can make al the person pr , agency and outlet start from 6 to 8 each
  role all chinese ?" · "face also need looks like malaysia chinese asia"; uploaded 04:14 UTC, 588,976 bytes, byte-identical;
  log row 37):** every person there is "Malaysian Chinese with a clearly East Asian face" — a label alone is not enough, the
  face words must say it (light warm-ivory skin, dark almond-shaped eyes, straight black hair where the row had none).
  AG-07 Daniel (was Malaysian Indian) → Malaysian Chinese, goatee kept; OU-06 Arjun → **Jun Wei** (name changed in the
  sound line too), trimmed beard and low fade kept. Shorts #1–#5 keep the earlier "Chinese or Indian" agency/outlet casting.
  `sd/castfix.cjs` (exact guarded replacements), `mkedits7.cjs`.
- **Open-sheet auto-saves (13 Oct):** while the owner has the workbook open in Google Sheets, Drive gets a new version every
  minute or so (03:46, 03:58, 04:08, 04:09 — all 0 value changes, styles renumbered each time; they kept my previous
  upload's content). Diff values before every upload; if 0 changes, rebuild on the newest and upload at once.
- **E column = purpose + 📌 POST DESCRIPTION (FB/IG/TikTok; the owner put REAL link lines in on 15 Oct: innocenz.net,
  wa.me/60122190198, uab.innocenz@gmail.com, unitedalliedbusiness.com — keep them) + 📕 小红书 block (15 Oct, uploaded 02:13
  UTC, 602,246 bytes, byte-identical, log row 38):** title ≤18 chars, Simplified-Chinese note (hook, 3 emoji benefit lines
  after "用 InnocenZ 之后👇", end-card line, comment question, 收藏, 欢迎私信), 4–6 topics with InnocenZ first, added with
  "# 话题" and PICKED from the list (typed #tags stay plain text). RedNote rules (《交易导流违规管理细则》 2026, official): NO
  links/URLs/email/phone/WhatsApp/WeChat or off-app wording in notes, comments, DMs or the PROFILE (bio, name, avatar,
  background) — not clickable anyway and they get notes 限流/removed; no 最好/第一/100%/免费 etc.; avoid 兼职/陪酒/夜场/公主/小姐.
  Only a verified 企业专业号 (RMB 600/yr; Malaysian software co. also needs App Store/Play listing, China-download proof,
  MCMC ASP(C)) unlocks official lead cards — WeChat/WeCom, not WhatsApp. `sd/xhscheck.cjs` (11/11 planted faults).
- **15 Oct oddities, reported to the owner (unanswered when written):** six 13 Oct cast lines were back to the pre-change text
  with no log entry (PR #6–#8, AG-07 Daniel = Malaysian Indian again, OU-07, OU-08) — not re-applied without the owner's
  say-so; and PR-01's E held PR-02's description (wrong-row paste) — PR-01's own was restored with the owner's link lines.
- **RedNote account RESTRICTED, 15 Oct 2026 (账号审核详情, account User6AD195A3 / 95991437173):** "您的笔记、评论、私信及群聊消息，
  目前在特定地区不对其他用户显示", 2026-10-15 11:06 → 2027-01-13 11:06, citing 服务条款第6条 + "区域性可见调整", with 我要申诉.
  Research (2 agents, official terms): a non-China-number account registered after 8 Dec 2025 is a **rednote** user (Rednote
  Technology PTE. LTD., Singapore ToS); §6 is the "Access at our Discretion" clause, not a content rule; "certain region" is
  almost certainly mainland China — Malaysian viewers still see the account. No official page lists triggers. Best-supported
  cause: every note joined 吉隆坡/马来西亚 + PR + 薪/佣金 + 酒水 + 欢迎私信 + unlabelled AI young women in bar outfits = an overseas
  nightlife JOB AD to a mainland reader (China: recruitment accounts verified since Jan 2026; 陪侍 illegal; 10 Oct 2026 China
  Press story of a fake 小红书 high-salary Malaysia job; unlabelled AI content 限流 since Feb 2026). ⚠️ **My own 15 Oct DM
  templates were part of it** — they pitched a 山西 commenter, said "私信你详细说" and told the owner to DM Frank's WhatsApp/email.
  NEVER again on RedNote: no contacts in DMs either, no pitch to mainland users (neutral reply: "谢谢关注～本账号只介绍马来西亚本地
  商家使用的管理软件，不提供任何工作机会或招聘。"), no second account, no VPN, no 包过申诉, no delete-and-repost. Appeal text given to the
  owner (Chinese + English, SSM name to fill, send only after the clean-up it claims). Owner chose "Keep all 24, reworded" +
  "only for xhs": the 📕 blocks are rewritten as SOFTWARE (员工 / 人力公司 / 结算·对账·明细; no PR, 她, 经纪, 薪/佣金/小费, 酒, 上班/打工,
  吉隆坡; ≤1 马来西亚, never in title/topics; no 私信/联系; last line "视频为AI生成，仅作软件功能演示"; turn on 内容声明 → AI生成).
  `sd/xhscheck.cjs` now enforces this (old version `xhscheck.1015.cjs`; it fails all 24 of the 15 Oct notes, kept in
  `sd/xhs.1015/`); new notes `sd/xhs2/`, sheet patch `sd/mkedits10.cjs` (change log row 39). Reminder: re-check the notice on
  13 Jan 2027 — nothing official says it lifts by itself. **Uploaded 04:16:44 UTC, 603,011 bytes, byte-identical.** Three
  adversarial reviewers (one per role) then found what a word list misses, now ALSO banned by the checker (`TRAP`): 场所 (reads
  娱乐场所 → 门店), night cues 每晚/当晚/整晚/半夜/午夜/同一晚 (→ 每天/当天/当班; 今晚 alone is allowed), 今晚阵容 (a club's
  "tonight's girls" board → 今晚当班名单), 订了N个人 / 挑人 (booking or picking people → 名单上N个人 / 安排), 担保人 (担保交易 scam
  word → "Guarantor"), 放飞机 (飞机 = Telegram code → 放鸽子), MC (Malaysian; → 病假), 对数 (= logarithm → 对账), 取消费 (取/消费 →
  取消班的费用); 员工资料 trips the 工资 rule (→ 员工档案); 成员 = office accounts, never the workers. Real meaning slips they caught:
  "部分单据" widened a drinks/tips-only photo rule to every receipt; "按分钟计成本" overclaimed (only the shift fee is per minute).
  Checker proof: fails 24/24 old notes, 11/11 review finds on the pre-review copies (`sd/xhs2.pre-review/`), 15/15 planted.
  Text cannot fix the VIDEOS: AI young women in bar outfits still read as a job ad on RedNote.
- **Shell trap:** `\d` / `\b` inside node -e or heredoc strings get mangled (`\b` became a literal backspace char in a regex,
  `\d` became `d`) — write regexes with the Edit/Write tool or use `[0-9]`.

**Why:** these are the owner's own corrections after seeing the reels and the first Genspark result. Ask before reverting any of them.

**How to apply:**
- The tooling is in this session's scratchpad `v2/`: `build.py` (deterministic lines + a checker that caught 20/20 planted faults), `patch_xlsm.py` (an in-place shared-string swap) and `out/<vid>.txt` (the creative parts).
- Rebuild on top of the newest Drive copy and verify every cell.
- Then upload per [[marketing-xlsm-upload-every-change]]. Related: [[marketing-video-records-roles]], [[never-round-trip-marketing-xlsx]].
