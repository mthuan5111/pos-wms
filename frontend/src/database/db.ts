import * as SQLite from "expo-sqlite";
import { downloadAndSaveImageAsync } from "@/utils/fileManager";
import { Platform } from "react-native";
import apiClient from "@/services/apiClient";

export interface LocalCategoryRow {
  Id: number;
  Name: string;
  Description?: string;
  Code?: string;
  IsSystem?: boolean;
}

export interface LocalProductRow {
  Id: string;
  CategoryId: number;
  SupplierId?: number | null;
  SupplierName?: string | null;
  Name: string;
  Price: number;
  Barcode: string;
  StockQuantity: number;
  ImageUrl?: string;
  LowStockThreshold?: number;
  IsSalePriceConfigured?: number;
}

export interface LocalSupplierRow {
  Id: number;
  Name: string;
  ContactPerson: string;
  Phone: string;
  Address: string;
}

export interface LocalCustomerRow {
  Id: number;
  Phone: string;
  Name: string;
  Email?: string;
  Points: number;
}

export interface LocalOrderRow {
  OfflineReferenceId: string;
  CustomerId?: number | null;
  TotalAmount: number;
  CreatedAt: string;
  IsSynced: number;
  CustomerName?: string;
  EmployeeName?: string;
  PaymentMethod?: string;
  OwnerUserId?: number;
  ShiftId?: number | null;
  ServerId?: number;
  SyncError?: string;
  SyncRetryCount?: number;
  SyncStatus?: string;
}

export interface LocalOrderDetailRow {
  Id: number;
  OfflineReferenceId: string;
  ProductId: string;
  Quantity: number;
  Price: number;
  UnitPrice?: number;
  ProductName?: string;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
export const getDBConnection = async () => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync("pos_wms_local.db");
  }
  return dbInstance;
};

if (__DEV__ && typeof window !== "undefined") {
  (window as any).__GET_LOCAL_DB__ = getDBConnection;
}

import { executeDatabaseMigrations } from "./schemaMigrations";

export const initLocalDatabase = async () => {
  try {
    const db = await getDBConnection();
    await executeDatabaseMigrations(db);
  } catch (error) {
    console.error("Lỗi khi khởi tạo SQLite:", error);
  }
};

import { calculateEffectiveStock } from "@/utils/calculator";
export { calculateEffectiveStock };

