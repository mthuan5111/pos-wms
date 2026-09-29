import { create } from "zustand";
import { saveTokens, clearTokens, saveUserProfile, getUserProfile, getAccessToken, decodeJwtPayload } from "@/utils/token";
import { isDemoUser } from "@/utils/roleUtils";
import { API_BASE_URL } from "@/config/apiConfig";
import { logger } from "@/utils/logger";
import { useShiftStore } from "@/store/useShiftStore";

export interface User {
    id: number;
    username: string;
    name: string;
    role: string;
    isDemo?: boolean;
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
        const isDemo = isDemoUser(user) || user.role === 'DemoUser' || user.role === 'Demo';
        const normalizedUser: User = {
            ...user,
            isDemo,
            role: isDemo ? 'DemoUser' : user.role,
        };
        await saveTokens(accessToken, refreshToken);
        await saveUserProfile(normalizedUser);
        set({ user: normalizedUser, token: accessToken, isAuthenticated: true, isHydrating: false });
        if (!isDemo && normalizedUser.role !== 'WarehouseStaff') {
            useShiftStore.getState().fetchCurrentShift().catch(() => {});
        }
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
            useShiftStore.getState().clearCurrentShift();
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
            const decoded = decodeJwtPayload(token);
            const isTokenExpired = decoded?.exp ? decoded.exp * 1000 < Date.now() : false;

            if (!user && decoded) {
                const role = decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || decoded.role || "Cashier";
                const name = decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || decoded.name || decoded.sub || "User";
                const id = Number(decoded.nameid || decoded.sub || 1);
                const isDemo = role === 'DemoUser' || role === 'Demo';
                user = { id, username: name, name, role: isDemo ? 'DemoUser' : role, isDemo };
                await saveUserProfile(user);
            }

            const isDemo = isDemoUser(user) || user?.isDemo || decoded?.role === 'DemoUser' || decoded?.['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] === 'DemoUser';

            if (isDemo) {
                if (isTokenExpired) {
                    logger.debug("Auth", "Phiên trải nghiệm hết hạn khi hydrate, đang gia hạn...");
                    try {
                        const response = await fetch(`${API_BASE_URL}/Auth/demo-login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        });
                        const resJson = await response.json();
                        const demoData = resJson?.data;
                        if (demoData?.accessToken) {
                            const newAccessToken = demoData.accessToken;
                            const demoUser: User = {
                                id: demoData.id || user?.id || 9999,
                                username: demoData.username || 'demo_viewer',
                                name: demoData.name || 'Người dùng Trải nghiệm',
                                role: 'DemoUser',
                                isDemo: true,
                            };
                            await saveTokens(newAccessToken, '');
                            await saveUserProfile(demoUser);
                            set({ user: demoUser, token: newAccessToken, isAuthenticated: true, isHydrating: false });
                            return true;
                        } else {
                            throw new Error("Không nhận được token từ /Auth/demo-login");
                        }
                    } catch (demoRenewError: any) {
                        logger.warn("Auth", "Không thể gia hạn phiên trải nghiệm:", demoRenewError?.message);
                        await clearTokens();
                        set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
                        return false;
                    }
                }

                // Demo session valid
                const demoUser: User = {
                    ...user!,
                    role: 'DemoUser',
                    isDemo: true,
                };
                set({ user: demoUser, token, isAuthenticated: true, isHydrating: false });
                return true;
            }

            // Regular user
            if (isTokenExpired) {
                console.warn("[Auth] Phiên người dùng thông thường đã hết hạn.");
                await clearTokens();
                set({ user: null, token: null, isAuthenticated: false, isHydrating: false });
                return false;
            }

            if (user && token) {
                set({ user, token, isAuthenticated: true, isHydrating: false });
                if (!isDemo && user.role !== 'WarehouseStaff') {
                    useShiftStore.getState().fetchCurrentShift().catch(() => {});
                }
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
