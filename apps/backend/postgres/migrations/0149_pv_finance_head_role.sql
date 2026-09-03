-- WHO SIGNED IT, IN WHAT CAPACITY.
--
-- `finance_head_name` is a snapshot of the signer taken at signing time, and the
-- UI printed a hardcoded "Finance Head" beside it. On 3 Sep 2026 an agency
-- OWNER signed and the voucher announced him as the finance head — a false
-- statement on a document two parties sign against each other.
--
-- Snapshot, deliberately, like the name beside it: a signature attests to who
-- someone WAS when they signed. Resolving the role live through `user_role`
-- would silently rewrite history the day that person changes role or leaves.
-- This is the one case the "FK instead of a copy" rule yields to, and it yields
-- for the same reason `finance_head_name` already does.
--
-- Nullable with no default: rows signed before this column existed genuinely do
-- not record a capacity, and a default would invent one for every one of them.
ALTER TABLE main.payment_voucher
  ADD COLUMN IF NOT EXISTS finance_head_role varchar(50);
