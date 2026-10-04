---
name: otp-channel-split
description: OTP channels. The 27 Jul 2026 plan (agency/outlet by email, PR by WhatsApp, SMS dropped) is superseded — since 17/21 Sep 2026 ONE code goes by WhatsApp + SMS + email at once (forgot password, password change, PR sign-up); a contact change is the CURRENT PASSWORD plus a code to the NEW contact only, nothing to the old one; venue/agency sign-up proves an emailed code (30 Sep)
metadata:
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-09-21T00:00:00.000Z
---

**CURRENT RULE (owner, 17 Sep 2026):** *"send the otp via whatapps , email and the sms"* — for
**forgot password, change phone and change email**, one code goes out on **all three channels at
once** (WhatsApp + SMS to the phone on file, email to the email on file). SMS company: decided
later — research recommends ESMS, runner-up Bulk360 (SMS Codes artifact AeC7vrQhvrqCuNuTkqKck2).
No SMS provider is contracted yet (`features/sms/sms.ts`: no provider set → SMS is `logged`
outside production, `skipped` in production).

⚠️ **Sign-up changed too, on 21 Sep 2026** (re-checked against the code 4 Oct 2026). The 17 Sep
build left sign-up and login alone ("PRs still verify by WhatsApp"; login is STILL unchanged: `/auth/login` uses only the admin TOTP MFA, no WhatsApp/SMS/email code); since 21 Sep the public
`POST /auth/otp/send` goes through the same `deliverCode` fan-out, so a PR sign-up's ONE code goes
by WhatsApp + SMS **and** to the email typed on wizard step 1 (optional; left off silently when
that address already belongs to an account; bounded by `otpSendPerEmailLimiter`, 3/h per
recipient). `purpose=forgot_password` on that route ignores the body's email and mails the
account's own address. And since **30 Sep 2026** a public venue, agency or team-member sign-up must
carry a code EMAILED by `POST /auth/signup-email-code` (purpose `signup_email`, email only), spent
by `/auth/register` and `/auth/register-member` before any account lookup. So "SMS dropped" no
longer holds for any flow.

**CHANGE PHONE / CHANGE EMAIL — ONE code, to the NEW contact only (owner, 21 Sep 2026):** *"only
send to new contact … step 1 (identity) No — logged , this no need send whatapps otp, sms otp and
the email otp to the old email or phone"*. The change is proven by the **CURRENT PASSWORD** plus a
code to the **new** address (new email → email; new phone → WhatsApp + SMS). **Nothing reaches the
old contact — not a code, and not a notice**: the "your email/phone was changed" message to the old
contact was removed in the same decision (`SMS_PHONE_CHANGED_NOTICE_TEXT` deleted; the only
notice left in `account-code/notices.ts` is `passwordChanged`). This **replaces** the two-code
design of 17 Sep (a code to the CURRENT contacts, then one to the NEW). Forgot password is
unchanged and still goes out on all three channels.

⚠️ **Known and accepted:** with no identity code, a leaked password alone moves the sign-in
identity, and the previous contact gets no signal. The owner chose this knowingly. The
compensating controls are the login lockout honoured at `start`, the 10/h per-user password
limiter (`contactChangePasswordUserLimiter`), the session cutoff, and the re-issued token pair.

**Why:** the owner wants a code to arrive even when one channel fails. The 27 Jul "SMS dropped"
decision was about sign-up friction (MCMC sender-ID lead time), not reliability.

**How to apply:**
- Built 17 Sep 2026 in `apps/backend/src/features/account-code/` (delivery orchestrator,
  `deliverCode` in `delivery.ts`) and `features/sms/` (`SMS_PROVIDER` seam). Rows reuse
  `main.phone_verification`. The account-code purposes are `reset_password`,
  `contact_change_new` and (21 Sep) `password_change`; `signup_email` (30 Sep) is issued only by
  `/auth/signup-email-code`. All of these must stay OUT of the public `/auth/otp/send|verify`
  schemas, which accept `signup` and `forgot_password` only (`publicOtpPurposeValues`).
- ⚠️ **`contact_change_identity` is a RETIRED purpose (21 Sep 2026).** Nothing issues it any more;
  it stays in the enum only for rows already stored, and it stays on the refused list for the
  public OTP schemas. A freshly created `contact_change_identity` row means the old step 1 is still
  live somewhere. `change_phone` is likewise kept only for stored rows.
- The routes are `POST /auth/contact-change/start|resend|confirm` (three, not four).
  ⚠️ `/contact-change/verify-identity`, `/contact-change/resend-new` and the older one-step
  `POST /auth/phone/change` were **DELETED outright on 21 Sep 2026** — owner: *"no error page no
  show this"* — so an old client calling one gets the router's own **404**, not a sentence
  (`auth.routes.ts:311-316`, `web/src/lib/auth/auth-server-copy.ts:63-70`). Neither the
  *'Changing your email or phone now needs your current password — please update the app'* 400
  nor the older *'…needs a code to your current contacts…'* wording is sent by any route in
  `apps/backend/src`. The comment at `schema/auth.schema.ts:48` still says `/auth/phone/change`
  "answers 400" — stale; the route list has no such path. The one-step
  `POST /auth/password/change` went the same way (now `/password/change/start|resend|confirm`).
- `OTP_DELIVERY_LOG_ONLY` logs instead of sending, honoured only outside production — use it for
  any manual test on the shared test database so no real person is messaged. Since 21 Sep 2026
  it is **per channel**: `true` holds all three, `sms` holds only SMS, `sms,email` a comma list;
  unset/`false` holds none; an unrecognised word is ignored (`delivery.ts` `logOnlyChannels`).
  The public `/auth/otp/send` honours it too since 21 Sep (it used to always really send).
