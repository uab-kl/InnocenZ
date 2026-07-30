export function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A route id that is safe to hand to the database, or `null`.
 *
 * Every `id` column here is a uuid, so a non-uuid can never match a row — but
 * handing one to Postgres raises `22P02 invalid input syntax for type uuid`,
 * which escapes the repository and surfaces as a **500**. Found 31 Jul 2026:
 * `GET /payment-voucher/not-a-uuid` and `GET /shift/not-a-uuid` both 500ed
 * where `/user`, `/agency` and `/outlet` correctly 404ed.
 *
 * A malformed id is not a server fault — it is a row that does not exist — so
 * callers should answer **404**, the same as any other id that matches nothing.
 * The distinction matters to a client: 500 is indistinguishable from the
 * backend being down, so a stale bookmark reads as an outage.
 *
 * Note `paramId` above does NOT validate; it only unwraps a repeated query
 * param. Use this one wherever the value reaches a `where id = …`.
 */
export function uuidParam(value: string | string[]): string | null {
  const id = paramId(value);
  return typeof id === 'string' && UUID.test(id) ? id : null;
}
