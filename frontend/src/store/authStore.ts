import { create } from "zustand";
import { saveTokens, clearTokens, saveUserProfile, getUserProfile, getAccessToken, decodeJwtPayload } from "@/utils/token";

export interface User {
    id: number;
    username: string;
    name: string;
    role: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isHydrating: boolean;
    setAuthAsync: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
    setToken: (token: string | null) => void;
    logoutAsync: () => Promise<void>;
    safeLogout: () => Promise<void>;
    hydrateSessionAsync: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isHydrating: true,
    safeLogout: async () => {},
    setAuthAsync: async (user, accessToken, refreshToken) => {
        await saveTokens(accessToken, refreshToken);
        await saveUserProfile(user);
        set({ user, token: accessToken, isAuthenticated: true, isHydrating: false });
    },
    setToken: (token) => {
        set({ token, isAuthenticated: !!token });
    },
    logoutAsync: async () => {
        try {
            await clearTokens();
        } catch (error) {
            console.error('[Auth] Lỗi khi xóa token:', error);
        } finally {
            set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
        }
    },
    hydrateSessionAsync: async () => {
        set({ isHydrating: true });
        try {
            const token = await getAccessToken();
            if (!token) {
                set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
                return false;
            }

            let user = await getUserProfile();
            if (!user) {
                const decoded = decodeJwtPayload(token);
                if (decoded) {
                    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
                        await clearTokens();
                        set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
                        return false;
                    }
                    const role = decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || decoded.role || "Cashier";
                    const name = decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || decoded.name || decoded.sub || "User";
                    const id = Number(decoded.nameid || decoded.sub || 1);
                    user = { id, username: name, name, role };
                    await saveUserProfile(user);
                }
            }

            if (user && token) {
                set({ user, token, isAuthenticated: true, isHydrating: false });
                return true;
            } else {
                set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
                return false;
            }
        } catch (e) {
            console.error("[Auth] Lỗi khôi phục phiên:", e);
            set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
            return false;
        }
    }
}));
