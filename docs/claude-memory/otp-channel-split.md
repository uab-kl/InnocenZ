---
name: otp-channel-split
description: OTP channels. 17 Sep 2026 owner rule for forgot password / change phone / change email — ONE code by WhatsApp + SMS + email at once (supersedes the 27 Jul "SMS dropped" rule for those flows); sign-up stays WhatsApp (PR)
metadata:
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-09-17T04:44:08.334Z
---

**CURRENT RULE (owner, 17 Sep 2026):** *"send the otp via whatapps , email and the sms"* — for
**forgot password, change phone and change email**, one code goes out on **all three channels at
once** (WhatsApp + SMS to the phone on file, email to the email on file). Change phone / change
email need TWO codes: first to the CURRENT contacts, then to the NEW phone or email. Sign-up /
login verification was NOT changed (PRs still verify by WhatsApp). SMS company: decided later —
research recommends ESMS, runner-up Bulk360 (SMS Codes artifact AeC7vrQhvrqCuNuTkqKck2).

**Why:** the owner wants a code to arrive even when one channel fails. The 27 Jul "SMS dropped"
decision was about sign-up friction (MCMC sender-ID lead time), not reliability.

**How to apply:**
- Built 17 Sep 2026 in `apps/backend/src/features/account-code/` (delivery orchestrator) and
  `features/sms/` (`SMS_PROVIDER` seam). Rows reuse `main.phone_verification` with purposes
  `reset_password`, `contact_change_identity`, `contact_change_new` — these must stay OUT of the
  public `/auth/otp/send|verify` schemas.
- `OTP_DELIVERY_LOG_ONLY=true` logs every channel instead of sending, honoured only outside
  production — use it for any manual test on the shared test database so no real person is
  messaged.
- A wrong code is always HTTP 400, never 401 (the web signs users out on any 401).
- Malaysian SMS must start "RM0.00", carry the brand in the text, and contain no links or phone
  numbers (telcos block them since 1 Sep 2024).

**Superseded history:** 27 Jul 2026 plan — agency/outlet verify by email OTP, PRs by WhatsApp OTP,
SMS dropped entirely (sender-ID registration lead time). Still true for sign-up only.

Related: [[app-foundation-gaps]], [[innocenz-account-and-phone-rules]].
