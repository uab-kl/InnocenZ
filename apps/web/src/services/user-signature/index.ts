import type { SignatureInk } from "@agency-portal/components/pr/PrSignaturePad";
import { getClient } from "@/lib/axios-v1";

/**
 * The signature the signed-in person keeps on file (migration 0111).
 *
 * Stored as the same vector ink a voucher signature uses, so what is saved here
 * can be handed straight to `POST /payment-voucher/:id/finance-sign` — the point
 * of the feature is that signing becomes a tap, not a redraw.
 *
 * Both routes are scoped to the JWT with no id in the path; there is no call
 * here that reads somebody else's signature, by design.
 */
export async function fetchMySignature(
	onRefreshFail: () => void,
): Promise<string | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: { signature: string | null } | null;
	}>("/user/me/signature");
	return response.data.data?.signature ?? null;
}

/** Save, or pass `null` to withdraw the one on file. */
export async function saveMySignature(
	signature: SignatureInk | null,
	onRefreshFail: () => void,
): Promise<string | null> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: { signature: string | null } | null;
	}>("/user/me/signature", { signature });
	return response.data.data?.signature ?? null;
}
