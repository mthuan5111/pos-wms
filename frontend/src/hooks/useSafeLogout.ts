import { useAuthStore } from "@/store/authStore";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { useModalStore } from "@/store/useModalStore";
import NetInfo from "@react-native-community/netinfo";
import { clearLocalData } from "@/database/db";

export const useSafeLogout = () => {
  const { logoutAsync } = useAuthStore();

  const handleLogout = async () => {
    const syncStore = useGlobalSyncStore.getState();
    const modalStore = useModalStore.getState();

    const breakdown = await syncStore.queryPendingBreakdown();
    if (breakdown.orders === 0 && breakdown.receipts === 0) {
      await clearLocalData();
      await logoutAsync();
      return;
    }

    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      modalStore.setLoading(true);
      await syncStore.syncNow("logout");
      modalStore.setLoading(false);

      const afterSync = await syncStore.queryPendingBreakdown();
      if (afterSync.orders === 0 && afterSync.receipts === 0) {
        await clearLocalData();
        await logoutAsync();
        return;
      }
    }

    const finalBreakdown = await syncStore.queryPendingBreakdown();
    const errorMsg = finalBreakdown.errors.length > 0 ? `\nLỗi: ${finalBreakdown.errors.join(", ")}` : "";

    modalStore.showModal({
      title: "Chưa Đồng Bộ Hoàn Toàn",
      message: `Còn ${finalBreakdown.orders} Hóa đơn và ${finalBreakdown.receipts} Phiếu nhập kho chưa đồng bộ.${errorMsg}`,
      type: "error",
      confirmText: "GIỮ TRÊN THIẾT BỊ VÀ ĐĂNG XUẤT",
      cancelText: "THỬ LẠI",
      destructive: true,
      onConfirm: async () => {
        await logoutAsync();
      },
      onCancel: () => {
        handleLogout();
      }
    });
  };

  return { handleLogout };
};
