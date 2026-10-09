---
name: 30secvideoprompt
description: Turn one InnocenZ V2 marketing short (the F · G · H prompts of one problem-statement row in marketing-v17-v1-v2.xlsm) into ONE Seedance 2.5 prompt for a vertical short of at most 30 seconds, ready to paste into Higgsfield or Genspark. Use when the owner types /30secvideoprompt, asks for a "Seedance version" of a short (e.g. "agency 1", "outlet 1 Paying for PRs who weren't there", "PR 3"), or pastes a row's three prompts and wants one prompt for a whole 30-second video.
---

# /30secvideoprompt — one Seedance 2.5 prompt per short (≤ 30 s)

The workbook's F · G · H prompts are long director's briefs (~40–60k characters). A video model follows a short,
structured prompt far better, so this skill rewrites ONE row into ONE Seedance 2.5 prompt that keeps every detail that
shows on screen or in the sound. Every generation costs the owner credits that cannot be claimed back — nothing is handed
over until the checker passes and three independent reviewers have tried to break it.

## 1. Get the row
- The owner names a row ("agency 1", "outlet 1 …") and/or pastes its three prompts. If only named, read F/G/H from the
  workbook — role tabs `v2 pr shorts` / `v2 agency shorts` / `v2 outlet shorts`, **row 6 = #1 … row 13 = #8** — from
  the Drive file `1VQDGONrZJ2j-aHVt5XkYj2wJ3AFK2UM1` (download fresh; the local copy is
  `Downloads\InnocenZ-marketing-08Oct\marketing-v17-v1-v2.xlsm`).
- Save the three cells, one after another, to `<ROLE-NN>-full-FGH.txt` in the scratchpad (the checker needs it).
- Note from them: the person (name, age, ethnicity, role, hair, glasses, the covered bar outfit), the bar SETTING and the
  props that show the problem, the problem title (with its emoji), every spoken line with its beat, the three card labels
  and icons, the end-card tagline, the row's NEVER list.

## 2. Plan the timeline (≤ 30 s — the owner: "dont exceed 30second lesser would be better"; aim for 28–29 s)
| Window | What |
|---|---|
| 0–2 s | SELFIE line 1 — the first frame is already mid-emotion, title on screen, line starts at 0 s |
| 2–4 s | voice-over line 2 over two cutaways (eyes close-up with the mouth out of frame, then a POV of the hands); the device lies face-down |
| 4–5, 5–6 s | two silent 1 s beats of big, exaggerated despair (one clear action each) |
| 6–8 s | SELFIE line 3 ("from 6.2 s"), face clear to the lens |
| 8–9 s | CUT to 50 mm: device laid face-down; 8.5 s silence + a short DJ riser |
| 9–10 s | THE SWITCH: bass drop, gold flash, the device floats by itself showing the InnocenZ app, the bar comes alive, double take |
| 10–11 s | the clean-up: hand sweep (tears gone, hair/glasses neat), the problem props tidy themselves; the "after" begins |
| 11–12 s | device drifts beside the shoulder; point at its screen without touching it |
| 12–16 s | the "Yess — …" line to camera |
| 16–22 s | three cards, 2 s each, each label said to the lens |
| 22–23 s | cards stack, one big gesture (wink / thumbs-up) |
| 23–25 or 23–26 s | the Part 3 line (2 s for ≤ 6 words, 3 s for more), device still floating or gliding down by itself; small @Image 2 logo pops in under the title |
| last 2.5–3 s | END CARD; the off-screen call-to-action voice gets at least 1.5 s |

Shift only to keep every line at **4 words a second or less** (count words without the dash).

## 3. Write it in the template — blocks in this order
`REFERENCES` · `STYLE` · `<PERSON>` (WOMAN / MAN) · `PLACE` · `TEXT` · `SHOTS` · `SOUND`. Copy the fixed wording from
`examples/AG-01-Grace-28s.txt` (accepted after three reviews), `examples/OU-01-Kenneth-29s.txt` and, for a PR short
with a PHONE, `examples/PR-02-Jess-28s.txt`. The checker reads card labels and end-card lines from SHOTS only (a wrong
label on the card can no longer hide behind its correct subtitle).

