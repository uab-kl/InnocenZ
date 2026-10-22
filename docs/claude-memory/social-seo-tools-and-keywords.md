---
name: social-seo-tools-and-keywords
description: "19 Oct 2026: SEO tools per platform (free first), Malaysia keyword traps, column E = the ONE caption source, and the per-short search categories read live from column E (SEO Keywords tab)"
metadata:
  node_type: memory
  type: project
  originSessionId: b336fafd-bb34-4ace-8bda-24cc7cc3b02d
  modified: 2026-10-19T12:32:28.113Z
---

Owner, 19 Oct 2026: "best tools SEO for facebook , instagram and xhs" · "comparision with reason why use this why best fit" · goal: searches for payroll / attendance / clock in / check in, and for our name, must surface InnocenZ shorts and the profile in the search bar and in Explore on Facebook, Instagram and Xiaohongshu · "no hide the words in exel".

**Verdict (checked on vendor pages, then by reviewers): free first, pay for nothing yet.** The accounts had 2–3 followers each and no posts after 14–15 Oct.
- **Facebook:** Meta Business Suite, Meta Ad Library (country MY), and Groups.
- **Instagram:** Metricool Free plus the app's own search. Connect Instagram through the Facebook Page, otherwise the competitor view is missing.
- **Xiaohongshu:** the in-app creator centre or creator.rednote.com (creator.xiaohongshu.com has blocked overseas logins since Jun 2026), plus in-app 下拉词.
- **Paid later:** Flick, Metricool Starter, 5118. 5118's phone sign-up is mainland-only, so test the free WeChat-QR route first.
- **Skip:** Inflact (escort tags near 吉隆坡), Keyword Tool, 千瓜/新榜 (mainland data), Keyword Planner, and 聚光 (Malaysia is open only to internet, travel, education and beauty).

**Malaysia keyword traps:**
- 'check in' means airlines.
- 'roster' means mobile-game esports.
- 'clock in' means clocks.
- 'payslip' / 'slip gaji' / 'penyata gaji' mean government payslips.
- 'kehadiran' alone means school attendance.
- 打卡 means tourist spots.
- #吉隆坡 and #klnightlife sit next to escort spam.
- 兼职 is scam-flagged.
- On XHS, 公关 / KTV / 招工 are high risk (17 Jul 2026 profile cleanup).

The head words belong to HR vendors, so target long-tail phrases and own the brand 'InnocenZ'. The Instagram name field should read 'InnocenZ | Clock-in & Payroll'.

**Platform rules:**
- Instagram: 5 hashtags maximum.
- Turn on the AI label on Instagram and Facebook, and tick 内容声明 → AI生成 on XHS.
- XHS bans batch posting.
- Facebook: post Reels from the Page only, not the personal profile.
- A 21+ age gate hides an account from search, so this was left as the owner's decision.

**Instrument lessons:**
- Workbook row heights are set from real-font measurement: Arial / YaHei via PIL, sized for the worst case of columns 15% narrower and 1.4 line height. 1,051 cells, 0 clipped.
- The browser pane cannot script `file://` pages.
- `customHeight="1"` contains `ht="1"`, which fooled a regex into reporting squashed rows.
- The Drive file is now **.xlsx**. Google re-saves it with shared strings and renumbered styles.

**Owner rules for these tabs (19 Oct 2026, standing — "remember have this"):**
- **Column E is the ONE place captions live**: 📌 = Instagram + Facebook, 📕 = Xiaohongshu. The SEO tabs never hold a second set of captions. The first build did, and its XHS lines broke the 15 Oct restriction rules; the owner chose "Fix them in column E".
- **Each short's search category stays in SEO Keywords** (owner: "each short what SEO what keywords ? cetegory for me , if the user search then will come out all the related shorts video").
  - §2 has 6 categories: Pay & payroll · Attendance & check-in · Scheduling & roster · Sales records · Staff cost · Team roles. Each lists the words people type and a 小红书 合集 name.
  - §3 lists each short with LIVE formulas (MID/FIND/SEARCH) reading its subject, 🔎 line and hashtags from column E, plus a ✅/❌ check that the 📌 block carries its category's words. All 24 were ✅ on 19 Oct.
  - The formulas were proved in real Excel via COM: 336/336 results matched the cached values, and a planted E change turned the row ❌.
  - Edit column E, never §3.
  - 20 Oct 2026: the owner had the before/after fix list (old §8) removed — "this is no important right can remove ?" → "yes remove it". History lives in the V2 Change log only; the alt text is now §8. Don't re-add a before/after list to the SEO tabs.
- **Owner's decisions, 19 Oct 2026 (after the column E vs SEO tabs audit):**
  - Fix every real mismatch in column E: no 'drinks' in captions (say 'sales commission' / 'sales' / 'item') — EXCEPT where an app rule only covers drinks or tips (PR-03's Dispute line, OU-02's receipt-photo rule): there 'drinks' stays, because truth beats the SEO word (owner via another session, 20 Oct, Change log row 45), no avoid-list words in opening lines, no 最 or other banned words in 📕, and 📕 titles of 18 characters or fewer.
  - **Keep the links in the 📌 captions.** The bio carries the tappable link.
  - **Captions are English only.** No 中文 or BM line in 📌; Chinese words live only in the profile bios.
  - Body text may keep app words such as 'Check In', 'roster' and 'cancellation fee'. The avoid rules target the search fields: the opening line, the 🔎 line, hashtags, and the XHS title and 话题.
- **How it was checked:**
  - Code: `audit_det.py` (planted faults all caught).
  - An 8-agent Workflow: rules → 3 auditors → 3 adversarial verifiers → critic. 151 raw items, 20 refuted; findings are leads, re-verified in code.
  - Excel COM recalc: 336/336 formulas equal the cached values.
  - Fix tools: `fix_e2.py` + `e_fixes2.json`. An entry may end in "xhs" to change one 📕 line; "pin" means the 📌 block only, never the internal purpose note above it.
- **Honest answer for the owner:** no app promises that a word search shows ALL our shorts (the app ranks them). A short WITHOUT the word can never come up for it. A search for 'InnocenZ' finds the profile, where all 24 sit together.
- **XHS tips follow [[xhs-reply-policy]]**: the account is restricted from 15 Oct 2026 to 13 Jan 2027. The bio still had 收入 and 私信「演示」, which the owner was told to remove.
- **Rows with a fixed 15.75 pt height hid text** (Change log 21–34, master list 26/27/36/37/42/43). They were released to auto-fit: no `ht` attribute, which is the form Sheets' own export uses for auto rows. A clip check must SKIP rows with no `ht`, not assume 15 pt; that mistake raised 78 false flags.

Related: [[v2-shorts-prompt-style-08oct]], [[never-round-trip-marketing-xlsx]], [[xhs-reply-policy]].

**20 Oct 2026 — the workbook is also edited by another session.** Change log rows 45–48: the drinks exception above; new profile text (Instagram name 'InnocenZ | Staff Scheduling', emoji bios, 小红书 昵称 'InnocenZ排班对账'); 周结 removed from AG-01/AG-06 📕; SEO Tools rewritten as a short 11-section page plus tool numbers. **Always download Drive and diff it before building on any local copy** — a local 'final' file can be older than Drive.
