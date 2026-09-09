---
name: ic-authority-is-field-scoped
description: "A rule load-bearing for one field is not automatically true of the next it touches — 'the IC wins' is right for dob (the digits ARE the date) and wrong for gender on demo ICs"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: edd97cc9-97b4-44c3-b8cb-5af1e08560ad
  modified: 2026-09-08T07:21:38.709Z
---

InnocenZ's owner rule "age follows the IC" is exact: an NRIC's first six digits **are** the
birth date, so `dobFromNric` is a decoding, not a heuristic, and an IC/`dob` disagreement is
real data corruption.

On 8 Sep 2026 I extended that authority one field sideways — deriving **gender** from the
NRIC's last digit (odd = male, even = female) and *correcting* the stored value to match.
The dry run caught it: it would have written **male** onto "Victoria Tan Mei Lin" and
"Nurul Aina **binti** Rahman" (*binti* = daughter of), because the seeded demo ICs were
hand-written without regard to the parity convention. The convention is real; those
particular numbers never honoured it.

**Why:** the authority came from the digits literally BEING the date. That justification does
not transfer to a digit that merely *encodes* something by convention, in data where the
convention was never enforced.

**The owner then settled it, and the arrow points the other way** (8 Sep 2026): *"gender is
girl so ic also follow"*. For gender the PERSON is authoritative and the NUMBER is re-issued —
`alignNricToGender` in `seed-account-details.ts` moves only the final digit, leaving the first
six untouched so the birth date, and therefore the age, cannot move. Refined the same day: PRs
are all female, while an outlet or agency account takes its gender FROM its name — so the name
must be settled before the gender is computed, and the IC digit and the printed card then
follow that.

**How to apply:** when a rule names one source authoritative, ask *for which field, and on what
grounds* before reusing it on the next. The two directions coexist without contradiction — dob
reads FROM the IC, gender writes TO it — precisely because the date IS the digits while the
gender is only a convention over them. Where two signals disagree and neither is decisive,
report both and let a human pick, as the dob conflict still does. Related:
[[innocenz-database-rules]], [[confirm-before-asserting]].
