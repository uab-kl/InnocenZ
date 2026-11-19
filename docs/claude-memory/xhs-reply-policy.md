---
name: xhs-reply-policy
description: "STANDING (owner, 15 Oct 2026): whenever the owner brings a 小红书/RedNote comment, apply RedNote's rules and write a reply that cannot get the restricted InnocenZ account banned — the rules, the decision steps and the safe lines"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4d397639-ec88-47b6-904f-feb038ff76f4
  modified: 2026-10-20T04:23:19.999Z
---

Owner, 15 Oct 2026, verbatim: *"from now if i at xhs reply remember the policy and help me to reply the comment  dont get banned also"*.
Context: the InnocenZ RedNote account (shown as "InnocenZ UAB"; 小红书号 95991437173) got a 90-day 区域性可见调整 on
15 Oct 2026 (hidden in mainland China until 13 Jan 2027) — see [[v2-shorts-prompt-style-08oct]] for the cause and the
reworded notes. One of the triggers was a REPLY: to a 山西 commenter ("想要了解一下") the owner posted
「请问你是在吉隆坡吗？是 PR、经纪公司还是场所老板呢？方便的话私信告诉我们」 — following MY earlier templates, which also told
the owner to DM Frank's WhatsApp/email. Never again.

**Why:** a second strike on a restricted overseas account is likely to be harsher (comment/DM bans, account ban), and
RedNote's keyword filters run on comments and DMs as well as notes. Keyword filters ignore negation — 「不提供招聘」 still
trips 招聘 — so a banned word is banned even in a denial.

**How to apply — every time the owner shows a RedNote comment (often a screenshot):**
1. Read the IP line under the comment. A Chinese province (山西, 广东…) = MAINLAND; 马来西亚 / other country = OVERSEAS.
2. Classify it: interest · price · download/link · asks for contact · JOB SEEKER · overseas work · "is this nightlife?" ·
   Malaysian business owner · worker relating · scam accusation · AI question · praise · someone else's ad/contact · troll.
3. MAINLAND (incl. 中国香港/澳门/台湾) → **no reply by default** during the restriction; a neutral line only under praise,
   criticism, scam accusation, AI question, what-is-this, venue-in-video, where-are-you. No brand, no feature, no question
   back, no DM, **and no 马来西亚** (the line 「这是马来西亚本地商家用的管理软件…」 I gave on 15 Oct is WRONG for this — the
   reviewers rejected it). A plain "想了解" from a mainland IP gets no reply. Other countries (Singapore…) → only
   「谢谢关注～这个软件目前只在马来西亚使用，还在早期阶段」.
   **The full checked bank (70 lines, 30+ comment types, mainland vs Malaysia) is
   `C:\Users\jinkg\Downloads\InnocenZ-v2-shorts-part1\InnocenZ-RedNote-reply-bank-2026-10-15.md` — start from it.**
3b. A comment that itself carries 招/缺人/工资/待遇/薪/签证/包吃住/夜场/陪/微信/WhatsApp/加V/私 (or hiring/salary/gaji/kerja)
   → no reply at all; screenshot, 举报, delete (a reply only lifts it). Exception: a scam accusation — leave it, reply calmly.
   Under "已私/私你了" never reply (收到/好的/已回 confirm the DM in public).
3c. Never ask anyone who they are (你是老板吗 / 门店还是人力公司 / 你在哪) — that was the shape of the 15 Oct reply. To a
   Malaysian prospect, at most ONE question about their own process (表格还是手算, 合作几家), once per thread.
4. JOB SEEKER / overseas work / pay questions, from anywhere → do not engage; at most a neutral "this is software for
   businesses" line, never their words (招人, 工资, 签证…) repeated back.
5. OVERSEAS business owner → a short helpful software answer (only facts in the 📕 notes / column C), may ask a business
   question back — still no contacts, no DM invitation, no price, no download/app store/website/bio/"search us".
6. Someone else's contacts, ads or recruitment in the comments → delete or report it; don't reply.
7. Before giving the reply, run it past the word rules below (the session checker was `sd/xhsreply.cjs` + `sd/xhsrules.cjs`
   in the 15 Oct scratchpad — recreate from this list if the scratchpad is gone). Tell the owner to DELETE any posted reply
   that breaks them (RedNote replies cannot be edited).

**Banned in replies (and notes):** links/URLs/@/numbers ≥7 digits, 微信/WhatsApp/电话/邮箱/二维码/链接; 私信/私聊/联系/加我/
找我/主页/咨询/了解一下/DM; 最…/第一/100%/保证/免费; 兼职/陪/公主/小姐/夜场/夜店/赚钱/美女/女孩/妹/她/颜值/公关/KTV; PR/经纪;
薪/佣金/提成/工资/小费/收入/RM; 酒; 招聘/招人/求职/入职/上班/打工/工作机会/名额/包吃/包住/签证/出国/来马/劳务; 吉隆坡/大马/KL;
场所/半夜/午夜/通宵/整晚/每晚/当晚/阵容/挑人/担保/飞机/对数/MC/取消费; 马来西亚 at most once.
**+ 20 Oct 2026 (background review):** 周结/月结/现结/结薪/当天结 — the job-ad "paid weekly/monthly" terms. Filters match
SUBSTRINGS, so **每周结算 contains 周结**: write 每个礼拜的结算 / 一周的结算单 / 结算对账 instead (fixed in notes AG-01, AG-06
and 3 bank replies, sheet change-log row 46). English pay/job/night/download words are banned too on 小红书 (payroll, pay,
salary, wages, commission, job, hiring, recruit, nightlife, tonight, line-up, early access, sign up, download) — the
checker was Chinese-only and passed "Nightlife work · Weekly payroll" on the old background. "App" and "Payment" stay
allowed in note bodies only (UI names of the staff app and its tab); never on images or titles. Replies only: no price words,
no 下载/App Store/官网/网站/简介/搜索; 4–120 characters; staff = 员工, agencies = 人力公司, venues = 门店.

Reply-only extras (from the 15 Oct reply-bank reviews): no 机会/工作/派人/安排人手/代理/加盟/招商, no follow-bait (先关注/不会错过),
no 不在评论区… (implies another channel), no @ in a reply, ≤1 emoji, rotate openers/closers, no English/Malay replies, never
talk about the people in a video (only "视频为AI生成"), never answer as if the account were a staffing company or venue that
uses the product, no claimed results/customers/dates/prices/Chinese UI/iPhone support. Night words are banned in notes too
since 15 Oct: 今晚/几晚/晚上/每一晚/没得选/满场/场内 (sheet updated 06:42 UTC, change log row 40).

**Never:** a second account, seeding comments, a VPN/China IP, "包过申诉" services, mass-deleting critical comments,
arguing, or replying to dozens of comments within minutes with the same text. RedNote is for awareness until a
企业专业号 (with its own lead tools) exists — real leads convert on FB/IG/TikTok/website, where the owner's links are allowed.