- A wrong code is always HTTP 400, never 401 (the web signs users out on any 401). ⚠️ Since 21 Sep
  2026 the same rule covers a **wrong current password**: *'Current password is incorrect'* is a
  **400**, never a 401 (`account-code/shared.ts` `WRONG_PASSWORD`).
- Malaysian SMS must start "RM0.00", carry the brand in the text, and contain no links or phone
  numbers (telcos block them since 1 Sep 2024). The one SMS body lives in `features/sms/sms-text.ts`
  (plain ASCII — one non-GSM character halves the length limit); the chosen provider's own rules
  are still to be confirmed.

**Superseded history — the 27 Jul 2026 plan.** It was marked *"PLAN ONLY — AWAITING SENIOR
REVIEW. Do not build against this yet."* It has since been built and then overtaken; kept for its
reasoning, each claim marked with what the code says now.

- **The rule:** Agency and Outlet accounts verify by EMAIL OTP; PR accounts verify by WHATSAPP
  OTP. Original rule 27 Jul 2026, **revised the same day — SMS dropped entirely, not kept as a
  fallback**, on the basis that every Malaysian PR has WhatsApp. *Now:* SMS is back for every
  flow (above); agency/outlet email proof arrived 30 Sep as `/auth/signup-email-code`.
- **Why WhatsApp over SMS:** it sidesteps the MCMC blocker. Malaysia blocks unregistered
  alphanumeric sender IDs, so SMS could not send as "InnocenZ" until a registration cleared — days
  to weeks, and the single longest lead-time item in the OTP work. WhatsApp has no equivalent gate
  and shows the business name from day one. It is also cheaper per message than Malaysian A2P
  SMS, though Meta reprices authentication rates periodically — **verify current Malaysia rates
  before budgeting, do not trust a remembered figure**. (Still the reason no SMS provider is
  contracted yet.)
- **The accepted risk:** a PR whose number is not on WhatsApp cannot sign up at all — stopped at
  the first screen, before there is any way to contact them; with SMS dropped there was no
  fallback path. The wizard mitigates this only by warning at entry (planned wording "Must be on
  WhatsApp — that is where your code is sent"; the shipped hint is *"Must be registered on
  WhatsApp"*, `mobile/src/i18n/signup-copy.ts:304`). If sign-up abandonment shows up at step 1,
  this is the first thing to suspect. *Now partly mitigated:* the same code also goes to the
  email typed on step 1 (when that address is free), and SMS will carry it once a provider is
  registered.
- **How to apply (plan):** one `phone_verification`-style table with a `channel` column (the 27 Jul plan: `whatsapp` | `email`) rather
  than two tables — the send/verify/expire/attempt-count logic is identical and only the transport
  differs. Choose the channel per-send at the service boundary, never at the call sites, so adding
  SMS back later stays a one-file change. *Held:* one table, `main.phone_verification`; `channel`
  is `varchar(20)` and now stores the comma list of planned channels (`'whatsapp,sms,email'`,
  `channelColumn` in `delivery.ts`); the choice is made in `deliverCode`. The plan's "Twilio
  Verify covers both channels through one integration" was **not** used: WhatsApp goes straight
  to the Meta WhatsApp Cloud API (`features/whatsapp/whatsapp-client.ts`, `META_WHATSAPP_*`),
  email through Brevo (`features/brevo` + `features/mailing`), SMS through the `SMS_PROVIDER`
  seam. The mobile client still sends `channel: 'whatsapp'` explicitly (`sendPrOtp` in
  `apps/mobile/src/lib/api.ts`); the server schema accepts only `'whatsapp'` there and fans out
  regardless.
- **Setup still required:** Meta Business verification (business documents, not instant) plus a
  pre-approved authentication message template. Different friction from MCMC, not zero friction.
  (The client reads the approved template name from `META_WHATSAPP_OTP_TEMPLATE`, with
  per-purpose overrides such as `META_WHATSAPP_OTP_TEMPLATE_CONTACT_CHANGE`.)
- **Blocking dependency (27 Jul):** the email half had no transport at all — no mailer anywhere
  in the backend, the same root cause as the broken password reset; one mail integration would
  cover agency/outlet OTP, password reset, and team invites together. See [[app-foundation-gaps]].
  *Now resolved:* the Brevo mailer exists and `features/mailing/mailing.repository.ts` sends
  exactly those — `sendAccountCodeEmail`, `sendPasswordResetEmail`, `sendOrgMemberInviteMail` —
  and forgot password works by code (`POST /auth/password/forgot/start|complete`).
- **Security constraint that rode along:** `POST /auth/register` was unauthenticated AND took a
  client-supplied `roleId` (then `auth.routes.ts:12` + `auth.schema.ts:29`) — anyone reaching the
  API could mint an admin; whichever OTP path calls register must derive the role server-side (the plan said "from the verified row").
  *FIXED 29 Jul 2026 (`da4657bd`):* the server picks the role from `accountType`
  (`features/auth/signup-roles.ts` — agency/outlet → Owner, pr → PR, never admin); `roleId` is
  honoured only for an authenticated admin (`schema/auth.schema.ts:189-194`). The mobile client
  deliberately sends no `roleId` (`registerPr`, `apps/mobile/src/lib/api.ts:419`).

Related: [[app-foundation-gaps]], [[innocenz-account-and-phone-rules]].
