/**
 * MAY A SYNTHETIC-DATA SCRIPT RUN AGAINST THIS DATABASE?
 *
 * A seed that fills blanks with GENERATED values is only ever right on a test
 * database, and nothing used to say so except a comment. `seed-account-details`
 * ran from a session against the shared DB and stamped synthetic signatures on
 * real people (docs/claude-memory/seeds-never-write-a-signature.md). So a
 * script like it now refuses unless BOTH hold:
 *
 *  1. the person running it passed an explicit acknowledgement flag — it cannot
 *     start by accident, from shell history or a copied command line; and
 *  2. the target database's NAME carries a `test` token (`innocenz-test`,
 *     `innocenz_test`, `test-innocenz`) — so the flag alone, pasted against a
 *     production connection, still stops.
 *
 * The name is the one the pool connects with (`POSTGRES_DB`, db/index.ts). An
 * unset name is refused: pg would then fall back to a default nobody chose.
 *
 * Pure — reads nothing itself — so the rule is unit-tested; the script passes
 * in `process.argv` and `process.env.POSTGRES_DB`.
 */

export const TEST_DB_ACK_FLAG = '--i-know-this-is-a-test-db';

/** True when `name` has a token that is exactly `test` (split on anything not a letter or digit). */
export function looksLikeTestDatabase(name: string | null | undefined): boolean {
  return (name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes('test');
}

/** Why the script must not run, or null when it may. */
export function testDatabaseRefusal(input: {
  argv: readonly string[];
  databaseName: string | null | undefined;
}): string | null {
  if (!input.argv.includes(TEST_DB_ACK_FLAG)) {
    return `Refusing to run: this script writes SYNTHETIC data. Pass ${TEST_DB_ACK_FLAG} to confirm the target is a test database.`;
  }
  const name = input.databaseName?.trim();
  if (!name) {
    return 'Refusing to run: POSTGRES_DB is not set, so the target database is unknown.';
  }
  if (!looksLikeTestDatabase(name)) {
    return `Refusing to run: database "${name}" does not look like a test database (its name must contain a "test" token, e.g. innocenz-test).`;
  }
  return null;
}
