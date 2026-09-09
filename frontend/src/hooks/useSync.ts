import { useState, useCallback } from 'react';
import { getUnsyncedOrders, getLocalOrderDetails, markOrderAsSynced } from '@/database/db';
import { syncOfflineOrder } from '@/services/orderApi';
import { useAuthStore } from '@/store/authStore';
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';

export const useSync = () => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const { user } = useAuthStore();
  const { isSyncing, setSyncing, setLastSyncAt } = useGlobalSyncStore();

  const syncOrders = useCallback(async () => {
    if (!user) {
      setSyncStatus('Vui lòng đăng nhập để đồng bộ');
      return false;
    }
    
    if (isSyncing) {
        console.log("[Sync] Tiến trình đồng bộ đang chạy, bỏ qua yêu cầu mới");
        return false;
    }

    setSyncing(true);
    setSyncStatus('Đang lấy dữ liệu hóa đơn chưa đồng bộ...');

    try {
      const unsyncedOrders = await getUnsyncedOrders();
      
      if (unsyncedOrders.length === 0) {
        setSyncStatus('Không có dữ liệu mới cần đồng bộ');
        setSyncing(false);
        return true;
      }

      setSyncStatus(`Đang đồng bộ ${unsyncedOrders.length} hóa đơn...`);
      let successCount = 0;

      for (const order of unsyncedOrders) {
        try {
          const details = await getLocalOrderDetails(order.OfflineReferenceId);
          
          const syncPayload = {
            UserId: user.id || 0,
            CustomerId: 1, // Default customer
            TotalAmount: order.TotalAmount,
            OrderDate: order.CreatedAt,
            Status: 1, // 1 = Completed
            OfflineReferenceId: order.OfflineReferenceId,
            Details: details.map(d => {
                let prodId = parseInt(d.ProductId.replace(/\D/g, ''), 10);
                if (isNaN(prodId)) prodId = 0;

                return {
                    ProductId: prodId,
                    Quantity: d.Quantity,
                    UnitPrice: d.Price || d.UnitPrice || 0
                }
            })
          };

          await syncOfflineOrder(syncPayload);
          await markOrderAsSynced(order.OfflineReferenceId);
          successCount++;
        } catch (error) {
          console.error(`[Sync] Lỗi đồng bộ hóa đơn ${order.OfflineReferenceId}:`, error);
        }
      }

      setSyncStatus(`Đã đồng bộ thành công ${successCount}/${unsyncedOrders.length} hóa đơn.`);
      setLastSyncAt(new Date().toISOString());
      setSyncing(false);
      return successCount > 0;
    } catch (error) {
      console.error('[Sync] Lỗi quá trình đồng bộ:', error);
      setSyncStatus('Có lỗi xảy ra trong quá trình đồng bộ');
      setSyncing(false);
      return false;
    }
  }, [user, isSyncing, setSyncing, setLastSyncAt]);

  return { isSyncing, syncStatus, syncOrders };
};
