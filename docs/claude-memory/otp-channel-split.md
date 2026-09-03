---
name: otp-channel-split
description: Product rule set 2026-07-27 — Agency + Outlet verify by EMAIL OTP; PRs verify by WHATSAPP OTP (SMS dropped entirely)
metadata: 
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-07-27T03:10:20.480Z
---

> **STATUS 2026-07-27: PLAN ONLY — AWAITING SENIOR REVIEW. Do not build against this yet.**

**Agency and Outlet accounts verify by EMAIL OTP. PR accounts verify by WHATSAPP OTP.** Original rule 2026-07-27; **revised the same day — SMS is dropped entirely, not kept as a fallback**, on the basis that every Malaysian PR has WhatsApp.

**Why WhatsApp over SMS:** it sidesteps the MCMC blocker. Malaysia blocks unregistered alphanumeric sender IDs, so SMS could not send as "InnocenZ" until a registration cleared — days to weeks, and the single longest lead-time item in the OTP work. WhatsApp has no equivalent gate and shows the business name from day one. It is also cheaper per message than Malaysian A2P SMS, though Meta reprices authentication rates periodically — **verify current Malaysia rates before budgeting, do not trust a remembered figure**.

**The accepted risk:** a PR whose number is not on WhatsApp cannot sign up at all — stopped at the first screen, before there is any way to contact them. With SMS dropped there is no fallback path. The wizard mitigates this only by warning at entry ("Must be on WhatsApp — that is where your code is sent"). If sign-up abandonment shows up at step 1, this is the first thing to suspect.

**How to apply:** one `phone_verification`-style table with a `channel` column (`whatsapp` | `email`) rather than two tables — the send/verify/expire/attempt-count logic is identical and only the transport differs. Choose the channel per-send at the service boundary, never at the call sites, so adding SMS back later stays a one-file change. Twilio Verify covers both channels through one integration. The mobile client already sends `channel: 'whatsapp'` explicitly (`sendPrOtp` in apps/mobile/src/lib/api.ts).

**Setup still required:** Meta Business verification (business documents, not instant) plus a pre-approved authentication message template. Different friction from MCMC, not zero friction.

**Blocking dependency:** the email half has no transport at all — there is no mailer anywhere in the backend, which is the same root cause as the broken password reset. See [[app-foundation-gaps]]. One mail integration covers agency/outlet OTP, password reset, and team invites together.

**Security constraint that rides along:** `POST /auth/register` is unauthenticated AND takes a client-supplied `roleId` (auth.routes.ts:12 + auth.schema.ts:29) — anyone reaching the API can mint an admin. Whichever OTP path calls register must derive the role server-side from the verified row; the mobile client deliberately sends no `roleId`.
