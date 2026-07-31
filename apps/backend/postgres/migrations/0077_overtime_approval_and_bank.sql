-- Two gaps that both mean the same thing: the money is right and still cannot
-- be paid.
--
-- ONE migration for both, deliberately. The database is shared with the other
-- developer, so two windows is twice the risk for no benefit. Everything here is
-- ADDITIVE and NULLABLE — no drops, no backfill, no NOT NULL — so nothing in
-- jk's lane can break on it and it is safe to apply mid-request.
--
--
-- 1. OVERTIME CAN NEVER BECOME MONEY
--
-- Check-out clamps the stamp to the shift's scheduled end, fires
-- `overtime_pending_approval` to the agency, and the PR app says "pending agency
-- approval". Grep finds ONLY the notification: no endpoint, no screen, and no
-- column to record a decision. Every overtime hour raised since that shipped
-- sits in a state nothing can move it out of.
--
-- ⚠️ The clamp also DESTROYS the evidence. `check_out_at` is overwritten with the
-- scheduled end, so how long the PR actually stayed survives nowhere except the
-- notification payload. That is why `overtime_minutes` is recorded AT CHECK-OUT
-- rather than derived later: by the time an agency looks, the stamps can no
-- longer answer the question. The clamp itself stays — wages are sealed to the
-- shift window on purpose, and overtime is a separate decision, not a longer day.
--
-- `overtime_amount` stores what was APPROVED rather than leaving it to be
-- recomputed at read time. A rate that changes later must not silently restate a
-- decision somebody already made — the same reasoning as
-- payment_voucher_day_review.approved_total_cents.
--
-- `overtime_status` is a plain varchar, not an enum: NULL means "no overtime on
-- this shift", which is the overwhelming majority of rows, and an enum would
-- invite a default that turns every ordinary shift into a pending decision.
ALTER TABLE main.shift_assignment
  ADD COLUMN IF NOT EXISTS overtime_minutes integer,
  ADD COLUMN IF NOT EXISTS overtime_status varchar(20),
  ADD COLUMN IF NOT EXISTS overtime_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS overtime_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS overtime_decided_by varchar;

COMMENT ON COLUMN main.shift_assignment.overtime_minutes IS
  'Minutes worked past the scheduled end, recorded AT CHECK-OUT because the clamp overwrites check_out_at. NULL = no overtime.';
COMMENT ON COLUMN main.shift_assignment.overtime_status IS
  'NULL = none. Otherwise pending | approved | rejected. Overtime is never auto-paid.';
COMMENT ON COLUMN main.shift_assignment.overtime_amount IS
  'Ringgit APPROVED, frozen at the decision. Never recompute from the current rate - that would restate a decision already made.';

--
-- 2. NOBODY CAN ACTUALLY BE PAID FROM A VOUCHER
--
-- The exported voucher prints an em dash for "Address:", "Bank Name:" and
-- "Bank Account No." because no column holds them. The document is complete
-- except for the three fields a bank needs. (Its "Bank Account Name" already
-- resolves through the FK to pr.name and needs nothing here.)
--
-- Bank details go on user_profile, NOT on pr, for two reasons. A bank account is
-- a fact about the PERSON, and user_profile already holds that class of fact —
-- IC/passport number, date of birth, address. And it is already the table
-- `redactIdentityDocsForOutlet` blanks for outlet callers, so a venue cannot see
-- a worker's bank details for the cost of one line, whereas putting them on `pr`
-- would have opened them to every screen that reads the roster.
--
-- Consequence worth stating: a PR with no user account has no bank details. That
-- is correct rather than a gap — the pre-account PR row exists so an agency can
-- roster someone before they sign up, and you cannot pay a person who has not
-- told you where to send it.
ALTER TABLE main.user_profile
  ADD COLUMN IF NOT EXISTS bank_name varchar(255),
  ADD COLUMN IF NOT EXISTS bank_account_no varchar(50);

COMMENT ON COLUMN main.user_profile.bank_name IS
  'Payee bank, printed on the payment voucher. Sensitive: blanked for outlet callers alongside IC and address.';
COMMENT ON COLUMN main.user_profile.bank_account_no IS
  'Payee account number. Sensitive: blanked for outlet callers alongside IC and address.';

-- Agency address, in the same two-line shape `outlet` already uses rather than a
-- single free-text column, so the two read the same way.
ALTER TABLE main.agency
  ADD COLUMN IF NOT EXISTS address_line_1 varchar(255),
  ADD COLUMN IF NOT EXISTS address_line_2 varchar(255);
