import type { User } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "./use-profile";

interface CurrentUserResult {
	user: User | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	isError: boolean;
	error: Error | null;
}

export function useCurrentUser(): CurrentUserResult {
	const { isAuthenticated } = useAuth();
	const { data: user, isLoading, isError, error } = useProfile();

	return {
		user: user ?? null,
		isLoading,
		isAuthenticated,
		isError,
		error: error as Error | null,
	};
}
