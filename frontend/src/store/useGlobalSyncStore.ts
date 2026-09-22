import { create } from 'zustand';
import NetInfo from "@react-native-community/netinfo";
import { getDBConnection, getLocalOrderDetails } from '@/database/db';
import { syncOfflineOrder } from '@/services/orderApi';
import { syncOfflineGoodsReceipt } from '@/services/goodsReceiptApi';
import { syncStockAdjustment } from '@/services/productApi';
import { classifySyncError } from '@/utils/errorParser';
import { useAuthStore } from '@/store/authStore';
import { useCacheInvalidationStore } from '@/store/useCacheInvalidationStore';

export interface SyncResult {
  status: 'success' | 'partialSuccess' | 'offline' | 'failed' | 'authenticationRequired';
  syncedOrderCount: number;
  syncedReceiptCount: number;
  pendingOrderCount: number;
  pendingReceiptCount: number;
  errors: string[];
}

interface SyncState {
  isSyncing: boolean;
  rerunRequested: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  syncStatus: string | null;
  migrationFailed: boolean;
  activeSyncPromise: Promise<SyncResult> | null;

  setMigrationFailed: (failed: boolean) => void;
  syncNow: (reason: string) => Promise<SyncResult>;
  refreshPendingCount: () => Promise<void>;
  requestSync: () => void;
  queryPendingBreakdown: () => Promise<{ orders: number; receipts: number; errors: string[] }>;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useGlobalSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  rerunRequested: false,
  lastSyncAt: null,
  pendingCount: 0,
  syncStatus: null,
  migrationFailed: false,
  activeSyncPromise: null,

  setMigrationFailed: (failed) => set({ migrationFailed: failed }),
  requestSync: () => {
    if (get().isSyncing) {
      set({ rerunRequested: true });
    } else {
      get().syncNow("mutation");
    }
  },