**Seedance lessons (from the reviews — each one prevents a wasted render):**
1. `@Image 1` = the round crown-Z badge (only the small corner logo). `@Image 2` = the square gold crown-Z logo (app screen and
   end card). Every logo mention points at one of them; a logo described only in words comes out invented. Never "@logo".
2. **Quotes are speech only.** All on-screen text goes in `[brackets]`, with that rule stated at the head of TEXT.
3. Shots are `a–b s — …`, contiguous from 0; write `CUT` for every hard cut; one camera move per shot. Never slide between
   "the device IS the camera" and a normal camera inside one shot — cut.
4. Positive phrasing (Seedance has no negative prompt): say what to show, not a list of "never".
5. Spoken lines: `she says: "…"`; on camera the face is clear and turned to the lens for the whole line; a voice-over beat
   frames the mouth out (eyes close-up, POV hands); put `from X s` when a line starts late in its shot.
6. Subtitles listed with their times and exact words; none on silent beats and none on the end card; about 60% down;
   white bold rounded letters, thin black outline, dark-plum rounded box with a thin gold edge.
7. SOUND block last: **no music before the switch** (room tone only), silence + short DJ riser just before it, bass drop at
   it, two glasses clinking off-screen (sound only), the lounge-house beat to the end, a final chime.
8. Spread the switch over three 1 s beats; no frozen holds (something moves every second).
9. Hair / glasses / tears / outfit states written by time (neat → messy at ~5 s → sleek from the switch).
10. "Alone": background people only far and out of focus, never a face in focus; say the person is office staff, "not a
    hostess", for agency women.
11. References line: "Copy each logo exactly, in its own colours; take nothing else from them. Neither image is the first
    frame." (Never "not their colours" — it reads as "recolour the logo".)
12. Lip-sync ONLY on the to-camera lines (name their seconds in SOUND); the 2–4 s voice-over is a pure point-of-view shot or
    an eyes close-up with the mouth out of shot; the end-card voice is off-screen with "from X s … finished by Y s", and
    the final chord lands before the last frame.
13. Fix the layout so nothing collides: the floating device at one shoulder (say which), the cards at the other, gestures
    with the hand on the card side; big arm moves at waist height below the device and cards.
14. Artefact traps: no hands over rimless glasses (palms to the forehead instead); an open hand is "one thumb, four
    fingers"; card icons say "no numerals", "no symbol", "just the pin, no map"; background guests are "small soft
    backlit silhouettes in the distance"; the small logo under the last title clears with the title.
15. Subtitles: either an explicit list (`0–2 s [line]` …) or, when the prompt runs long, the rule "each to-camera or
    voice-over line in quotes below, word for word, only while he/she says it … none on the end card".
16. Length: aim for ~9,000 characters, never past 10,000 (no Seedance cap is documented; the owner checks that the last
    line is still in the box after pasting). PROOF (9 Oct): the owner pasted OU-01's whole 58,316-character F · G · H into
    Higgsfield — the render followed Part 1 to its last beat and then stretched it over all 30 s: no switch, no app, no
    cards, no end card, a hand holding an iPhone, "PR's" with the wrong emoji. Paste ONLY the `*-SEEDANCE-*.txt` file;
    the workbook cells are the director's brief, never a video prompt.
17. (PR-02 review) Give BOTH hands a job in every beat after the switch. A free hand next to the floating device gets
    drawn gripping it — worst on a line about taking a photo. Park the device-side hand somewhere concrete (resting on
    the counter edge, loose at the side) and put surprise gestures "wide at waist height, well away from" the device.
18. Name the device's side from the very first float ("beside her face on her right (frame left)"), not only from the
    next beat — otherwise it crosses her face to reach its shoulder.
