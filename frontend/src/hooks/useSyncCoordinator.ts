import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';

export const useSyncCoordinator = () => {
  useEffect(() => {
    // 1. Startup trigger
    useGlobalSyncStore.getState().syncNow("app-startup");

    // 2. NetInfo trigger
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        useGlobalSyncStore.getState().syncNow("reconnect");
      }
    });

    // 3. AppState trigger
    const subscription = AppState.addEventListener("change", (nextAppState) => {
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
