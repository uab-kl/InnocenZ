import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { User } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import type { LoginRequest, LoginUser } from "./auth-api";
import { profileQueryKey } from "./use-profile";

function loginUserToProfile(user: LoginUser): User {
	return {
		id: user.id,
		email: user.email,
		username: user.displayName,
		displayName: user.displayName,
		contactNo: "",
		isActive: user.status === "active",
		roles: [],
		portals: [],
		// The login response carries no memberships; /auth/me fills them in.
		organisations: [],
		declinedRequests: [],
		readPermission: ["*"],
		createPermission: [],
		updatePermission: [],
		modulePermissions: [],
	};
}

export function useAuthActions() {
	const { login: authLogin, logout: authLogout, isAuthenticated } = useAuth();
	const queryClient = useQueryClient();

	const login = useCallback(
		async (credentials: LoginRequest) => {
			const response = await authLogin(credentials);

			if (response.data?.user) {
				queryClient.setQueryData(
					profileQueryKey,
					loginUserToProfile(response.data.user),
				);
			} else {
				await queryClient.invalidateQueries({ queryKey: profileQueryKey });
			}

			return response;
		},
		[authLogin, queryClient],
	);

	const logout = useCallback(() => {
		queryClient.removeQueries({ queryKey: profileQueryKey });
		authLogout();
	}, [authLogout, queryClient]);

	return {
		login,
		logout,
		isAuthenticated,
	};
}
