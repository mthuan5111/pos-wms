import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';
import { useAuthStore } from '@/store/authStore';
import { isDemoUser } from '@/utils/roleUtils';

export const useSyncCoordinator = () => {
  const startupTriggeredRef = useRef(false);

  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (isDemoUser(user) || user?.isDemo) {
      return;
    }

    // 1. Startup trigger: run at most once on app startup, and only if not already syncing
    if (!startupTriggeredRef.current) {
      startupTriggeredRef.current = true;
      if (!useGlobalSyncStore.getState().isSyncing) {
        useGlobalSyncStore.getState().syncNow("app-startup");
      }
    }

    // 2. NetInfo trigger
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const currentUser = useAuthStore.getState().user;
      if (isDemoUser(currentUser) || currentUser?.isDemo) return;
      if (state.isConnected && state.isInternetReachable !== false) {
        useGlobalSyncStore.getState().syncNow("reconnect");
      }
    });

    // 3. AppState trigger
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const currentUser = useAuthStore.getState().user;
      if (isDemoUser(currentUser) || currentUser?.isDemo) return;
      if (nextAppState === "active") {
        useGlobalSyncStore.getState().syncNow("foreground");
      }
    });

    return () => {
      unsubscribeNet();
      subscription.remove();
    };
  }, []);
};
