import { outletShiftSalesKey } from "@agency-portal/hooks/use-outlet-shared-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { type LogShiftSaleInput, logShiftSale } from "@/services/shift-sale";

/**
 * The venue logging one PR's floor sales — `POST /shift-sale`.
 *
 * On success every screen that reads `shift_sale` is refreshed: the Today tiles,
 * the PR-tonight live sales and History share `outletShiftSalesKey`, and the
 * Reports dashboard reads the aggregate under `["outlet","shift-sale-report"]`.
 * Without that the operator saves, reads the unchanged tile, and saves again.
 */
export function useLogShiftSale() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: LogShiftSaleInput) => logShiftSale(input, logout),
		// RETURNED, not fired and forgotten: the mutation stays pending until the
		// refreshed rows are in, so the button stays busy and the box never
		// flashes the old figure between the save and the refetch.
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: outletShiftSalesKey }),
				queryClient.invalidateQueries({
					queryKey: ["outlet", "shift-sale-report"],
				}),
			]),
	});
}
