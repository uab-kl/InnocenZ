import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	type ApiResponse,
	login as apiLogin,
	type LoginRequest,
	type LoginResponse,
} from "@/lib/auth/auth-api";
import { kickToLogin } from "@/lib/auth/guards";
import { resumeSession } from "@/lib/auth/token-refresh";

interface AuthContextType {
	isAuthenticated: boolean;
	setAuthenticated: (value: boolean) => void;
	login: (credentials: LoginRequest) => Promise<ApiResponse<LoginResponse>>;
	logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		let live = true;
		/*
		 * `resumeSession`, not the access token's clock. Past its 15 minutes this
		 * read `false` for somebody holding a good 7-day refresh token, and every
		 * hook gated on it — the notification bell, the agency's cut-loss queue
		 * — stopped asking the server for the life of the page.
		 *
		 * `current || alive`: this only ever brings a session back. A sign-in
		 * that lands while the refresh is still in flight must not be undone by
		 * its answer; sign-out goes through `logout`, not through here.
		 */
		void resumeSession().then((alive) => {
			if (live) setIsAuthenticated((current) => current || alive);
		});
		return () => {
			live = false;
		};
	}, []);

	const setAuthenticated = useCallback((value: boolean) => {
		setIsAuthenticated(value);
	}, []);

	const login = useCallback(async (credentials: LoginRequest) => {
		const loginResponse = await apiLogin(credentials);

		if (!loginResponse.success) {
			throw new Error(loginResponse.message || "Login failed");
		}

		setIsAuthenticated(true);
		return loginResponse;
	}, []);

	const logout = useCallback(() => {
		setIsAuthenticated(false);
		kickToLogin();
	}, []);

	return (
		<AuthContext.Provider
			value={{
				isAuthenticated,
				setAuthenticated,
				login,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
