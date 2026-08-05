/**
 * Why a receipt write failed, in words the agency can act on — never silence.
 *
 * The server's own refusal is preferred and used verbatim: each one is a real
 * rule the reviewer needs to read ("RCP-000012 already carries order number
 * ORD0389 for 2026-08-04"), and paraphrasing it would lose the receipt number
 * that makes it actionable.
 *
 * THE FALLBACK IS THE POINT. Both hooks used to read `response.data.message`
 * and stop there, which is null for a request that never reached the server at
 * all — a dropped connection, CORS, an aborted navigation (`axios-v1.ts`
 * re-rejects those untouched, with `error.response` undefined). The editor then
 * rendered nothing: no red line, no green line, the figures unchanged. The only
 * reading of that is "it saved", and the correction the reviewer thinks they
 * made is not there.
 *
 * Deliberately does NOT invent detail it does not have. "Could not reach the
 * server" is what is actually known; naming a cause would be a guess printed as
 * a fact.
 */
export function writeFailureMessage(error: unknown): string | null {
	if (!error) return null;
	const fromServer = (
		error as { response?: { data?: { message?: string } } } | null
	)?.response?.data?.message;
	if (fromServer) return fromServer;
	// A response arrived but carried no message — still the server refusing, so
	// name the status rather than blaming the network.
	const status = (error as { response?: { status?: number } } | null)?.response
		?.status;
	if (status) return `The server refused this change (${status}).`;
	return "Could not reach the server — nothing was saved. Check your connection and try again.";
}
