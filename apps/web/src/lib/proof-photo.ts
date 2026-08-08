import { env } from "@/env";

/** R2 public base learned from `/auth/me` when VITE_R2_PUBLIC_URL is not baked into the bundle. */
let cachedR2PublicBase: string | undefined;

export function noteR2PublicUrl(url: string | null | undefined): void {
	const raw = url?.trim();
	if (raw) cachedR2PublicBase = raw.replace(/\/$/, "");
}

/** Public R2 base with the trailing slash stripped: env first, else what `/auth/me` reported. */
export function getR2PublicBase(): string | undefined {
	return env.VITE_R2_PUBLIC_URL?.replace(/\/$/, "") || cachedR2PublicBase;
}

/**
 * Resolve one proof-photo entry to a displayable URL.
 *
 * PV proof-photo arrays (payment_voucher receipt/line/dispute `proof_photos`,
 * shift_assignment `leave_proof_photos`) mix legacy base64 data URLs with R2
 * object keys like `user/{userId}/receipts/rcp-1786…-0.jpg`. Keys join with
 * the R2 public base — a response-carried `r2PublicUrl` wins over the
 * env//auth/me one — and anything unrecognised (or a key with no known base)
 * comes back unchanged as a last resort.
 *
 * Equality and dedupe must stay on the RAW strings; only the value handed to
 * an `<img src>` or `<a href>` goes through here.
 */
export function resolveProofPhotoUrl(
	photo: string,
	r2PublicUrl?: string | null,
): string {
	if (/^(data:|https?:\/\/)/.test(photo)) return photo;
	if (/^(user|agency|outlet)\//.test(photo)) {
		const base = r2PublicUrl?.trim().replace(/\/$/, "") || getR2PublicBase();
		if (base) return `${base}/${photo}`;
	}
	return photo;
}
