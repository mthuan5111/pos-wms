import * as SQLite from "expo-sqlite";
import { downloadAndSaveImageAsync } from "@/utils/fileManager";
import { Platform } from "react-native";

export interface LocalCategoryRow {
  Id: number;
  Name: string;
  Description?: string;
}

export interface LocalProductRow {
  Id: string;
  CategoryId: number;
  Name: string;
  Price: number;
  Barcode: string;
  StockQuantity: number;
  ImageUrl?: string;
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
  Points: number;
}



let dbInstance: SQLite.SQLiteDatabase | null = null;
export const getDBConnection = async () => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync("pos_wms_local.db");
  }
  return dbInstance;
};

export const initLocalDatabase = async () => {
  try {
    const db = await getDBConnection();
    await db.execAsync(`
            PRAGMA journal_mode = WAL;

            -- Bảng danh mục
            DROP TABLE IF EXISTS LocalCategories;
            CREATE TABLE IF NOT EXISTS LocalCategories(
              Id INTEGER PRIMARY KEY AUTOINCREMENT,
              Name TEXT NOT NULL
            );

            -- Bảng Sản phẩm
            DROP TABLE IF EXISTS LocalProducts;
            CREATE TABLE IF NOT EXISTS LocalProducts (
                Id TEXT PRIMARY KEY NOT NULL,
                CategoryId INTERGER NOT NULL,
                Name TEXT NOT NULL,
                Price REAL NOT NULL,
                Barcode TEXT,
                StockQuantity INTEGER NOT NULL,
                ImageUrl TEXT,
                FOREIGN KEY (CategoryId) REFERENCES LocalCategories(Id)
            );

            -- Bảng Đơn hàng
            CREATE TABLE IF NOT EXISTS LocalOrders (
                OfflineReferenceId TEXT PRIMARY KEY NOT NULL,
                TotalAmount REAL NOT NULL,
                CreatedAt TEXT NOT NULL,
                IsSynced INTEGER DEFAULT 0,
                CustomerName TEXT,
                EmployeeName TEXT,
                PaymentMethod TEXT DEFAULT 'CASH'
            );

            -- Bảng Chi tiết đơn hàng
            CREATE TABLE IF NOT EXISTS LocalOrderDetails (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                OfflineReferenceId TEXT NOT NULL,
                ProductId TEXT NOT NULL,
                Quantity INTEGER NOT NULL,
                Price REAL NOT NULL,
                FOREIGN KEY (OfflineReferenceId) REFERENCES LocalOrders(OfflineReferenceId)
            );

            -- Bảng Phiếu nhập kho (Goods Receipts)
            CREATE TABLE IF NOT EXISTS LocalGoodsReceipts (
                OfflineReferenceId TEXT PRIMARY KEY NOT NULL,
                SupplierId INTEGER NOT NULL,
                SupplierName TEXT,
                UserId INTEGER,
                TotalAmount REAL NOT NULL,
                Remarks TEXT,
                CreatedAt TEXT NOT NULL,
                IsSynced INTEGER DEFAULT 0
            );

            -- Bảng Chi tiết phiếu nhập
            CREATE TABLE IF NOT EXISTS LocalGoodsReceiptDetails (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                OfflineReferenceId TEXT NOT NULL,
                ProductId TEXT NOT NULL,
                Quantity INTEGER NOT NULL,
                CostPrice REAL NOT NULL,
                FOREIGN KEY (OfflineReferenceId) REFERENCES LocalGoodsReceipts(OfflineReferenceId)
            );

            -- Bảng Nhà cung cấp
            DROP TABLE IF EXISTS LocalSuppliers;
            CREATE TABLE IF NOT EXISTS LocalSuppliers (
                Id INTEGER PRIMARY KEY NOT NULL,
                Name TEXT NOT NULL,
                ContactPerson TEXT,
                Phone TEXT,
                Address TEXT
            );

            -- Bảng Khách hàng
            DROP TABLE IF EXISTS LocalCustomers;
            CREATE TABLE IF NOT EXISTS LocalCustomers (
                Id INTEGER PRIMARY KEY NOT NULL,
                Name TEXT NOT NULL,
                Phone TEXT NOT NULL,
                Email TEXT,
                Points INTEGER DEFAULT 0
            );
        `);
        
    try {
        await db.runAsync("ALTER TABLE LocalOrders ADD COLUMN PaymentMethod TEXT DEFAULT 'CASH'");
    } catch (e) {
        // Column already exists, ignore
    }

    console.log("[DB] Khởi tạo Local Database thành công");
  } catch (error) {
    console.error("Lỗi khi khởi tạo SQLite:", error);
  }
};

