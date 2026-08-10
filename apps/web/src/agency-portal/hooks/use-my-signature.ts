import type { SignatureInk } from "@agency-portal/components/pr/PrSignaturePad";
import { parseSignatureInk } from "@agency-portal/lib/signature-ink";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kickToLogin } from "@/lib/auth/guards";
import { fetchMySignature, saveMySignature } from "@/services/user-signature";

export const mySignatureQueryKey = ["user", "me", "signature"] as const;

/**
 * The caller's signature on file — the source for tap-to-sign.
 *
 * `ink` is the PARSED strokes, not the raw column, so a caller can hand it
 * straight to a sign endpoint. It is null both when nothing is stored and when
 * what is stored will not parse; a signature that cannot be drawn must not
 * offer a one-tap button that then posts something the server refuses.
 */
export function useMySignature() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: mySignatureQueryKey,
		queryFn: () => fetchMySignature(kickToLogin),
		staleTime: 5 * 60 * 1000,
	});

	const mutation = useMutation({
		mutationFn: (next: SignatureInk | null) =>
			saveMySignature(next, kickToLogin),
		onSuccess: (stored) => {
			// Seed the cache from the server's copy rather than the submitted one —
			// what signs the next voucher should be what is actually on file.
			queryClient.setQueryData(mySignatureQueryKey, stored);
		},
	});

	const parsed = parseSignatureInk(query.data ?? null);

	return {
		/** Ready-to-send strokes, or null when there is nothing usable on file. */
		ink: parsed as SignatureInk | null,
		isLoading: query.isLoading,
		save: (next: SignatureInk) => mutation.mutateAsync(next),
		remove: () => mutation.mutateAsync(null),
		isSaving: mutation.isPending,
	};
}
