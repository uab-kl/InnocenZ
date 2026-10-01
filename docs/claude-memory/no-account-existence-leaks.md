---
name: no-account-existence-leaks
description: "Owner decision (29 Sep 2026, built 30 Sep): public sign-in and sign-up never say whether an email, phone or ID number has an account — one sentence each, same bcrypt work, a refusal floor, the same lockout for unknown identifiers; only a proved phone or emailed-code email may be named"
metadata:
  type: feedback
---

**Owner, 29 Sep 2026, chose "General message, both"; the go-ahead to edit `auth.controller.ts` came
30 Sep ("for 1 continue with the general sign-up/sign-in messages").** Built 30 Sep 2026.

**Why:** a public route that answers "already registered" / "not registered yet" differently is an
oracle for every address and number on the platform (the 28 Sep audit and the 29 Sep security
review both flagged it). On a PR platform, "this phone has an account" is itself sensitive.

**The rule:** an answer may depend on an account existing only after the caller has PROVED they own
the thing asked about — the right password, or a code that reached the phone ALONE
(`receiptProvesPhoneAlone`). Everyone else gets the same status, body and (as far as a floor can
make it) timing. The sentences live in `apps/backend/src/features/auth/account-answers.ts`; web
(`routes/login.tsx`, `landing-i18n/member-signup-refusal.ts`, `components/auth/signup-form.tsx`) and
the PR app (`localizeLoginError`, `lib/api-error-copy.ts`) translate them by exact English.

**What each route does now:**
- `POST /auth/login` — unknown identifier, password-less stub and wrong password all 401 "Wrong email
  or password" / "Wrong phone number or password"; one bcrypt compare every time (a dummy hash when
  there is none); every pre-password refusal waits `LOGIN_REFUSAL_FLOOR_MS` (500 ms). Identifiers
  with no account lock after the same 5 failures for 15 min (`unknown-login-lockout.ts`, in memory,
  SHA-256 keys, 20k entries, 7-day idle TTL). Inactive / suspended-org are told ONLY after a correct
  password (they used to be checked first — that told everyone the account existed).
- `POST /auth/otp/send` (signup) — a number that has an account gets its code on the PHONE ALONE and
  the same 200 as a free number (was a 409). `registerUser` then claims the stub or answers
  `SIGNUP_PHONE_HAS_ACCOUNT` to whoever proved the phone.
- `POST /auth/register` — all lookups (phone, email, ID) run before answering; public collisions get
  one 409 `SIGNUP_NOT_COMPLETED` (a public outlet / agency whose emailed code proved the address is
  told `SIGNUP_EMAIL_HAS_ACCOUNT`); admins creating accounts still get field messages.
- `POST /auth/register/check` — looks nothing up; 200 for any well-formed body. Kept because older
  PR-app builds call it on step 1; current builds no longer do.
- `POST /auth/register-member` — needs the emailed code first; then a taken email (proved) →
  `SIGNUP_EMAIL_HAS_ACCOUNT`, a taken phone → `SIGNUP_NOT_COMPLETED`, both lookups always run, the
  unique-index race is the general sentence.

**The 30 Sep security review's fixes (built):** every lookup-free check (plan, account type,
organisation) runs BEFORE the lookups — a deliberately invalid request used to read 409-vs-400; the
legacy phone reset's `/auth/otp/verify` answers a number with no account through in-memory
stand-ins (a real row's arithmetic, 500 ms floor); the emailed `/auth/forgot-password` answers before
its token and mail; `phoneLoginCandidates`, the lockout keys and the OTP budgets fold `00…` onto
`+60…` (the delivery already did); a failed read at sign-in is a 500, never a strike.

**The owner's three decisions (30 Sep 2026, "for number 1 just leave it" / "lets go with your pick
for number 2 and 3"):**
1. **Sign-up code by email — KEPT.** A taken number's code goes to the phone alone, so a prober typing
   their OWN email reads the answer in their inbox. Accepted; phone-only would leave WhatsApp as the
   code's only road until an SMS provider is signed. Middle way on offer: email only when WhatsApp is down.
2. **Proof before an organisation / member account — BUILT (option b).** `POST /auth/signup-email-code`
   (`signup-email-code.ts`) mails a code to any address with one answer; `/auth/register` (public outlet /
   agency) and `/auth/register-member` spend it after the lookup-free checks and before any lookup; a
   proven taken email is named (`SIGNUP_EMAIL_HAS_ACCOUNT`). ⚠️ It proves the INBOX only: a phone or IC
   typed on the same form can still be tested (a free one creates the account) — one code per try. The
   PR phone receipt is spent `verified → consumed` BEFORE the lookups.
3. **Lockout — option (c), BUILT.** The visible message stays; wrong guesses expire after a day —
   `user.last_failed_login_at` (migration 0170, applied 30 Sep on the owner's "alright go ahead tehn" after
   a first refusal by the permission system) and `FAILED_LOGIN_MEMORY_MINUTES` shared with the no-account
   counter. The column was confirmed live BEFORE the model changed
   ([[model-column-without-migration-breaks-login]]).

**Race lessons from the 30 Sep review:** a one-time proof must be COUNTED before it is compared (a
conditional atomic increment), and SPENT before the work it buys — "check, then answer, then spend" lets
N requests sent together all get the answer.

**Known limits (say them, don't hide them):** the unknown-identifier lockout and the reset stand-ins
are per process and forget on restart; a floor is not a ceiling. Authenticated flows (contact change,
the agency's PR editor, the team invite's "That email has no InnocenZ account yet") still name what
they find — out of the owner's scope. Live tests are impossible without writing: every sign-in or
sign-up POST writes an audit row, a real account's failed-attempt count, or sends a real code.

**How to apply:** any new public auth or account-lookup answer must be identical for "exists" and
"doesn't exist" unless ownership is proved first. Related: [[otp-channel-split]],
[[shared-db-writes-need-the-user]], [[prove-guards-live-without-writing]].