19. Problem props are "until <the beat that clears them>", never "in every shot" — a global line fights the "after"
    and puts the props back on the benefit shot. Phrase the after positively ("the bare, glowing counter"), never
    "not one chit left", which names the prop again.
20. A voice-over close-up must be buildable: "her eyes peek over the box, the box hiding her mouth" — not "eyes above
    it, mouth below the frame edge", which is impossible with the prop in frame and ends in visible, lip-syncing lips.
21. When trimming for length, never cut the two guards: "[brackets] = the only on-screen words" and "nothing readable on
    any paper" (chits, menus, receipts in close-up invite invented prices). If an action happens at counter / waist
    height, the framing must include it (a waist-up shot, the counter top in frame).
22. Icon wording: "a small numberless clock face", not "a clock, hands only" — the word "hands" can draw human hands.
23. (Agency 1 render, Grace v3 — the first real Seedance one-paste result: all three parts came out, 30 s) What still
    went wrong, and the wording that now prevents it: an Apple logo on the tablet's back → "in a plain matte-black case
    covering its whole back, no logo" and NO "iPad" token ("a slim, magazine-sized tablet"); her finger touched the
    floating screen → no pointing at the device at all ("both hands flat on the table, a delighted nod toward it"); her
    hand laid the tablet down (face-up, upside-down) → the device keeps floating to the end, both hands given jobs; an
    unrequested extreme close-up put the subtitle on her lips → no extreme close-ups, the voice-over is "her point of view"
    (not "her view", which drew her face); her cards stacked over the tablet into the title band → cards at the OTHER
    shoulder; no top title at all → the owner adds it in CapCut (top edge 210 px); she looked older than 38 → "looks
    mid-thirties with smooth skin"; the app showed a crown without the Z → "@Image 2 = the square gold crown-above-Z logo"
    and check the thumbnail before generating.
24. (Kenneth, long brief pasted by mistake) An iPhone appeared instead of his tablet → "magazine-sized" (no "iPad");
    "PR's" → "PRs = P, R, lowercase s" in the TEXT header; the 😤 drawn as a sad face → "😤 = steam from nose"; numbers on
    the "blank" tape → "nothing readable on any paper" next to every paper prop; a palm against his mouth on a to-camera
    line → hands "at shoulder height, clear of his face"; give the device-side hand a job ("right hand in his pocket").

**Owner rules (all still in force — see `docs/claude-memory/v2-shorts-prompt-style-08oct.md`):**
- PR = phone; agency/outlet = an iPad-style tablet with a plain back and no logo; ONE device. Part 1: the selfie camera
  (held, never seen), face-down when not filming. From the switch it FLOATS by itself, never held, never a third hand; in
  Part 3 it keeps floating or glides down by itself.
- The bar from the row's SETTING, gloomy after-hours until the switch, alive after; the background shows THE problem from the
  first frame; the benefit is shown as the person's "after".
- The row's covered bar outfit word for word, the same all through. **Cast (owner, 9 Oct: "make the agency and outlet
  age no exceed 40 years old , pr no exceed 30 years old")**: PRs beautiful Malaysian Chinese 20–30; agency/outlet
  Malaysian Chinese or Indian, 30–40 AND looking it — no salt-and-pepper/grey hair or temples, no reading glasses
  (plain glasses), no "mature". The checker fails an age outside the range or an older-look word.