export const pullMasterData = async (role: string = "Admin"): Promise<{ failedModules: string[]; hasRequiredError: boolean }> => {
  try {
    const db = await getDBConnection();
    console.log(`[DB] Đang tải Master Data cho role: ${role}...`);

    const needsPos = ["Admin", "Manager", "Cashier", "WarehouseStaff"].includes(role);
    const needsCustomer = ["Admin", "Manager", "Cashier"].includes(role);
    const needsSupplier = ["Admin", "Manager", "WarehouseStaff"].includes(role);

    let failedModules: string[] = [];
    let hasRequiredError = false;

    const fetchSafe = async (url: string, moduleName: string, isRequired: boolean, fallbackUrl?: string) => {
      try {
        const res = await apiClient.get(url);
        return res.data?.data || res.data || [];
      } catch (e: any) {
        if (fallbackUrl && (e.response?.status === 404 || !e.response)) {
          try {
            console.log(`[DB] Fallback ${url} -> ${fallbackUrl}`);
            const fb = await apiClient.get(fallbackUrl);
            return fb.data?.data || fb.data || [];
          } catch (f: any) {
            console.warn(`[DB] Fallback ${fallbackUrl} failed:`, f.message);
          }
        }
        if (e.response?.status !== 403) {
          failedModules.push(moduleName);
          if (isRequired) hasRequiredError = true;
          console.error(`Lỗi get ${url}:`, e.message);
        }
        return null;
      }
    };

    const [categories, products, inventories, customers, suppliers] = await Promise.all([
      needsPos ? fetchSafe("/Categories", "Danh mục", true) : Promise.resolve(null),
      needsPos ? fetchSafe("/Products", "Sản phẩm", true) : Promise.resolve(null),
      needsPos ? fetchSafe("/Inventories", "Tồn kho", true) : Promise.resolve(null),
      needsCustomer ? fetchSafe("/Customers", "Khách hàng", false, "/Customer") : Promise.resolve(null),
      needsSupplier ? fetchSafe("/Suppliers", "Nhà cung cấp", false, "/Supplier") : Promise.resolve(null),
    ]);

    await db.execAsync("PRAGMA foreign_keys = OFF;");
    try {
      await db.withTransactionAsync(async () => {
        if (categories) {
          for (const c of categories) {
            await db.runAsync(
              "INSERT OR REPLACE INTO LocalCategories (Id, Name, Description, Code, IsSystem) VALUES (?, ?, ?, ?, ?)",
              [c.id, c.name, c.description || "", c.code || null, c.isSystem ? 1 : 0]
            );
          }
        }

      if (customers) {
        for (const c of customers) {
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalCustomers (Id, Name, Phone, Email, Points) VALUES (?, ?, ?, ?, ?)",
            [c.id, c.name, c.phone || "", c.email || "", c.points || 0]
          );
        }
      }

      if (suppliers) {
        for (const s of suppliers) {
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalSuppliers (Id, Name, ContactPerson, Phone, Address) VALUES (?, ?, ?, ?, ?)",
            [s.id, s.name, s.contactPerson || "", s.phone || "", s.address || ""]
          );
        }
      }

      if (products && inventories) {
        // BUG-SYNC-004: Calculate pending deductions from un-synced orders and additions from un-synced receipts
        const pendingOrders = await db.getAllAsync<{ OfflineReferenceId: string }>(
          "SELECT OfflineReferenceId FROM LocalOrders WHERE IsSynced = 0"
        );
        const pendingOutboundMap = new Map<string, number>();
        for (const order of pendingOrders) {
          const details = await db.getAllAsync<{ ProductId: string; Quantity: number }>(
            "SELECT ProductId, Quantity FROM LocalOrderDetails WHERE OfflineReferenceId = ?",
            [order.OfflineReferenceId]
          );
          for (const d of details) {
            pendingOutboundMap.set(d.ProductId, (pendingOutboundMap.get(d.ProductId) || 0) + d.Quantity);
          }
        }

        const pendingReceipts = await db.getAllAsync<{ OfflineReferenceId: string }>(
          "SELECT OfflineReferenceId FROM LocalGoodsReceipts WHERE IsSynced = 0"
        );
        const pendingInboundMap = new Map<string, number>();
        for (const rc of pendingReceipts) {
          const details = await db.getAllAsync<{ ProductId: string; Quantity: number }>(
            "SELECT ProductId, Quantity FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ?",
            [rc.OfflineReferenceId]
          );
          for (const d of details) {
            pendingInboundMap.set(d.ProductId, (pendingInboundMap.get(d.ProductId) || 0) + d.Quantity);
          }
        }

        const pendingAdjustments = await db.getAllAsync<{ ProductId: string; Delta: number }>(
          "SELECT ProductId, Delta FROM LocalStockAdjustments WHERE IsSynced = 0"
        );
        const pendingAdjustmentMap = new Map<string, number>();
        for (const adj of pendingAdjustments) {
          pendingAdjustmentMap.set(adj.ProductId, (pendingAdjustmentMap.get(adj.ProductId) || 0) + adj.Delta);
        }

        const incomingProductIds: string[] = [];
        for (const p of products) {
          if (p.isActive === false || p.IsActive === false) {
            continue;
          }
          const inv = inventories.find((i: any) => i.productId === p.id || i.ProductId === p.id);
          let serverStock = inv ? (inv.stockQuantity ?? inv.StockQuantity) : 0;
          if (serverStock === undefined || serverStock === null) serverStock = 0;

          // Merge server stock with local pending movements
          const pIdStr = p.id.toString();
          incomingProductIds.push(pIdStr);
          const effectiveStock = calculateEffectiveStock(
            serverStock,
            pendingInboundMap.get(pIdStr) || 0,
            pendingOutboundMap.get(pIdStr) || 0,
            pendingAdjustmentMap.get(pIdStr) || 0
          );

          let imageUri = p.imageUrl || null;
          const threshold = p.lowStockThreshold ?? p.LowStockThreshold ?? 10;
          const isConfigured = (p.isSalePriceConfigured !== false && p.IsSalePriceConfigured !== false) ? 1 : 0;
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalProducts (Id, CategoryId, SupplierId, Name, Price, Barcode, StockQuantity, ImageUrl, LowStockThreshold, IsSalePriceConfigured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [pIdStr, p.categoryId || 1, p.supplierId ?? null, p.name, p.price, p.barcode, effectiveStock, imageUri, threshold, isConfigured]
          );
        }

        // Safe cleanup: remove local products not returned by server ONLY if not referenced by pending queue
        if (incomingProductIds.length > 0) {
          const placeholders = incomingProductIds.map(() => '?').join(',');
          await db.runAsync(
            `DELETE FROM LocalProducts
             WHERE Id NOT IN (${placeholders})
             AND Id NOT IN (SELECT ProductId FROM LocalOrderDetails WHERE OfflineReferenceId IN (SELECT OfflineReferenceId FROM LocalOrders WHERE IsSynced = 0))
             AND Id NOT IN (SELECT ProductId FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId IN (SELECT OfflineReferenceId FROM LocalGoodsReceipts WHERE IsSynced = 0))
             AND Id NOT IN (SELECT ProductId FROM LocalStockAdjustments WHERE IsSynced = 0)`,
            incomingProductIds
          );
        }
      }
    });
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }

    console.log("[DB] Pull Master Data thành công!");
    return { failedModules, hasRequiredError };
  } catch (error) {
    console.error("Lỗi khi pullMasterData:", error);
    return { failedModules: ["Lỗi hệ thống"], hasRequiredError: true };
  }
};

