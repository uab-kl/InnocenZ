-- Phase B decision: commission_config is dropped. Verified unused first — no web,
-- mobile or backend reader; commission % comes from the workspace tier rates and
-- pr-rate.ts, and is common rather than per-item, so the config screen was never
-- going to be built.
--
-- IF EXISTS so a re-run is a no-op. CASCADE deliberately REMOVED from what drizzle
-- generated: nothing should depend on this table, and if something does, this must
-- fail loudly rather than quietly destroy the dependent constraint. This is a
-- SHARED database — jk migrates it too.
DROP TABLE IF EXISTS "main"."commission_config";