import apiClient from "@/services/apiClient";

export const pullMasterData = async () => {
  try {
    const db = await getDBConnection();
    
    console.log("[DB] Đang tải dữ liệu Master từ Server...");
    
    let categoriesRes: any = null, productsRes: any = null, inventoryRes: any = null, customersRes: any = null, suppliersRes: any = null;

    try {
      // Fetch categories
      categoriesRes = await apiClient.get('/Categories');
    } catch(e) { console.error("Lỗi get /Categories"); }
    if (categoriesRes.data && categoriesRes.data.isSuccess) {
      const categories = categoriesRes.data.data;
      await db.runAsync("DELETE FROM LocalCategories");
      for (const c of categories) {
        await db.runAsync(
          "INSERT INTO LocalCategories (Id, Name) VALUES (?, ?)",
          [c.id, c.name]
        );
      }
    }

    try {
      productsRes = await apiClient.get('/Products');
    } catch (e) { console.error("Lỗi get /Products", e); }

    try {
      inventoryRes = await apiClient.get('/Inventories');
    } catch (e) { console.error("Lỗi get /Inventories", e); }

    try {
      customersRes = await apiClient.get('/Customer');
    } catch (e) { console.error("Lỗi get /Customer", e); }

    if (customersRes && customersRes.data?.isSuccess) {
      const customers = customersRes.data.data;
      await db.runAsync("DELETE FROM LocalCustomers");
      for (const c of customers) {
        await db.runAsync(
          "INSERT INTO LocalCustomers (Id, Name, Phone, Email, Points) VALUES (?, ?, ?, ?, ?)",
          [c.id, c.name, c.phone || '', c.email || '', c.points || 0]
        );
      }
    }

    // Fetch suppliers
    try {
      suppliersRes = await apiClient.get('/Suppliers');
    } catch(e) { console.error("Lỗi get /Suppliers"); }
    
    if (suppliersRes && suppliersRes.data?.isSuccess) {
      const suppliers = suppliersRes.data.data;
      await db.runAsync("DELETE FROM LocalSuppliers");
      for (const s of suppliers) {
        await db.runAsync(
          "INSERT INTO LocalSuppliers (Id, Name, ContactPerson, Phone, Address) VALUES (?, ?, ?, ?, ?)",
          [s.id, s.name, s.contactPerson || '', s.phone || '', s.address || '']
        );
      }
    }
    
    if (productsRes && productsRes.data?.isSuccess && inventoryRes && inventoryRes.data?.isSuccess) {
      const products = productsRes.data.data;
      const inventories = inventoryRes.data.data;
      
      await db.runAsync("DELETE FROM LocalProducts");
      
      for (const p of products) {
        // Find matching inventory
        const inv = inventories.find((i: any) => i.productId === p.id);
        const stock = inv ? inv.stockQuantity : 0;
        
        let imageUri: string | null = p.imageUrl || null;
        if (Platform.OS !== "web" && imageUri) {
          try {
            const localUri = await downloadAndSaveImageAsync(imageUri, p.id.toString());
            if (localUri) imageUri = localUri;
          } catch (error) {
            console.warn(`Lỗi tải ảnh offline cho SP ${p.id}`);
          }
        }
        
        await db.runAsync(
          "INSERT INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity, ImageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [p.id.toString(), p.categoryId || 1, p.name, p.price, p.barcode, stock, imageUri]
        );
      }
    }
    console.log("[DB] Pull Master Data thành công!");
  } catch (error) {
    console.error("Lỗi khi pullMasterData:", error);
    throw error;
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
) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "INSERT OR REPLACE INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity, ImageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, categoryId, name, price, barcode, stock, imageUrl || null],
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

export const insertLocalCategory = async (id: number, name: string, description: string) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "INSERT OR REPLACE INTO LocalCategories (Id, Name) VALUES (?, ?)",
      [id, name]
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
    const allRows = await db.getAllAsync<LocalProductRow>(
      "SELECT * FROM LocalProducts",
    );
    return allRows;
  } catch (error) {
    console.error("Lỗi khi lấy sản phẩm local:", error);
    return [];
  }
};

