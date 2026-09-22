export interface SQLiteDatabaseAdapter {
  execAsync(sql: string): Promise<any>;
  runAsync(sql: string, ...params: any[]): Promise<any>;
  getAllAsync<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, ...params: any[]): Promise<T | null>;
}

export const TARGET_SCHEMA_VERSION = 6;

export async function safeAddColumn(
  db: SQLiteDatabaseAdapter,
  table: string,
  column: string,
  type: string
): Promise<void> {
  try {
    const tableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    const columnExists = tableInfo.some((col) => col.name.toLowerCase() === column.toLowerCase());
    if (!columnExists) {
      await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (err) {
    console.warn(`[DB] safeAddColumn warning on ${table}.${column}:`, err);
  }
}

export async function executeDatabaseMigrations(db: SQLiteDatabaseAdapter): Promise<void> {
  try {
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");

    // Version management
    await db.execAsync("CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER);");
    const row = await db.getFirstAsync<{ version: number }>("SELECT version FROM _schema_version LIMIT 1");
    const currentVersion = row?.version ?? 0;

    // Unconditionally ensure all critical tables exist (idempotent CREATE TABLE IF NOT EXISTS)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS LocalCategories (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Name TEXT NOT NULL,
        Description TEXT,
        Code TEXT,
        IsSystem INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS LocalProducts (
        Id TEXT PRIMARY KEY NOT NULL,
        CategoryId INTEGER NOT NULL,
        SupplierId INTEGER,
        Name TEXT NOT NULL,
        Price REAL NOT NULL,
        Barcode TEXT,
        StockQuantity INTEGER NOT NULL,
        ImageUrl TEXT,
        LowStockThreshold INTEGER DEFAULT 10,
        IsSalePriceConfigured INTEGER DEFAULT 1,
        FOREIGN KEY (CategoryId) REFERENCES LocalCategories(Id)
      );
      CREATE TABLE IF NOT EXISTS LocalOrders (
        OfflineReferenceId TEXT PRIMARY KEY NOT NULL,
        CustomerId INTEGER,
        TotalAmount REAL NOT NULL,
        CreatedAt TEXT NOT NULL,
        IsSynced INTEGER DEFAULT 0,
        CustomerName TEXT,
        EmployeeName TEXT,
        PaymentMethod TEXT DEFAULT 'CASH',
        OwnerUserId INTEGER,
        ServerId INTEGER,
        SyncError TEXT,
        SyncRetryCount INTEGER DEFAULT 0,
        SyncStatus TEXT DEFAULT 'Pending',
        ShiftId INTEGER
      );
      CREATE TABLE IF NOT EXISTS LocalOrderDetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OfflineReferenceId TEXT NOT NULL,
        ProductId TEXT NOT NULL,
        Quantity INTEGER NOT NULL,
        Price REAL NOT NULL,
        FOREIGN KEY (OfflineReferenceId) REFERENCES LocalOrders(OfflineReferenceId)
      );
      CREATE TABLE IF NOT EXISTS LocalGoodsReceipts (
        OfflineReferenceId TEXT PRIMARY KEY NOT NULL,
        SupplierId INTEGER NOT NULL,
        SupplierName TEXT,
        UserId INTEGER,
        TotalAmount REAL NOT NULL,
        Remarks TEXT,
        CreatedAt TEXT NOT NULL,
        IsSynced INTEGER DEFAULT 0,
        ServerId INTEGER,
        SyncError TEXT,
        SyncRetryCount INTEGER DEFAULT 0,
        SyncStatus TEXT DEFAULT 'Pending',
        ShiftId INTEGER
      );
      CREATE TABLE IF NOT EXISTS LocalGoodsReceiptDetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OfflineReferenceId TEXT NOT NULL,
        ProductId TEXT NOT NULL,
        Quantity INTEGER NOT NULL,
        CostPrice REAL NOT NULL,
        FOREIGN KEY (OfflineReferenceId) REFERENCES LocalGoodsReceipts(OfflineReferenceId)
      );
      CREATE TABLE IF NOT EXISTS LocalSuppliers (
        Id INTEGER PRIMARY KEY NOT NULL,
        Name TEXT NOT NULL,
        ContactPerson TEXT,
        Phone TEXT,
        Address TEXT
      );
      CREATE TABLE IF NOT EXISTS LocalCustomers (
        Id INTEGER PRIMARY KEY NOT NULL,
        Name TEXT NOT NULL,
        Phone TEXT NOT NULL,
        Email TEXT,
        Points INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS LocalStockAdjustments (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OfflineReferenceId TEXT NOT NULL,
        ProductId TEXT NOT NULL,
        Delta INTEGER NOT NULL,
        Reason TEXT,
        CreatedAt TEXT NOT NULL,
        UserId INTEGER,
        IsSynced INTEGER DEFAULT 0,
        SyncStatus TEXT DEFAULT 'Pending',
        SyncError TEXT,
        RetryCount INTEGER DEFAULT 0,
        ShiftId INTEGER
      );
      CREATE TABLE IF NOT EXISTS LocalShifts (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        ServerId INTEGER,
        UserId INTEGER NOT NULL,
        Role TEXT NOT NULL,
        StartedAt TEXT NOT NULL,
        EndedAt TEXT,
        Status TEXT DEFAULT 'Open',
        FinalReportSnapshot TEXT,
        ClosingRemarks TEXT
      );
    `);

    // Ensure all schema columns exist across older installs (idempotent safeAddColumn)
    await safeAddColumn(db, "LocalCategories", "Description", "TEXT");
    await safeAddColumn(db, "LocalCategories", "Code", "TEXT");
    await safeAddColumn(db, "LocalCategories", "IsSystem", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalProducts", "SupplierId", "INTEGER");
    await safeAddColumn(db, "LocalProducts", "LowStockThreshold", "INTEGER DEFAULT 10");
    await safeAddColumn(db, "LocalProducts", "IsSalePriceConfigured", "INTEGER DEFAULT 1");

    await safeAddColumn(db, "LocalOrders", "CustomerId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "OwnerUserId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "ServerId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "SyncError", "TEXT");
    await safeAddColumn(db, "LocalOrders", "PaymentMethod", "TEXT DEFAULT 'CASH'");
    await safeAddColumn(db, "LocalOrders", "SyncRetryCount", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalOrders", "SyncStatus", "TEXT DEFAULT 'Pending'");
    await safeAddColumn(db, "LocalOrders", "ShiftId", "INTEGER");

    await safeAddColumn(db, "LocalGoodsReceipts", "ServerId", "INTEGER");
    await safeAddColumn(db, "LocalGoodsReceipts", "SyncError", "TEXT");
    await safeAddColumn(db, "LocalGoodsReceipts", "SyncRetryCount", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalGoodsReceipts", "SyncStatus", "TEXT DEFAULT 'Pending'");
    await safeAddColumn(db, "LocalGoodsReceipts", "ShiftId", "INTEGER");

    await safeAddColumn(db, "LocalStockAdjustments", "SyncStatus", "TEXT DEFAULT 'Pending'");
    await safeAddColumn(db, "LocalStockAdjustments", "SyncError", "TEXT");
    await safeAddColumn(db, "LocalStockAdjustments", "RetryCount", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalStockAdjustments", "ShiftId", "INTEGER");

    await db.runAsync("DELETE FROM _schema_version");
    await db.runAsync("INSERT INTO _schema_version (version) VALUES (?)", TARGET_SCHEMA_VERSION);
    console.log(`[DB] Đã khởi tạo và xác minh toàn vẹn schema SQLite ở version ${TARGET_SCHEMA_VERSION}`);
  } finally {
    try {
      await db.execAsync("PRAGMA foreign_keys = ON;");
    } catch (e) {
      console.warn("[DB] Failed to re-assert PRAGMA foreign_keys = ON in finally block:", e);
    }
  }
}