export const insertLocalProduct = async (
  id: string,
  categoryId: number,
  name: string,
  price: number,
  barcode: string,
  stock: number,
  imageUrl?: string,
  supplierId?: number | null,
  lowStockThreshold: number = 10,
  isSalePriceConfigured: boolean = true
) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "INSERT OR REPLACE INTO LocalProducts (Id, CategoryId, SupplierId, Name, Price, Barcode, StockQuantity, ImageUrl, LowStockThreshold, IsSalePriceConfigured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, categoryId, supplierId ?? null, name, price, barcode, stock, imageUrl || null, lowStockThreshold, isSalePriceConfigured ? 1 : 0]
    );
  } catch (error) {
    console.error("Lỗi khi thêm sản phẩm local:", error);
  }
};

export const deleteLocalProduct = async (id: string) => {
  try {
    const db = await getDBConnection();
    await db.runAsync("DELETE FROM LocalProducts WHERE Id = ?", [id]);
  } catch (error) {
    console.error("Lỗi khi xóa sản phẩm local:", error);
  }
};

export const insertLocalCategory = async (id: number, name: string, description?: string) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "INSERT OR REPLACE INTO LocalCategories (Id, Name, Description) VALUES (?, ?, ?)",
      [id, name, description || ""]
    );
  } catch (error) {
    console.error("Lỗi khi thêm danh mục local:", error);
  }
};

export const deleteLocalCategory = async (id: number) => {
  try {
    const db = await getDBConnection();
    await db.runAsync("DELETE FROM LocalCategories WHERE Id = ?", [id]);
  } catch (error) {
    console.error("Lỗi khi xóa danh mục local:", error);
  }
};

export const getLocalProducts = async () => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalProductRow>("SELECT * FROM LocalProducts");
  } catch (error) {
    console.error("Lỗi khi lấy sản phẩm local:", error);
    return [];
  }
};

export const getLocalCategories = async () => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalCategoryRow>("SELECT * FROM LocalCategories");
  } catch (error) {
    console.error("Lỗi khi lấy danh mục local:", error);
    return [];
  }
};

export const updateLocalProductStock = async (id: string, newStock: number) => {
  try {
    const db = await getDBConnection();
    await db.runAsync("UPDATE LocalProducts SET StockQuantity = ? WHERE Id = ?", [newStock, id]);
  } catch (error) {
    console.error("Lỗi khi cập nhật tồn kho local:", error);
  }
};

export const insertLocalGoodsReceipt = async (
  offlineReferenceId: string,
  supplierId: number,
  supplierName: string,
  userId: number,
  totalAmount: number,
  remarks: string,
  items: { productId: string; quantity: number; costPrice: number }[]
) => {
  try {
    const db = await getDBConnection();
    const createdAt = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "INSERT INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, SupplierName, UserId, TotalAmount, Remarks, CreatedAt, IsSynced, SyncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Pending')",
        [offlineReferenceId, supplierId, supplierName, userId, totalAmount, remarks, createdAt]
      );

      // Invariant: uniqueProductCount across UI, Local, Request, SQL
      const itemMap = new Map<string, { productId: string; quantity: number; costPrice: number }>();
      for (const item of items) {
        const pid = String(item.productId);
        if (itemMap.has(pid)) {
          const existing = itemMap.get(pid)!;
          existing.quantity += item.quantity;
        } else {
          itemMap.set(pid, { ...item, productId: pid });
        }
      }
      const consolidatedItems = Array.from(itemMap.values());

      for (const item of consolidatedItems) {
        await db.runAsync(
          "INSERT INTO LocalGoodsReceiptDetails (OfflineReferenceId, ProductId, Quantity, CostPrice) VALUES (?, ?, ?, ?)",
          [offlineReferenceId, item.productId, item.quantity, item.costPrice]
        );
        await db.runAsync(
          "UPDATE LocalProducts SET StockQuantity = StockQuantity + ? WHERE Id = ?",
          [item.quantity, item.productId]
        );
      }
    });
    console.log(`[DB] Đã lưu phiếu nhập kho local: ${offlineReferenceId}`);
  } catch (error) {
    console.error("[DB] Lỗi khi tạo phiếu nhập kho local:", error);
    throw error;
  }
};

