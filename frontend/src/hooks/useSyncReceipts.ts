import { useCallback } from "react";
import NetInfo from "@react-native-community/netinfo";
import { getDBConnection } from "../database/db";
import { syncOfflineGoodsReceipt, GoodsReceiptSyncRequestDto, GoodsReceiptDetailDto } from "../services/goodsReceiptApi";
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';

export const useSyncReceipts = () => {
  const { isSyncing, setSyncing, setLastSyncAt } = useGlobalSyncStore();

  const syncReceipts = useCallback(async () => {
    if (isSyncing) {
        console.log("[Sync] Tiến trình đồng bộ đang chạy, bỏ qua yêu cầu mới");
        return false;
    }

    setSyncing(true);
    try {
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log("[Sync] Không có mạng. Bỏ qua đồng bộ phiếu nhập.");
        setSyncing(false);
        return false;
      }

      const db = await getDBConnection();
      const unsyncedReceipts = await db.getAllAsync<any>(
        "SELECT * FROM LocalGoodsReceipts WHERE IsSynced = 0"
      );

      if (unsyncedReceipts.length === 0) {
        console.log("[Sync] Không có phiếu nhập nào cần đồng bộ.");
        setSyncing(false);
        return true;
      }

      let syncCount = 0;
      for (const receipt of unsyncedReceipts) {
        const details = await db.getAllAsync<any>(
          "SELECT * FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ?",
          [receipt.OfflineReferenceId]
        );

        const syncData: GoodsReceiptSyncRequestDto = {
          OfflineReferenceId: receipt.OfflineReferenceId,
          SupplierId: receipt.SupplierId,
          UserId: receipt.UserId,
          Remarks: receipt.Remarks,
          Details: details.map((d) => ({
            ProductId: parseInt(d.ProductId),
            Quantity: d.Quantity,
            CostPrice: d.CostPrice,
          })),
        };

        try {
          const res = await syncOfflineGoodsReceipt(syncData);
          if (res.isSuccess) {
            await db.runAsync(
              "UPDATE LocalGoodsReceipts SET IsSynced = 1 WHERE OfflineReferenceId = ?",
              [receipt.OfflineReferenceId]
            );
            syncCount++;
            console.log(`[Sync] Đã đồng bộ phiếu nhập ${receipt.OfflineReferenceId}`);
          }
        } catch (error) {
          console.error(`[Sync] Lỗi đồng bộ phiếu nhập ${receipt.OfflineReferenceId}:`, error);
        }
      }

      if (syncCount > 0) setLastSyncAt(new Date().toISOString());
      setSyncing(false);
      return syncCount > 0;
    } catch (error) {
      console.error("[Sync] Lỗi trong quá trình đồng bộ phiếu nhập:", error);
      setSyncing(false);
      return false;
    }
  }, [isSyncing, setSyncing, setLastSyncAt]);

  return { isSyncing, syncReceipts };
};
