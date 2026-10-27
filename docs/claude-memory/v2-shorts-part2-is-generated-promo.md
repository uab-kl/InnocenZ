---
name: v2-shorts-part2-is-generated-promo
description: "The V2 Shorts Part 2 'InnocenZ intro animation' is a Genspark-generated promo, NOT a recording of the real app or website; it exists to make people aware of benefits and services InnocenZ really has (owner, 7 Oct 2026)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4d397639-ec88-47b6-904f-feb038ff76f4
  modified: 2026-10-12T06:11:52.145Z
---

Owner, 7 Oct 2026: *"the 2) innocenz intro animation is no really capture recording from the true app and
website, is just a prompt that to generate the video to make more people know that innocenz have this
benefits and service."*

**Why:** the marketing V2 Shorts are three Genspark clips per problem statement — 1) avatar + problem (≈9 s),
2) InnocenZ intro animation (≈12 s, 浮夸), 3) ending with the logo (≈5 s). Part 2 shows stylised cards with
blank bars and no readable numbers; it is awareness material, so nobody should try to screen-record the
portals or the PR app for it (that is V1 guidance's job, with real test data).

**How to apply:** keep Part 2 prompts stylised ("no real app screen, readable text, numbers or ringgit") and
label them "generated promo, not a screen recording". The claims inside them still follow the owner's other
rule from the same day — *"only do what InnocenZ confirm have and 100% that works include backend UI"* — so
every benefit or service a card names must be a feature confirmed in the code (backend handler + the screen
that role really uses), never Beta/half-built.

**ONE TAB (owner, 7 Oct 2026):** *"just keep one tab i follow"* — the owner chose **V2 ProblemStatementsSellingPoin**
and had **V2 Shorts DELETED** (uploaded 11:54 UTC; the older version with it stays in Drive › Manage versions for
30 days unless marked Keep forever). Never re-create a second prompt tab. Its rows 6–35, per role: A `#k / 8⏎id⏎V-XX-NN`
· B problem · C how InnocenZ solves it · D benefits · E purpose · F/G/H the three prompts · I ① checked · J ② clip
links · K/L/M ③ FINAL prompts · N notes · O ④ combined short · P video + recorded short + film check · Q code evidence.
The Timeline tab carries the schedule and points at those columns.

**Second-by-second storylines (owner, 7 Oct):** *"what second what action, subtitle face expression, body posture"*
— every prompt carries `STORYLINE — SECOND BY SECOND (≈9/12/5 s)`, one beat per second with ACTION · FACE · BODY ·
CAMERA · LIGHT & SOUND · ON SCREEN · SUBTITLE; only the spoken beat may span 2–4 s and its SUBTITLE is the exact
"EN | 中文" line. `storyline-blocks.cjs checkBlock` enforces it.

**⚠️ SUPERSEDED (12 Oct 2026):** the "REEL STYLE" block below was this device's 8 Oct plan and was NEVER applied. The
owner's later rules (another device, 8–9 Oct) won and are in [[v2-shorts-prompt-style-08oct]]: a DIFFERENT girl per PR
short (not one "Jia Xin"), every outfit a COVERED bar outfit (never off-shoulder), the round `innocenz-logo-round.png`
badge, English-only speech and subtitles, the role tabs `v2 pr/agency/outlet shorts` holding F·G·H. Read that file, not
the block below, before touching the shorts.

**REEL STYLE (owner, 8 Oct 2026) — superseded, kept only as history:**
*"for now i want the InnocenZ logo at the top left"* · *"change the all pr looks … like this chinese girl"* (the owner's
club-girl reference clip) with Part 1 distress from their list (worried, anxious, frowning, troubled, fretful, verge of
tears, aggrieved, hurt and tearful, fighting back tears, messy/dishevelled/wild hair) · *"problem statement clips the
title at up middle"* · *"2) … suddenly from sadness to hapiness … with the benefits and explanation"*.
- Every PR = the PR LOOK (beautiful Malaysian Chinese woman 25–30, long straight dark-brown hair, centre part, soft glam,
  red off-shoulder top with yellow trim + beige pleated skirt, no lettering); the 8 PR videos share ONE heroine,
  **Jia Xin, 26**. Agency/outlet main avatars keep their own people; any PR in their scenes wears the PR LOOK.
- Logo = Drive "innocenz-logo-dark" (3) ending/innocenz logo; 145×145 navy badge = the owner's attached image) top-left
  ~150 px, below Instagram's "Reels" label. Title = the column-B headline top-centre (15–26% down) + a 中文 line; Part 2
  strikes it through into "✓ Solved with InnocenZ / ✓ 用 InnocenZ 解决了". Subtitles lower-middle (63–72%), never at the
  very bottom (Instagram's caption covers it). Part 2 opens `0–1 s · STILL SAD` → `1–2 s · THE SWITCH`.
- These global lines live ONLY in `scratchpad/xl/restyle.cjs` (builder adds them via `overlay()`); per-video text is in
  open-prompts/redo JSON; `node restyle.cjs check` + `verify-cross` enforce it.
- Lessons from the owner's first Genspark render of PR #1 Part 1: the first shot came out letterboxed, the subtitle was
  tiny/at the very bottom/a second early, the woman looked 30+ and plain, no tears — and Genspark DID render EN + 中文
  text correctly (so on-screen titles are feasible).

**Cast rule (owner, 7 Oct 2026):** *"for the pr all character is the malaysian female age 25 years old to 30
years old"* — every PR on screen (the main avatar of a PR video and any PR in the background of an agency or
outlet video) is a Malaysian woman aged 25–30, the same age in all three parts. Every prompt carries the line
"CAST: every PR in this clip — the main avatar or anyone in the background — is a Malaysian woman aged 25 to 30."
and `verify-cross.cjs` fails on a PR avatar outside 25–30, without "Malaysian … woman", or with different ages
across parts. Agency/outlet staff avatars (owners, finance, ops heads) are NOT PRs and keep their own ages.

Related: [[marketing-xlsm-patch-and-upload]], [[marketing-video-records-roles]].