  refreshPendingCount: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      const db = await getDBConnection();
      const countRow = await db.getFirstAsync<{c: number}>(
        "SELECT (SELECT COUNT(*) FROM LocalOrders WHERE IsSynced = 0 AND OwnerUserId = ?) + (SELECT COUNT(*) FROM LocalGoodsReceipts WHERE IsSynced = 0 AND UserId = ?) as c",
        [user.id, user.id]
      );
      set({ pendingCount: countRow?.c || 0 });
    } catch (error) {
      console.error("[Sync] Lỗi lấy pending count:", error);
    }
  },

  queryPendingBreakdown: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return { orders: 0, receipts: 0, errors: [] };
    const db = await getDBConnection();
    const orders = await db.getAllAsync<{SyncError: string}>("SELECT SyncError FROM LocalOrders WHERE IsSynced = 0 AND OwnerUserId = ?", [user.id]);
    const receipts = await db.getAllAsync<{SyncError: string}>("SELECT SyncError FROM LocalGoodsReceipts WHERE IsSynced = 0 AND UserId = ?", [user.id]);

    const errors = [...orders.map(o => o.SyncError), ...receipts.map(r => r.SyncError)].filter(Boolean) as string[];
    const uniqueErrors = Array.from(new Set(errors));

    return {
       orders: orders.length,
       receipts: receipts.length,
       errors: uniqueErrors
    };
  },

  syncNow: (reason) => {
    const { activeSyncPromise } = get();
    if (activeSyncPromise) {
      set({ rerunRequested: true });
      return activeSyncPromise;
    }

    const promise = (async (): Promise<SyncResult> => {
      let finalResult: SyncResult = {
          status: 'failed',
          syncedOrderCount: 0,
          syncedReceiptCount: 0,
          pendingOrderCount: 0,
          pendingReceiptCount: 0,
          errors: []
      };

      try {
        set({ isSyncing: true, syncStatus: "Đang kiểm tra kết nối...", rerunRequested: false });

        console.log(`[Sync] start reason=${reason}`);

        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected || netInfo.isInternetReachable === false) {
          set({ syncStatus: "Không có mạng, hoãn đồng bộ." });
          finalResult.status = 'offline';
          return finalResult;
        }

        const user = useAuthStore.getState().user;
        if (!user) {
          set({ syncStatus: "Chưa đăng nhập." });
          finalResult.status = 'authenticationRequired';
          return finalResult;
        }

        const db = await getDBConnection();
        let orderSynced = 0;
        let receiptSynced = 0;
        const isAdmin = user.role === 'Admin' || user.role === 'Manager';

        // 1. SYNC GOODS RECEIPTS FIRST (Inflow before Outflow - BUG-SYNC-001)
        set({ syncStatus: "Đang đồng bộ phiếu nhập kho (Inflow)..." });
        const unsyncedReceipts = isAdmin
          ? await db.getAllAsync<any>("SELECT * FROM LocalGoodsReceipts WHERE IsSynced = 0")
          : await db.getAllAsync<any>("SELECT * FROM LocalGoodsReceipts WHERE IsSynced = 0 AND (UserId = ? OR UserId IS NULL OR UserId = 0)", [user.id]);
        console.log(`[Sync] start reason=${reason} receipts=${unsyncedReceipts.length}`);

        for (const receipt of unsyncedReceipts) {
          try {
            const retryCount = receipt.SyncRetryCount || 0;
            if (retryCount >= 5) continue;

            const details = await db.getAllAsync<any>("SELECT * FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ?", [receipt.OfflineReferenceId]);
            const syncData = {
              OfflineReferenceId: receipt.OfflineReferenceId,
              SupplierId: receipt.SupplierId,
              UserId: receipt.UserId || user.id,
              ReceiptDate: receipt.ReceiptDate || receipt.CreatedAt || new Date().toISOString(),
              Remarks: receipt.Remarks || "Phiếu nhập local",
              Details: details.map((d: any) => ({
                ProductId: parseInt(String(d.ProductId).replace(/\D/g, ''), 10) || 0,
                Quantity: d.Quantity,
                CostPrice: d.CostPrice,
              })),
            };

            console.log(`[Sync] receipt request started ref=${receipt.OfflineReferenceId}`);
            const res = await syncOfflineGoodsReceipt(syncData);

            if (res.isSuccess || (res.message && res.message.includes("ALREADY_PROCESSED")) || (res.data && res.data > 0)) {
               const serverId = res.data || null;
               console.log(`[Sync] receipt success serverId=${serverId}`);
               await db.runAsync(
                 "UPDATE LocalGoodsReceipts SET IsSynced = 1, SyncStatus = 'Synced', SyncError = NULL, ServerId = ? WHERE OfflineReferenceId = ?",
                 [serverId, receipt.OfflineReferenceId]
               );
               receiptSynced++;
            } else {
               throw new Error(res.message || "Unknown error");
            }
          } catch (e: any) {
             console.error(`[Sync] Lỗi phiếu nhập ${receipt.OfflineReferenceId}:`, e.message);
             if (e.response && e.response.status === 409 && e.response.data?.message?.includes("ALREADY_PROCESSED") && e.response.data?.data) {
                 const serverId = e.response.data.data;
                 console.log(`[Sync] receipt success serverId=${serverId}`);
                 await db.runAsync(
                   "UPDATE LocalGoodsReceipts SET IsSynced = 1, SyncStatus = 'Synced', SyncError = NULL, ServerId = ? WHERE OfflineReferenceId = ?",
                   [serverId, receipt.OfflineReferenceId]
                 );
                 receiptSynced++;
                 continue;
             }
             let safeError = e.message;
             let incrementRetry = false;
             let newStatus = 'RetryableError';

             if (e.response) {
                const status = e.response.status;
                if (status === 400 || status === 403 || status === 404) {
                    safeError = `Lỗi ${status}: ${e.response.data?.message || 'Không tự động thử lại.'}`;
                    newStatus = 'PermanentFailure';
                } else if (status === 401) {
                    safeError = "Lỗi 401: Hết phiên đăng nhập.";
                    newStatus = 'RetryableError';
                } else if (status === 429) {
                    safeError = "Lỗi 429: Too Many Requests.";
                    newStatus = 'RetryableError';
                    await sleep(3000);
                } else if (status >= 500) {
                    safeError = `Lỗi Server ${status}`;
                    incrementRetry = true;
                    newStatus = 'RetryableError';
                } else if (status === 409) {
                    safeError = "Lỗi 409: Conflict dữ liệu phiếu nhập.";
                    newStatus = 'NeedsReconciliation';
                }
             }
             const newRetry = incrementRetry ? (receipt.SyncRetryCount || 0) + 1 : (receipt.SyncRetryCount || 0);
             await db.runAsync(
               "UPDATE LocalGoodsReceipts SET SyncError = ?, SyncRetryCount = ?, SyncStatus = ? WHERE OfflineReferenceId = ?",
               [safeError, newRetry, newStatus, receipt.OfflineReferenceId]
             );
          }
        }

        // 2. SYNC STOCK ADJUSTMENTS SECOND (Inventory Correction/Inflow before Outflow - BUG-INV-004, Section 10)
        set({ syncStatus: "Đang đồng bộ điều chỉnh tồn kho..." });
        const unsyncedAdjustments = await db.getAllAsync<any>(
          "SELECT * FROM LocalStockAdjustments WHERE IsSynced = 0"
        );
        for (const adj of unsyncedAdjustments) {
          try {
            const adjPayload = {
              OfflineReferenceId: adj.OfflineReferenceId,
              ProductId: Number(adj.ProductId),
              Delta: adj.Delta,
              Reason: adj.Reason || "Điều chỉnh tồn kho kiểm kê",
              UserId: adj.UserId || user?.id || 0,
              CreatedAt: adj.CreatedAt
            };
            const res = await syncStockAdjustment(adjPayload);
            if (res.isSuccess) {
              await db.runAsync(
                "UPDATE LocalStockAdjustments SET IsSynced = 1, SyncStatus = 'Synced', SyncError = NULL WHERE OfflineReferenceId = ?",
                [adj.OfflineReferenceId]
              );
            }
          } catch (e: any) {
            console.error(`[Sync] Lỗi điều chỉnh tồn kho ${adj.OfflineReferenceId}:`, e.message);
            const status = e.response?.status || 500;
            const classified = classifySyncError(status, e.response?.data?.message || e.message);
            await db.runAsync(
              "UPDATE LocalStockAdjustments SET SyncError = ?, SyncStatus = ?, RetryCount = (RetryCount + 1) WHERE OfflineReferenceId = ?",
              [e.message, classified.status, adj.OfflineReferenceId]
            );
          }
        }

        // 3. SYNC ORDERS THIRD (Outflow after Inflow and Adjustments - BUG-SYNC-001)
        set({ syncStatus: "Đang đồng bộ hóa đơn (Outflow)..." });
        const unsyncedOrders = isAdmin
          ? await db.getAllAsync<any>("SELECT * FROM LocalOrders WHERE IsSynced = 0")
          : await db.getAllAsync<any>("SELECT * FROM LocalOrders WHERE IsSynced = 0 AND (OwnerUserId = ? OR OwnerUserId IS NULL OR OwnerUserId = 0)", [user.id]);
        console.log(`[Sync] start reason=${reason} orders=${unsyncedOrders.length}`);

        for (const order of unsyncedOrders) {
          try {
            const retryCount = order.SyncRetryCount || 0;
            if (retryCount >= 5) continue;

            const details = await getLocalOrderDetails(order.OfflineReferenceId);
            let targetCustomerId = order.CustomerId;
            if (!targetCustomerId || targetCustomerId <= 0) {
              const defaultCust = await db.getFirstAsync<{ Id: number }>(
                "SELECT Id FROM LocalCustomers WHERE Phone = '0000000000' OR Name = 'Khách lẻ' LIMIT 1"
              );
              targetCustomerId = defaultCust?.Id || 0;
            }

            const rawPaymentMethod = String(order.PaymentMethod || 'CASH').trim().toUpperCase();
            const normalizedPaymentMethod = rawPaymentMethod.includes('QR') ? 'QR' : 'CASH';

            const syncPayload = {
              UserId: order.OwnerUserId || user.id || 0, // BUG-SYNC-005: preserve original cashier/creator
              CustomerId: targetCustomerId, // BUG-POS-001 & BUG-SEED-001: preserve selected customer or resolved system customer
              TotalAmount: order.TotalAmount,
              PaymentMethod: normalizedPaymentMethod,
              OrderDate: order.CreatedAt,
              Status: 1,
              OfflineReferenceId: order.OfflineReferenceId,
              ShiftId: order.ShiftId ? Number(order.ShiftId) : null,
              Details: details.map(d => {
                let prodId = parseInt(String(d.ProductId).replace(/\D/g, ''), 10);
                if (isNaN(prodId)) prodId = 0;
                return { ProductId: prodId, Quantity: d.Quantity, UnitPrice: d.Price || d.UnitPrice || 0 };
              })
            };

            console.log(`[Sync] order request started ref=${order.OfflineReferenceId}`);
            const res = await syncOfflineOrder(syncPayload);

            if (res.isSuccess || (res.message && res.message.includes("ALREADY_PROCESSED")) || (res.data && res.data > 0)) {
               const serverId = res.data || null;
               console.log(`[Sync] order success serverId=${serverId}`);
               await db.runAsync(
                 "UPDATE LocalOrders SET IsSynced = 1, SyncStatus = 'Synced', SyncError = NULL, ServerId = ? WHERE OfflineReferenceId = ?",
                 [serverId, order.OfflineReferenceId]
               );
               orderSynced++;
            } else {
               throw new Error(res.message || "Unknown error");
            }
          } catch (e: any) {
             console.error(`[Sync] Lỗi đơn hàng ${order.OfflineReferenceId}:`, e.message);

             if (e.response && e.response.status === 409 && e.response.data?.message?.includes("ALREADY_PROCESSED") && e.response.data?.data) {
                 const serverId = e.response.data.data;
                 console.log(`[Sync] order success serverId=${serverId}`);
                 await db.runAsync(
                   "UPDATE LocalOrders SET IsSynced = 1, SyncStatus = 'Synced', SyncError = NULL, ServerId = ? WHERE OfflineReferenceId = ?",
                   [serverId, order.OfflineReferenceId]
                 );
                 orderSynced++;
                 continue;
             }

             let safeError = e.message;
             let incrementRetry = false;
             let newStatus = 'RetryableError';

             if (e.response) {
                const status = e.response.status;
                const errorMsg = e.response.data?.message || '';
                const isStockConflict = status === 400 && (
                  errorMsg.toLowerCase().includes("tồn kho") ||
                  errorMsg.toLowerCase().includes("stock") ||
                  errorMsg.toLowerCase().includes("insufficient")
                );

                if (isStockConflict) {
                    safeError = `Xung đột tồn kho máy chủ: ${errorMsg}. Cần đối soát.`;
                    newStatus = 'NeedsReconciliation';
                } else if (status === 400 || status === 403 || status === 404) {
                    safeError = `Lỗi ${status}: ${errorMsg || 'Không thể đồng bộ.'}`;
                    newStatus = 'PermanentFailure';
                } else if (status === 401) {
                    safeError = "Lỗi 401: Hết phiên đăng nhập.";
                    newStatus = 'RetryableError';
                } else if (status === 429) {
                    safeError = "Lỗi 429: Too Many Requests.";
                    newStatus = 'RetryableError';
                    await sleep(3000);
                } else if (status >= 500) {
                    safeError = `Lỗi Server ${status}`;
                    incrementRetry = true;
                    newStatus = 'RetryableError';
                } else if (status === 409) {
                    safeError = `Lỗi 409 Conflict: ${errorMsg || 'Xung đột dữ liệu'}`;
                    newStatus = 'NeedsReconciliation';
                }
             }

             const newRetry = incrementRetry ? (order.SyncRetryCount || 0) + 1 : (order.SyncRetryCount || 0);
             await db.runAsync(
               "UPDATE LocalOrders SET SyncError = ?, SyncRetryCount = ?, SyncStatus = ? WHERE OfflineReferenceId = ?",
               [safeError, newRetry, newStatus, order.OfflineReferenceId]
             );
          }
        }

        if (orderSynced > 0 || receiptSynced > 0 || unsyncedAdjustments.length > 0) {
           set({ lastSyncAt: new Date().toISOString() });
           // Fire all global invalidations as required by UX
           const invStore = useCacheInvalidationStore.getState();
           invStore.invalidatePos();
           invStore.invalidateInventory();
           invStore.invalidateProduct();
           invStore.invalidateDashboard();
           if (receiptSynced > 0) {
              invStore.invalidateGoodsReceipt();
           }
           if (orderSynced > 0) {
              invStore.invalidateOrder();
           }
        }

        await get().refreshPendingCount();
        const bd = await get().queryPendingBreakdown();

        set({ syncStatus: `Hoàn tất đồng bộ.` });

        finalResult = {
            status: bd.orders === 0 && bd.receipts === 0 ? 'success' : 'partialSuccess',
            syncedOrderCount: orderSynced,
            syncedReceiptCount: receiptSynced,
            pendingOrderCount: bd.orders,
            pendingReceiptCount: bd.receipts,
            errors: bd.errors
        };

        console.log(`[Sync] complete pendingOrders=${bd.orders} pendingReceipts=${bd.receipts}`);
        return finalResult;
      } catch (error) {
        console.error("[Sync] Lỗi không mong muốn:", error);
        set({ syncStatus: "Lỗi đồng bộ." });
        return finalResult;
      } finally {
        set({ isSyncing: false, activeSyncPromise: null });
        if (get().rerunRequested) {
          setTimeout(() => get().syncNow("rerun"), 100);
        }
      }
    })();

    set({ activeSyncPromise: promise });
    return promise;
  }
}));
