---
name: hotpie-style-agency-promo
description: "21 Oct 2026: owner wants a HotPie-style promo (a competitor's KTV reels) made with Higgsfield — the format, the ~28 s Mandarin agency-boss script, and the three app lines in it that overclaim the product"
metadata:
  node_type: memory
  type: project
  originSessionId: a3eda563-9081-4ac4-bcae-3e8070576d18
  modified: 2026-10-21T07:25:47.736Z
---

On 21 Oct 2026 the owner shared a claude.ai chat (claude.ai/share/75bdd00c-…) and then asked the same thing here:
"how to do this video" about two Instagram reels by **HotPie**, a competitor selling software to KTV/nightlife
venues — InnocenZ's space. Follow-ups: "this kind of video" (the STYLE, not one clip) and "use higgsfield". The clips
are `Downloads\SaveClip.App_AQOXcH….mp4` (long) and `SaveClip.App_AQMp5I….mp4` (short).

**The HotPie format:**
- 1:50 feature walkthrough: host intro in the venue, then ~40 cuts (one every ~2.5 s) — a hand holding a phone with
  the app, the venue's LED effects, hype graphics (fire burst behind 竞争感), contact end card.
- 0:23 pain-point skit: a man on a sofa talks to camera in Malaysian Mandarin mixed with English — the problem (messy
  books, 555 notebook, WeChat records) → 有了HotPie → three benefits → phone number. A cut every ~2 s.
- Shared look (standard CapCut/剪映): big white Chinese captions, black outline, yellow keywords; logo pinned top-right;
  hook title box at the top; zoom 100→115% on key lines; music nonstop under the voice; whoosh/ding/cash-register
  SFX; end card with a logo pop.

**This is the V3 series.** Owner, 21 Oct 2026, verbatim: *"v3 follow this way , not the previous video that
generated in https://drive.google.com/drive/folders/1Ry8q893qlov_ePsY7JjMQX42PUVIs4V1"* — V3 copies the two HotPie
clips, NOT the V2 shorts ([[v2-shorts-prompt-style-08oct]]: English-only, a Malaysian Chinese girl, one-paste
Seedance, no CapCut). Keep the two rule sets apart. The owner asked for a **V3 tab in `marketing-v17-v1-v2`** (Drive
`1VQDGONrZJ2j-aHVt5XkYj2wJ3AFK2UM1`) "to record how to do this"; V3 clips + examples live in Drive folder
`1jG8w4U8-TMz_t4W1LLvZRDxeQ22i8DgO` (subfolder `example`: `hotpie(girl).mp4` = long, `hotpie(boy).mp4` = short).
On 21 Oct the workbook was an **.xlsx** (renamed from .xlsm), 15 tabs, strings in `sharedStrings.xml`, 620,565 bytes,
modified 02:54 UTC — the old patcher lives in session `4d397639…\scratchpad\xl\patch.cjs`.

Frames checked 21 Oct (ffmpeg contact sheets + scene count): short = 22.8 s, 11 cuts, hook box 「KTV老板记账出问题」,
yellow keywords 555 / 微信, end card logo + 「解决KTV记账问题」 + phone. Long = 1:50, 41 cuts, female host in red,
BILINGUAL captions (white Chinese line + small English line under it), hype graphics, end card 「来联系我们吧」 +
phone + "Message us now".

**Recipe:** Higgsfield for the presenter, background shots and hype effects; real screen recordings for the app
(filmed as a hand holding the phone in a neon room); CapCut to caption and assemble. Limits in
[[higgsfield-limits-and-connector]].

**Draft InnocenZ script (~28 s, aimed at agency bosses)**, hook box 「PR Agency算佣金算到头痛？」:

| Shot | Line |
|---|---|
| Presenter frowning at phone | 哇，又要算钱算到天亮… |
| Presenter to camera | Agency的老板，你还在WhatsApp group接booking吗？ |
| Corridor (neon, hostesses to a VIP door) | PR到底有没有去上班，你也不知道 |
| Stress (3 am spreadsheet) | 月底Excel算佣金，算到眼花，PR还说你算错 |
| Logo pop | 换InnocenZ啦！ |
| App: booking | Outlet一下单，booking自动派给你的PR |
| App: attendance | 到场GPS打卡，谁在谁不在，一看就知道 |
| App: wallet | 佣金自动算，钱直接进wallet，月底一键出粮 |
| Presenter | 数目清清楚楚，不用再吵 |
| End card | InnocenZ · WhatsApp [number] · innocenz.net |

⚠️ **Three app lines overclaim** — checked against code and memory on 21 Oct 2026; fix them before filming:
- 「booking自动派给你的PR」 — nothing auto-dispatches. Auto-assign is a suggestion the agency previews and confirms
  ([[ai-suggestion-auto-assign]]).
- 「钱直接进wallet」 — a PR has no wallet balance. "Wallet" is only the PR app's Payment-tab icon (`BottomNav.tsx`);
  `payment_method` wallet rows are subscription billing. PRs are paid by a voucher the agency signs and pays.
- 「月底一键出粮」 — the payroll week is Sun–Sat and the PV is generated weekly ([[pv-signing-lane-and-sun-sat-week]],
  [[pv-auto-generated-weekly]]), not at month-end.
- Fine as written: GPS check-in ([[geofence-live-verified]]); innocenz.net is the live domain (`site-origins.ts`);
  「月底Excel算佣金」 describes the agency's OLD way, so month-end is right there.

**Open, unanswered:** a teammate on camera, or an AI host? Nothing has been generated yet.

**Why:** the next session will be asked to generate these shots or finish the script, and an overclaim on screen is
seen first by the agencies the video is aimed at.
**How to apply:** start from the open question; correct the three lines before any generation; keep this format's
rules separate from the V2 shorts.