export const getLocalOrders = async () => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalOrderRow>("SELECT * FROM LocalOrders ORDER BY CreatedAt DESC");
  } catch (error) {
    console.error("Lỗi khi lấy hóa đơn local:", error);
    return [];
  }
};

export const getLocalOrderDetails = async (offlineReferenceId: string) => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalOrderDetailRow>(
      "SELECT * FROM LocalOrderDetails WHERE OfflineReferenceId = ?",
      [offlineReferenceId]
    );
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết hóa đơn local:", error);
    return [];
  }
};

export const getUnsyncedOrders = async (userId: number) => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalOrderRow>("SELECT * FROM LocalOrders WHERE IsSynced = 0 AND OwnerUserId = ?", [userId]);
  } catch (error) {
    console.error("Lỗi khi lấy hóa đơn chưa đồng bộ:", error);
    return [];
  }
};

export const getUnsyncedCounts = async (userId: number) => {
  try {
    const db = await getDBConnection();
    const countRow = await db.getFirstAsync<{ c: number }>(
      "SELECT (SELECT COUNT(*) FROM LocalOrders WHERE IsSynced = 0 AND OwnerUserId = ?) + (SELECT COUNT(*) FROM LocalGoodsReceipts WHERE IsSynced = 0 AND UserId = ?) as c",
      [userId, userId]
    );
    const unownedRow = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM LocalOrders WHERE IsSynced = 0 AND (OwnerUserId IS NULL OR OwnerUserId = 0)"
    );
    return {
      ownedCount: countRow?.c || 0,
      unownedCount: unownedRow?.c || 0,
    };
  } catch (error) {
    return { ownedCount: 0, unownedCount: 0 };
  }
};

export const markOrderAsSynced = async (offlineReferenceId: string) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "UPDATE LocalOrders SET IsSynced = 1, SyncStatus = 'Synced', SyncError = NULL WHERE OfflineReferenceId = ?",
      [offlineReferenceId]
    );
  } catch (error) {
    console.error(`Lỗi khi đánh dấu hóa đơn ${offlineReferenceId} đã đồng bộ:`, error);
  }
};

export const getLocalCustomers = async () => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalCustomerRow>("SELECT * FROM LocalCustomers");
  } catch (error) {
    console.error("Lỗi khi lấy khách hàng local:", error);
    return [];
  }
};

export const clearLocalData = async () => {
  try {
    const db = await getDBConnection();
    await db.runAsync("DELETE FROM LocalOrderDetails WHERE OfflineReferenceId IN (SELECT OfflineReferenceId FROM LocalOrders WHERE IsSynced = 1)");
    await db.runAsync("DELETE FROM LocalOrders WHERE IsSynced = 1");

    await db.runAsync("DELETE FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId IN (SELECT OfflineReferenceId FROM LocalGoodsReceipts WHERE IsSynced = 1)");
    await db.runAsync("DELETE FROM LocalGoodsReceipts WHERE IsSynced = 1");
    await db.runAsync("DELETE FROM LocalStockAdjustments WHERE IsSynced = 1");

    console.log("[DB] Đã dọn dẹp các chứng từ đã đồng bộ thành công. Giữ nguyên Master Data cache và Queue chờ đồng bộ.");
  } catch (error) {
    console.error("Lỗi khi dọn dẹp dữ liệu cục bộ:", error);
  }
};

export const recordStockAdjustment = async (
  offlineReferenceId: string,
  productId: string,
  delta: number,
  reason: string,
  userId: number
) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "INSERT INTO LocalStockAdjustments (OfflineReferenceId, ProductId, Delta, Reason, CreatedAt, UserId, IsSynced) VALUES (?, ?, ?, ?, ?, ?, 0)",
      [offlineReferenceId, productId, delta, reason, new Date().toISOString(), userId]
    );
  } catch (error) {
    console.error("Lỗi khi ghi nhận điều chỉnh kho local:", error);
  }
};
