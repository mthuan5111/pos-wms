import { useAuthStore } from "@/store/authStore";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { useModalStore } from "@/store/useModalStore";
import { useShiftStore } from "@/store/useShiftStore";
import { useDemoSandboxStore } from "@/store/useDemoSandboxStore";
import NetInfo from "@react-native-community/netinfo";
import { clearLocalData } from "@/database/db";

export const useSafeLogout = () => {
  const { user, logoutAsync } = useAuthStore();

  const performActualLogout = async () => {
    useShiftStore.getState().clearCurrentShift();
    await clearLocalData();
    await logoutAsync();
  };

  const handleLogout = async (skipShiftCheckParam?: boolean | any) => {
    const skipShiftCheck = skipShiftCheckParam === true;
    const shiftStore = useShiftStore.getState();
    const demoStore = useDemoSandboxStore.getState();
    const modalStore = useModalStore.getState();

    const isDemo = user?.role === 'DemoUser' || user?.role === 'Demo' || user?.isDemo;
    const hasOpenShift = isDemo
      ? demoStore.activeShift && demoStore.activeShift.status === 'Open'
      : shiftStore.currentShift && shiftStore.currentShift.status === 'Open';

    if (!skipShiftCheck && hasOpenShift) {
      modalStore.showModal({
        title: "Ca Làm Việc Đang Mở",
        message: "Ca làm việc của bạn vẫn đang mở. Hãy kiểm tra và kết ca trước khi rời quầy để bảo đảm số liệu tiền mặt chính xác.",
        type: "info",
        cancelText: "QUAY LẠI KẾT CA",
        confirmText: "VẪN ĐĂNG XUẤT (GIỮ CA MỞ)",
        destructive: false,
        onConfirm: async () => {
          handleLogout(true);
        },
        onCancel: () => {
          // User opted to stay and end shift
        }
      });
      return;
    }

    const syncStore = useGlobalSyncStore.getState();
    const breakdown = await syncStore.queryPendingBreakdown();
    if (breakdown.orders === 0 && breakdown.receipts === 0) {
      await performActualLogout();
      return;
    }

    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      modalStore.setLoading(true);
      await syncStore.syncNow("logout");
      modalStore.setLoading(false);

      const afterSync = await syncStore.queryPendingBreakdown();
      if (afterSync.orders === 0 && afterSync.receipts === 0) {
        await performActualLogout();
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
        await performActualLogout();
      },
      onCancel: () => {
        handleLogout(true);
      }
    });
  };

  return { handleLogout };
};