- **The titles are laid out exactly like PR #1's finished short, never covering the person** (owner, 9 Oct: "the top
  title make no hide or cover the person"; on the Agency 1 render "the center title is too below" — the CapCut title at
  15–24% covered Grace's glasses; then "The center title can make like the pr1 which is the success pr full shorts
  video, no hide and cover the pr" + "All follows"). Measured on pr1.MOV: the problem title's two lines at **11–19%**
  down, just above her head; **[Solved with InnocenZ] a full-width deep-purple band across the very top, top edge to
  ~12%** (crown above the words, gold underline); her head starting at ~17–21%; subtitles at ~65–75%. TEXT opens with
  "Layout as in PR #1's finished short: the top 20% … under 21% down, so the title never covers any part of her/him.
  Problem title centred in the upper 11–19%, just above her/his head", and the Solved line says "a full-width deep-purple
  band across the very top (top edge to 12% down)". **Every selfie, medium shot and close-up carries its own head anchor
  ("the top of her head under 21% down")** — in Grace's render each shot's own framing beat the global rule (a push-in
  lifted her head to 12% for eleven seconds); no push-ins into a talking line. CapCut: problem title top edge 210 px of
  1920 (not 290), the Solved band from the top edge to 230 px. The checker fails a prompt without these words;
  `python -I title_band.py <prompt.txt> she|he` brings an older prompt up to date.
- **Spell the brand for the model**: "[InnocenZ] (spelled I-n-n-o-c-e-n-Z)" on the app screen and the end card — Grace's
  render wrote "Innocentz" on both. Seedance also drew "vaucher", "Receets", "PR's": check every word on the first render
  and fix text in CapCut rather than re-generating.
- Title: the problem title exactly (emoji kept, 2 lines) → red strike-through → `[Solved with InnocenZ]` gold on a
  deep-purple band, small gold crown, thin gold underline, nothing beside it → dissolves into `[✨ Link in bio]` → clears
  with the round badge before the end card. Badge top-left the whole time until then.
- End card: the person gone; plum-to-black gradient, gold bokeh and rising particles; the @Image 2 logo with one diagonal
  shine and a halo pulse; `[InnocenZ]` champagne-gold serif; the row's tagline; the pill `[Find out more — link in bio.]`
  with a shimmer and a gold arrow bouncing twice; the voice says it once off-screen; the bottom 15% empty.
- Every spoken line, card label and claim word for word from the row (the sheet already holds the trimmed "Yess" lines).
  Never add a claim; keep the row's NEVER list true (phrase it positively).
- No blur: never write blur/blurred; no crash or snap zooms, no whip pans; face, hands, device and key props sharp.

## 4. Check, then try to break it
1. `python -I .claude/skills/30secvideoprompt/check_prompt.py <prompt.txt> <ROLE-NN-full-FGH.txt>` must print `RESULT: OK`.
   Prove the instrument on a copy with one planted fault (change a card line, or end a shot at 31 s) — it must FAIL.
2. Three independent reviewers (a Workflow when available): **coverage** vs the full F/G/H; **how Seedance behaves**
   (structure, text rendering, references, hands, artefacts); **timing, lip-sync and continuity** walked second by second.
   Apply every real finding, then re-run the checker.

## 5. Hand over
Save to `Downloads\InnocenZ-marketing-08Oct\<ROLE-NN>-<Name>-SEEDANCE-<N>s.txt`, send it, and give the owner these steps:
- **Higgsfield:** Video → Seedance 2.5 → 9:16, 720p, audio On, duration = the prompt's seconds (or 30 if not offered).
  Attach Image 1 = round badge, Image 2 = square gold crown-Z logo (`innocenz-logo-white`). Paste; replace each typed
  `@Image 1` / `@Image 2` by picking the image from the `@` menu.
- **Genspark:** Content Creation → AI Video → Seedance 2.5 (not "Seedance 2"), same settings; put this line on top:
  *"Make ONE N-second vertical 9:16 video with Seedance 2.5, 720p, sound on. Use the prompt below exactly as written — do
  not rewrite, shorten or split it. Image 1 = the round badge, Image 2 = the square gold crown-Z logo."*
- Check the first result before making more: the logo stays top-left; "Solved with InnocenZ" has no stray mark; no hand on
  the device after the switch; subtitles match the words. Any garbled text → add it in CapCut instead.
- A PR short: never attach the club-girl reference photo in Seedance (it would copy her face and off-shoulder outfit).
