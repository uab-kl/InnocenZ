---
name: video-skills-installed
description: "Which third-party video skills the owner asked for, which were safety-reviewed and installed in ~/.claude/skills (22 Oct 2026), which were refused and why, and how to run them on this Windows PC"
metadata:
  node_type: memory
  type: reference
  originSessionId: a3eda563-9081-4ac4-bcae-3e8070576d18
  modified: 2026-10-22T15:47:43.855Z
---

**The ask (owner, 22 Oct 2026):**
- "download these skills for me and try it": Clipcat, hypit.
- "help me to install and use it": video-shotcraft, xilo-opus-video, lemo-opuscar, mg-styles-15, huashu-art-motion, dashi-animationstyle, wtt-code-animation-studio.

**How they were checked:** each repo was git-cloned with `--depth 1` (hooks off) into `scratchpad\skills-review\<name>\repo` and read before install. NO code was executed during the review.

**Installed** by copying the skill folder into `C:\Users\jinkg\.claude\skills\`. They were picked up live, in the same session.

- **xilo-opus-video** (Kianzzz, commit f2cd828): SAFE.
  - Flow: 3 preview plans → HTML render(t) → Playwright → ffmpeg.
  - Needs Python + numpy + playwright: run its `python3 …` lines as `uv run --with numpy --with playwright python …`.
- **dashi-animationstyle** (chuspeeism, aa620f3): SAFE, but written for macOS.
  - Set `CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe` (or pass `--chrome`).
  - No PingFang font and no `open`/`sips` on this PC.
  - Whisper is optional (`--no-whisper`).
- **huashu-art-motion** (alchaincyf, 8a0d7d7, v1.2.0): SAFE with notes.
  - Run through uv. The first render may need `uv run --with playwright playwright install chromium`.
  - Optional paid Volcengine voice; it asks first.
  - It EDITS ITS OWN SKILL FILES after each film ("回流").
  - `.git` was left out, so its update check is off.
- **hypit** (hypit-ai, 0d36de9, v0.3.1): the SKILL FOLDER ONLY (docs). CAUTION:
  - The real work needs the npm CLI `@hypit/hypit`, which was not reviewed. Pin `@0.3.1` if it is ever installed.
  - It also needs a PAID HypiHub account or other paid providers, and they receive the owner's media.
  - Login is OAuth, and secrets go into Windows Credential Locker.
  - Do NOT install the CLI or log in without the owner deciding.
  - It does NOT use Kimi. An early web article said it did; that was wrong.

**Already present:** video-shotcraft (plugin skill).

**Not installed:**
- **lemo-opuscar** (CAUTION):
  - setup.sh does `git reset --hard` to upstream main on every run, so it runs unreviewed code.
  - It is POSIX-only and needs WSL, which is not installed.
  - About 0.9 GB of downloads.
  - Only if the owner installs WSL, and then pinned to commit 3961ddb.
- **Not found anywhere:** Clipcat Skill, mg-styles-15 (closest: Agentchengfeng/chengfeng-video-styles) and wtt-code-animation-studio. Need the owner's links.

**This PC:**
- uv 0.12.23 (winget) + uv CPython 3.12/3.13. `python`/`python3` are Microsoft Store stubs, so always use `uv run`.
- Node 26.4.
- ffmpeg 9.0.2: use `-/filter_complex file`; `-filter_complex_script` is gone.
- Chrome + Edge; Playwright chromium-1243.
- No WSL. Intel Iris Xe GPU, so 3D styles are slow.

Related: [[hotpie-style-agency-promo]]
