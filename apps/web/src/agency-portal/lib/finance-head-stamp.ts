/** Finance Head dual-sign stamp for PVs — separate from agency owner */

export type FinanceHeadPvStamp = {
	financeHeadName: string;
	financeHeadSignedAt: string;
	financeHeadSignatureDataUrl?: string;
};

/** Legacy bug: owner name was stamped as Finance Head */
export const LEGACY_FINANCE_HEAD_SIGNER = "Dato' Lim Wei Khoon";

export const SEED_FINANCE_HEAD_NAME = "Sarah Tan";

export function buildDemoESignatureDataUrl(name: string): string {
	const safe = name
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="80" viewBox="0 0 280 80"><text x="10" y="55" font-family="Segoe Script, Brush Script MT, cursive" font-size="32" fill="#1a1a6e">${safe}</text></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function seedFinanceHeadStamp(signedAt: string): FinanceHeadPvStamp {
	return {
		financeHeadName: SEED_FINANCE_HEAD_NAME,
		financeHeadSignedAt: signedAt,
		financeHeadSignatureDataUrl: buildDemoESignatureDataUrl(
			SEED_FINANCE_HEAD_NAME,
		),
	};
}

export type AgencyFinanceHeadLike = {
	name: string;
	eSignatureStored: boolean;
	signatureDataUrl?: string;
};

export function financeHeadStampFromProfile(
	head: AgencyFinanceHeadLike,
	signedAt?: string,
): FinanceHeadPvStamp {
	const at =
		signedAt ??
		new Date().toLocaleString("en-MY", {
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	return {
		financeHeadName: head.name,
		financeHeadSignedAt: at,
		financeHeadSignatureDataUrl: head.eSignatureStored
			? (head.signatureDataUrl ?? buildDemoESignatureDataUrl(head.name))
			: undefined,
	};
}
