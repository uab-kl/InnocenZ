---
name: higgsfield-limits-and-connector
description: "What Higgsfield can and can't do for InnocenZ videos (fake app UI, no Chinese captions, Mandarin untested) and the state of its claude.ai connector 'higgsfields' — added, never signed in, paid plan, uncapped credits"
metadata:
  node_type: memory
  type: reference
  originSessionId: a3eda563-9081-4ac4-bcae-3e8070576d18
  modified: 2026-10-22T03:26:32.801Z
---

From the 21 Oct 2026 chat ([[hotpie-style-agency-promo]]), researched on Higgsfield's help pages:

- **Can make:** a presenter, background footage and hype effects. Background/effect clips: Seedance, Kling 3.0 or
  Veo 3.1 at 9:16, ~5 s each. Logo animation: Marketing Studio → Motion Design (from the logo or the website).
- **Can't:** show the real app — it invents a fake UI, so app screens must be screen recordings of the real app. It is
  not where Chinese captions or the edit happen; that is CapCut.
- **Same face in every shot:** train a Soul character (Soul → Train new character, 20+ photos), then make a 9:16
  still in the setting.
- **Lip-sync:** LipSync Studio with Kling Avatars 2.0 or Wan 2.5 Speak, from the still plus your own audio. Keep each
  clip under ~20 s and cut between them. If a model refuses the audio file, clone the voice in Higgsfield and
  generate from that.
- **Malaysian Mandarin:** record the voice-over yourself; AI voices won't get it right, and Higgsfield doesn't list
  Chinese explicitly — test one Mandarin line first.
- **Connector:** a Higgsfield connector named "higgsfields" is added to the owner's claude.ai account, but sign-in
  was never finished (it was also absent from this Claude Code session's tools on 21 Oct). To use it: Settings →
  Connectors → Connect, sign in (needs a paid Higgsfield plan), then enable it for the chat. Marketing Studio is not
  available through it; lip-sync availability isn't documented, so both may need the website.
- A 30 s Seedance 2.5 short costs about 210 credits ([[v2-shorts-prompt-style-08oct]]).

- **Prompt length limits (22 Oct 2026):**
  - Seedream 5.0 lite (image) refuses prompts over **3,000 characters**. The owner hit "Prompt is too long (max 3000 characters)", so face-photo prompts must stay under ~2,800.
  - Seedance 2.5 has taken ~14,000-character prompts (V2 and V3 evidence).
  - Kling 4.0's cap is not verified but is far shorter, so never send it a full Seedance prompt.
  - Seedream "Auto" ratio gives a square image; pick 9:16 by hand.

**How to apply:** ask before any generation through the connector — each one spends paid credits and there is no cap.
