import { create } from "zustand";
import { initLocalDatabase, pullMasterData, hasCachedMasterData } from "@/database/db";
import { useAuthStore } from "./authStore";
import { useGlobalSyncStore } from "./useGlobalSyncStore";
import { useCacheInvalidationStore } from "./useCacheInvalidationStore";
import { isDemoUser } from "@/utils/roleUtils";

export type BootstrapStatus =
    | "idle"
    | "initializingDatabase"
    | "loadingSession"
    | "pullingMasterData"
    | "reconciling"
    | "syncing"
    | "ready"
    | "readyWithCache"
    | "partial"
    | "authenticationRequired"
    | "failed";

interface BootstrapState {
    status: BootstrapStatus;
    failedModules: string[];
    activePromise: Promise<void> | null;
    startBootstrap: (isLogin?: boolean) => Promise<void>;
    retryBootstrap: () => Promise<void>;
    continueOffline: () => void;
    reset: () => void;
}

export const useBootstrapStore = create<BootstrapState>((set, get) => ({
    status: "idle",
    failedModules: [],
    activePromise: null,

    reset: () => {
        set({ status: "idle", failedModules: [], activePromise: null });
    },

    startBootstrap: async (isLogin = false) => {
        const { status, activePromise } = get();
        if (activePromise) {
            return activePromise;
        }

        const promise = (async () => {
            try {
                // 1. Check Auth with session hydration (BUG-AUTH-001)
                let auth = useAuthStore.getState();
                if (!auth.isAuthenticated || !auth.user) {
                    set({ status: "loadingSession" });
                    const hydrated = await auth.hydrateSessionAsync();
                    if (!hydrated) {
                        set({ status: "authenticationRequired" });
                        return;
                    }
                    auth = useAuthStore.getState();
                }

                // 2. Initialize DB
                set({ status: "initializingDatabase" });
                await initLocalDatabase();

                // 3. Pull Master Data
                set({ status: "pullingMasterData", failedModules: [] });
                let masterDataStatus: "success" | "partial" | "failed" = "success";
                let failedMods: string[] = [];

                try {
                    const userRole = auth.user?.role || "DemoUser";
                    const res = await pullMasterData(userRole);
                    if (res?.failedModules?.length > 0) {
                        failedMods = res.failedModules;
                        masterDataStatus = res.hasRequiredError ? "failed" : "partial";
                    }
                } catch (e) {
                    failedMods = ["Network/DB Error"];
                    masterDataStatus = "failed";
                }

                if (masterDataStatus === "failed") {
                    const hasCache = await hasCachedMasterData();
                    if (hasCache) {
                        console.warn("[Bootstrap] Không thể cập nhật từ máy chủ, nhưng đã tìm thấy dữ liệu đã lưu trong máy. Chuyển sang chế độ ngoại tuyến.");
                        set({ status: "partial", failedModules: failedMods });
                    } else {
                        set({ status: "failed", failedModules: failedMods });
                        return;
                    }
                }

                // 4. Sync pending (Skip for demo accounts)
                if (!isDemoUser(auth.user)) {
                    set({ status: "syncing" });
                    try {
                        const syncStore = useGlobalSyncStore.getState();
                        await syncStore.syncNow(isLogin ? "login" : "app-startup");
                    } catch (e) {
                        console.error("Bootstrap sync error:", e);
                    }
                }

                // 5. Invalidate entire app
                useCacheInvalidationStore.getState().invalidateAll();

                // 6. Ready
                if (masterDataStatus === "partial") {
                    set({ status: "partial", failedModules: failedMods });
                } else {
                    set({ status: "ready" });
                }

            } catch (error) {
                console.error("Bootstrap error:", error);
                set({ status: "failed", failedModules: ["Unknown Error"] });
            } finally {
                set({ activePromise: null });
            }
        })();

        set({ activePromise: promise });
        return promise;
    },

    retryBootstrap: async () => {
        await get().startBootstrap();
    },

    continueOffline: () => {
        set({ status: "readyWithCache" });
    }
}));
