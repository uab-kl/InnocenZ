---
name: otp-channel-split
description: OTP channels. 17 Sep 2026 owner rule for forgot password / change phone / change email — ONE code by WhatsApp + SMS + email at once (supersedes the 27 Jul "SMS dropped" rule for those flows); sign-up stays WhatsApp (PR). 21 Sep 2026 — a contact change is proven by the CURRENT PASSWORD plus a code to the NEW contact ONLY; nothing (code or notice) ever goes to the old phone or email
metadata:
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-09-21T00:00:00.000Z
---

**CURRENT RULE (owner, 17 Sep 2026):** *"send the otp via whatapps , email and the sms"* — for
**forgot password, change phone and change email**, one code goes out on **all three channels at
once** (WhatsApp + SMS to the phone on file, email to the email on file). Sign-up / login
verification was NOT changed (PRs still verify by WhatsApp). SMS company: decided later —
research recommends ESMS, runner-up Bulk360 (SMS Codes artifact AeC7vrQhvrqCuNuTkqKck2).

**CHANGE PHONE / CHANGE EMAIL — ONE code, to the NEW contact only (owner, 21 Sep 2026):** *"only
send to new contact … step 1 (identity) No — logged , this no need send whatapps otp, sms otp and
the email otp to the old email or phone"*. The change is proven by the **CURRENT PASSWORD** plus a
code to the **new** address (new email → email; new phone → WhatsApp + SMS). **Nothing reaches the
old contact — not a code, and not a notice**: the "your email/phone was changed" message to the old
contact was removed in the same decision. This **replaces** the two-code design of 17 Sep (a code
to the CURRENT contacts, then one to the NEW). Forgot password is unchanged and still goes out on
all three channels.

⚠️ **Known and accepted:** with no identity code, a leaked password alone moves the sign-in
identity, and the previous contact gets no signal. The owner chose this knowingly. The
compensating controls are the login lockout honoured at `start`, the 10/h per-user password
limiter, the session cutoff, and the re-issued token pair.

**Why:** the owner wants a code to arrive even when one channel fails. The 27 Jul "SMS dropped"
decision was about sign-up friction (MCMC sender-ID lead time), not reliability.

**How to apply:**
- Built 17 Sep 2026 in `apps/backend/src/features/account-code/` (delivery orchestrator) and
  `features/sms/` (`SMS_PROVIDER` seam). Rows reuse `main.phone_verification` with purposes
  `reset_password` and `contact_change_new` — these must stay OUT of the public
  `/auth/otp/send|verify` schemas.
- ⚠️ **`contact_change_identity` is a RETIRED purpose (21 Sep 2026).** Nothing issues it any more;
  it stays in the enum only for rows already stored, and it stays on the refused list for the
  public OTP schemas. A freshly created `contact_change_identity` row means the old step 1 is still
  live somewhere.
- The routes are `POST /auth/contact-change/start|resend|confirm` (three, not four).
  `/contact-change/verify-identity` and `/contact-change/resend-new` are retired and answer 400
  *'Changing your email or phone now needs your current password — please update the app'* — the
  same sentence the retired `POST /auth/phone/change` answers, replacing its older *'…needs a code
  to your current contacts…'* wording.
- `OTP_DELIVERY_LOG_ONLY=true` logs every channel instead of sending, honoured only outside
  production — use it for any manual test on the shared test database so no real person is
  messaged.
- A wrong code is always HTTP 400, never 401 (the web signs users out on any 401). ⚠️ Since 21 Sep
  2026 the same rule covers a **wrong current password**: *'Current password is incorrect'* is a
  **400**, never a 401.
- Malaysian SMS must start "RM0.00", carry the brand in the text, and contain no links or phone
  numbers (telcos block them since 1 Sep 2024).

**Superseded history:** 27 Jul 2026 plan — agency/outlet verify by email OTP, PRs by WhatsApp OTP,
SMS dropped entirely (sender-ID registration lead time). Still true for sign-up only.

Related: [[app-foundation-gaps]], [[innocenz-account-and-phone-rules]].