export const getLocalCategories = async () => {
  try {
    const db = await getDBConnection();
    const allRows = await db.getAllAsync<LocalCategoryRow>(
      "SELECT * FROM LocalCategories",
    );
    return allRows;
  } catch (error) {
    console.error("Lỗi khi lấy danh mục local:", error);
    return [];
  }
};

export const updateLocalProductStock = async (id: string, newStock: number) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "UPDATE LocalProducts SET StockQuantity = ? WHERE Id = ?",
      [newStock, id],
    );
  } catch (error) {
    console.error("Lỗi khi cập nhật tồn kho local:", error);
  }
};

export const insertInventoryReceipt = async (
  productId: string,
  quantityAdded: number,
  employeeName: string,
) => {
  try {
    const db = await getDBConnection();
    const createdAt = new Date().toISOString();
    await db.runAsync(
      "INSERT INTO LocalInventoryReceipts (ProductId, QuantityAdded, CreatedAt, EmployeeName) VALUES (?, ?, ?, ?)",
      [productId, quantityAdded, createdAt, employeeName]
    );
  } catch (error) {
    console.error("Lỗi khi tạo hóa đơn nhập kho local:", error);
  }
};

import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';

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
        "INSERT INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, SupplierName, UserId, TotalAmount, Remarks, CreatedAt, IsSynced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        [offlineReferenceId, supplierId, supplierName, userId, totalAmount, remarks, createdAt]
      );

      for (const item of items) {
        await db.runAsync(
          "INSERT INTO LocalGoodsReceiptDetails (OfflineReferenceId, ProductId, Quantity, CostPrice) VALUES (?, ?, ?, ?)",
          [offlineReferenceId, item.productId, item.quantity, item.costPrice]
        );
      }
    });
    console.log(`[DB] Đã lưu phiếu nhập kho local: ${offlineReferenceId}`);
    
    // Trigger sync
    useGlobalSyncStore.getState().requestSync();
  } catch (error) {
    console.error("[DB] Lỗi khi tạo phiếu nhập kho local:", error);
    throw error;
  }
};

export interface LocalOrderRow {
  OfflineReferenceId: string;
  TotalAmount: number;
  CreatedAt: string;
  IsSynced: number;
  CustomerName?: string;
  EmployeeName?: string;
  PaymentMethod?: string;
  UserId?: number;
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

export const getUnsyncedOrders = async () => {
  try {
    const db = await getDBConnection();
    return await db.getAllAsync<LocalOrderRow>("SELECT * FROM LocalOrders WHERE IsSynced = 0");
  } catch (error) {
    console.error("Lỗi khi lấy hóa đơn chưa đồng bộ:", error);
    return [];
  }
};

export const markOrderAsSynced = async (offlineReferenceId: string) => {
  try {
    const db = await getDBConnection();
    await db.runAsync(
      "UPDATE LocalOrders SET IsSynced = 1 WHERE OfflineReferenceId = ?",
      [offlineReferenceId]
    );
  } catch (error) {
    console.error(`Lỗi khi đánh dấu hóa đơn ${offlineReferenceId} đã đồng bộ:`, error);
  }
};

export interface LocalCustomerRow {
  Id: number;
  Name: string;
  Phone: string;
  Email: string;
  Points: number;
}

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
    await db.runAsync("DELETE FROM LocalOrderDetails");
    await db.runAsync("DELETE FROM LocalOrders");
    await db.runAsync("DELETE FROM LocalGoodsReceiptDetails");
    await db.runAsync("DELETE FROM LocalGoodsReceipts");
    await db.runAsync("DELETE FROM LocalSuppliers");
    await db.runAsync("DELETE FROM LocalProducts");
    await db.runAsync("DELETE FROM LocalCategories");
    await db.runAsync("DELETE FROM LocalCustomers");
    console.log("[DB] Đã xóa sạch dữ liệu cục bộ an toàn");
  } catch (error) {
    console.error("Lỗi khi xóa dữ liệu cục bộ:", error);
  }
};
