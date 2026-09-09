---
name: seeds-never-write-a-signature
description: A seed script may never write user_profile.signature_ink — it is an attestation the agency portal hands to a one-tap sign button on a real money document
metadata:
  type: feedback
---

A seed may fill a phone number, a name, an SSM number. It may **never** write
`user_profile.signature_ink`.

**Why:** on `/agency/pv` that column PRE-LOADS the one-tap sign button, so a script's
scribble sits one tap away from becoming an agency's attestation on a payment voucher.
It is the one field a seed has no business inventing. On 9 Sep 2026 an ad-hoc
`seed-account-details` script stamped synthetic `{"w":600,"h":200,…}` ink onto 18
accounts — including real people (`jy.ng@`, `owner@velvet23.my`, `finance@velvet23.my`)
and two outlet owners 4 minutes after they signed up. 74 of the 76 signatures in the
test DB are synthetic. It surfaced only because an owner asked why a brand-new outlet
account already had a signature on file.

**How to apply:** nothing in the codebase needs guarding — the ONLY committed writer is
the person's own `PUT /user/me/signature`; `POST /auth/register` fills name/ID/address
and never the signature; the column has no default and no trigger. The risk is entirely
ad-hoc scripts run against the shared DB from a session. Don't write one.

⚠️ When asking who wrote a column, `updated_by` answers who touched the ROW last, not who
wrote that FIELD. Grouping the signatures by `updated_by` blamed `regenerate-comcards`
for 48 of them; that script writes `comcardImage` and nothing else
(`regenerate-comcards.ts:133`). See [[absent-evidence-is-about-the-instrument]] — the
same failure shape, applied to attribution rather than to a zero result.

Related: [[innocenz-database-rules]], [[innocenz-pv-pipeline]].
