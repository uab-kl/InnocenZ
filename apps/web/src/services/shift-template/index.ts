import { getClient } from "@/lib/axios-v1";

/**
 * A reusable event card (backend `shift_template`, 0128) — the picker step
 * before the Post Job composer. `coverImage` is an R2 object key; resolve it
 * with `apiAssetUrl` before rendering.
 */
export interface ShiftTemplate {
	id: string;
	outletId: string;
	name: string;
	eventKind: "normal" | "special";
	specialEventType: string | null;
	customSpecialEventName: string | null;
	coverImage: string | null;
	slot: string | null;
	quantity: number | null;
	/** Comma-joined, same shape the shift row stores. */
	languages: string | null;
	dressCode: string | null;
	sortOrder: number;
}

export interface SaveShiftTemplateInput {
	name?: string;
	eventKind?: "normal" | "special";
	specialEventType?: string;
	customSpecialEventName?: string;
	slot?: string;
	quantity?: number;
	languages?: string;
	dressCode?: string;
	/** Raw or data-URL base64 — the server decodes, checks 5 MB, files in R2. */
	coverBase64?: string;
	coverFileName?: string;
	coverContentType?: string;
	/** Update only: true deletes the current cover picture. */
	removeCover?: boolean;
}

interface Envelope<T> {
	success: boolean;
	message: string;
	data: T;
}

export async function fetchShiftTemplates(
	onRefreshFail: () => void,
): Promise<ShiftTemplate[]> {
	const client = getClient(onRefreshFail);
	const response =
		await client.get<Envelope<ShiftTemplate[]>>("/shift-template");
	return response.data.data ?? [];
}

export async function createShiftTemplate(
	input: SaveShiftTemplateInput & { name: string },
	onRefreshFail: () => void,
): Promise<ShiftTemplate> {
	const client = getClient(onRefreshFail);
	const response = await client.post<Envelope<ShiftTemplate>>(
		"/shift-template",
		input,
	);
	return response.data.data;
}

export async function updateShiftTemplate(
	id: string,
	input: SaveShiftTemplateInput,
	onRefreshFail: () => void,
): Promise<ShiftTemplate> {
	const client = getClient(onRefreshFail);
	const response = await client.put<Envelope<ShiftTemplate>>(
		`/shift-template/${id}`,
		input,
	);
	return response.data.data;
}

export async function removeShiftTemplate(
	id: string,
	onRefreshFail: () => void,
): Promise<void> {
	const client = getClient(onRefreshFail);
	await client.delete<Envelope<null>>(`/shift-template/${id}`);
}
