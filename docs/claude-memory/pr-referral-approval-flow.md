---
name: pr-referral-approval-flow
description: "Product rule set 2026-07-27 — PR sign-ups show as Referred / Not referred on the agency approval page; Accept writes agency_pr, Decline notifies the PR to find another agency"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-07-27T03:15:25.711Z
---

> **STATUS 2026-07-27: PLAN ONLY — AWAITING SENIOR REVIEW. Do not start building any of this.** The user is taking it to their senior first. Everything below marked "DECIDED" or "TO BUILD" is *their* position going into that conversation, not sign-off to implement. Ask before writing code against it.

**The rule (user, 2026-07-27):** a PR who signs up must appear on the agency approval page **labelled as Referred** (an agency signed them up) **or Not referred** (they found the agency themselves and asked to join). On **Accept**, the PR is written into `agency_pr`. On **Decline**, the PR is notified and told to look for another agency.

**Why it matters:** the two labels are different conversations for the agency — a referred applicant is one their own staff recruited and should already be expected, while a not-referred applicant is a cold inbound they are choosing whether to take on. Without the label the queue is undifferentiated and agencies cannot triage.

**How to apply — three real constraints found while checking the schema:**

1. **There is no field to store "referred" today, and re-adding the obvious one would reverse a deliberate decision.** `user_profile.under_agency` and `user_profile.agency_id` were dropped on purpose in migration `0030_user_profile_full_name_and_drops.sql` (lines 8–9, 29–30), reasoning that "the agency link already lives on main.pr (pr.agency_id, NOT NULL)". So the flag needs a new home chosen deliberately — on whatever pending-application row is introduced, not bolted back onto `user_profile`.

2. **A pending applicant cannot be stored as a `pr` row.** `pr.agency_id` is `.notNull()` (pr.model.ts:25–27) and `agency_pr.pr_id` FKs to `pr.id`, so neither table can hold someone who has not been accepted yet — including the referred case, which is only a *claim* until the agency confirms it. The approval queue therefore needs its own pending-application state that exists **before** `pr`. Accept then creates `pr` + `agency_pr` together; `agency_pr.approve_status` already defaults to `'pending'` and can flip to approved. See [[pr-signup-mobile]] for the full registration table map.

3. **Decline cannot notify anyone yet.** There is no notification table, no `notify()`, no push, and no mailer anywhere in the backend — see [[app-foundation-gaps]]. The decline half of this rule is blocked until that transport exists; it is the same dependency as password reset and the agency/outlet email OTP in [[otp-channel-split]].

**TO BUILD (confirmed by the user 2026-07-27):** the **pending** state and the **decline** action are both accepted work items, not open questions. Pending = the pre-`pr` application row the approval queue reads. Decline = mark the application rejected and tell the PR to look for another agency (blocked on the notification transport above).

**AGREED 2026-07-27 — how to make "Referred" trustworthy.** The problem: as specified, "Referred" would be set from what the applicant types about themselves, so anyone could self-label as referred to look pre-vetted, and the free-text agency-name fallback cannot be matched reliably ("Atlas" vs "atlas agency" vs a name that does not exist). The label would be exactly as reliable as the applicant's word, which defeats the triage it exists for. Fix: the PR enters a referral code the agency issued. A valid code resolves to exactly one agency id, so Referred becomes provable rather than claimed, it works even when the agency list will not load, and an absent or bad code simply falls through to the not-referred path instead of erroring.

**REVISED 2026-07-27 — codes are SINGLE USE.** The user requires every code to be redeemable exactly once, so two people can never use the same one. This means it **cannot** be `agency.agency_code`: that column is the agency's permanent identifier (one per agency, unique across agencies, reused forever), not a consumable token. A new table is needed — agency_id FK · code (UNIQUE) · issued_by · used_by_user_id (NULL until redeemed) · used_at · expires_at · status(active|used|revoked) — and redemption must be an atomic conditional update (`... WHERE code = ? AND used_by_user_id IS NULL`) so two simultaneous sign-ups cannot both win. Knock-on work: a generate/revoke surface on the agency side (Manage PR → invite), expiry, and **codes must be longer and random** — 6 chars is brute-forceable once a single valid code is worth an agency link, and there is no rate limiting anywhere in the backend (see [[app-foundation-gaps]]). Suggested three labels rather than two: **Referred** (valid code) · **Applied** (picked the agency from the backend list — a cold application) · **no queue entry at all** when they named nobody. Per-recruiter attribution is explicitly **out of scope** (user, 2026-07-27) — one code per agency, no commission tracking.

**Also agreed 2026-07-27 — the sign-up page may only offer agencies that really exist.** `SignUpScreen` step 3 now renders a search box over the `GET /auth/agencies` result and stores only ids that came from it; the old free-text "type the agency name" fallback is **removed**, so a PR can never name an agency that is not on the platform. A fruitless search shows "No agency matches …" and, on the referred branch, the "tell your agency your nickname" hint. If the list fails to load there is a Try again button rather than a typing escape hatch.

**DECIDED 2026-07-27 — a valid referral code still requires agency approval; it never auto-enters the PR.** The code decides *which queue* they land in and labels them Referred; approval decides *whether they can work*. Rationale: single-use stops a code being reused, but not a code being forwarded — it guarantees one redemption, not the right person — and it says nothing about the document vetting (IC, age, photos, comcard) that `verification_status` exists for. The schema already pushes this way: `pr.agency_id` is NOT NULL, so no bookable `pr` row can exist before an agency accepts. Referred applicants get a one-tap accept, not a skipped review.

**Consequence to design for:** a signed-up PR with no accepted agency has no `pr` row at all, so `getByUserId` returns null and every `/mine` endpoint plus check-in answers `403 "No PR profile for this account"`. "Waiting for an agency" must be a first-class app state (profile-only screen with a banner), not an error.
