-- 0122 — user.preferred_locale: the UI language a person picked, so the choice
-- survives sign-out and follows the ACCOUNT rather than the browser.
--
-- On `user` rather than in a new table: it is one small fact about the person,
-- and rule 1 says use the table that fits. Deliberately NOT on `user_profile` —
-- that table is blanked wholesale for outlet callers by `redactIdentityDocs`,
-- and a UI language is not an identity document; a venue reading a roster must
-- still resolve its own language.
--
-- Stored as a BCP-47 tag (`en`, `zh`) rather than a pg enum, so adding
-- Traditional Chinese later is a client change and not a migration. `zh` means
-- SIMPLIFIED here — the same vocabulary apps/mobile/src/i18n/locale-prefs.ts
-- already normalises `zh-Hans` / `zh-CN` / `zh-MY` onto.
--
-- NULL means "never chosen": the client then follows the browser/device
-- language instead of being forced to English.
--
-- Fully idempotent — the shared innocenz-test DB has a second writer, so every
-- statement here must be safe to re-run.

ALTER TABLE "main"."user"
  ADD COLUMN IF NOT EXISTS "preferred_locale" varchar(16);
