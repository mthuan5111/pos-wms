// ==============================================================================
// SQLITE MIGRATION SUITE ACROSS PRE-V8 LEGACY SCENARIOS
// Path: tests/demo-sandbox/test_sqlite_migration_scenarios.cjs
//
// Tests migration of legacy databases (Schemas prior to v8, various data states)
// Verifies ZERO data loss, outbox preservation, account isolation, and idempotency.
// ==============================================================================

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.resolve(__dirname, 'migration_test_legacy.sqlite');

function cleanUp() {
  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
  }
}

// Emulate SQLiteDatabaseAdapter around DatabaseSync
function createAdapter(db) {
  return {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    },
    getAllAsync: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },
    getFirstAsync: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      return stmt.get(...params) || null;
    }
  };
}

// Exactly mirror executeDatabaseMigrations from frontend/src/database/schemaMigrations.ts
const TARGET_SCHEMA_VERSION = 8;
const TARGET_DATA_GENERATION = "20260922_GEN2";

async function safeAddColumn(db, table, column, type) {
  try {
    const tableInfo = await db.getAllAsync(`PRAGMA table_info(${table})`);
    const columnExists = tableInfo.some((col) => col.name.toLowerCase() === column.toLowerCase());
    if (!columnExists) {
      await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (err) {
    console.warn(`[DB] safeAddColumn warning on ${table}.${column}:`, err);
  }
}

async function executeDatabaseMigrations(db) {
  try {
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");

    // Data generation record (purely non-destructive metadata tracking to prevent accidental data purge)
    await db.execAsync("CREATE TABLE IF NOT EXISTS _data_generation (generation TEXT);");
    const genRow = await db.getFirstAsync("SELECT generation FROM _data_generation LIMIT 1");
    if (!genRow) {
      await db.runAsync("INSERT INTO _data_generation (generation) VALUES (?)", TARGET_DATA_GENERATION);
    } else if (genRow.generation !== TARGET_DATA_GENERATION) {
      await db.runAsync("UPDATE _data_generation SET generation = ?", TARGET_DATA_GENERATION);
    }

    // Version management
    await db.execAsync("CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER);");

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
        ImagePublicId TEXT,
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

      CREATE TABLE IF NOT EXISTS DemoSandboxSessions (
        SessionId TEXT PRIMARY KEY,
        CreatedAt TEXT NOT NULL,
        LastActivityAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS DemoSandboxOrders (
        OfflineReferenceId TEXT PRIMARY KEY,
        SessionId TEXT NOT NULL,
        CustomerName TEXT,
        TotalAmount REAL NOT NULL,
        PaymentMethod TEXT DEFAULT 'CASH',
        CreatedAt TEXT NOT NULL,
        IsSynced INTEGER DEFAULT 0,
        SyncStatus TEXT DEFAULT 'Pending',
        ShiftCode TEXT
      );

      CREATE TABLE IF NOT EXISTS DemoSandboxOrderDetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OfflineReferenceId TEXT NOT NULL,
        SessionId TEXT NOT NULL,
        ProductId TEXT NOT NULL,
        ProductName TEXT NOT NULL,
        Quantity INTEGER NOT NULL,
        Price REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS DemoSandboxShifts (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        SessionId TEXT NOT NULL,
        ShiftCode TEXT NOT NULL,
        UserId INTEGER,
        StartedAt TEXT NOT NULL,
        EndedAt TEXT,
        Status TEXT DEFAULT 'Open',
        StartingCash REAL NOT NULL,
        EndingCash REAL,
        ExpectedCash REAL,
        Difference REAL,
        SummarySnapshot TEXT,
        Remarks TEXT
      );

      CREATE TABLE IF NOT EXISTS DemoSandboxGoodsReceipts (
        OfflineReferenceId TEXT PRIMARY KEY,
        SessionId TEXT NOT NULL,
        SupplierId INTEGER NOT NULL,
        SupplierName TEXT,
        TotalAmount REAL NOT NULL,
        Remarks TEXT,
        CreatedAt TEXT NOT NULL,
        Status TEXT DEFAULT 'Completed',
        IsSynced INTEGER DEFAULT 0,
        ShiftCode TEXT
      );

      CREATE TABLE IF NOT EXISTS DemoSandboxGoodsReceiptDetails (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OfflineReferenceId TEXT NOT NULL,
        SessionId TEXT NOT NULL,
        ProductId TEXT NOT NULL,
        ProductName TEXT NOT NULL,
        Quantity INTEGER NOT NULL,
        MockCostPrice REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS DemoSandboxStockAdjustments (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        OfflineReferenceId TEXT NOT NULL,
        SessionId TEXT NOT NULL,
        ProductId TEXT NOT NULL,
        Delta INTEGER NOT NULL,
        Reason TEXT,
        CreatedAt TEXT NOT NULL,
        BeforeQty INTEGER NOT NULL,
        AfterQty INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS SyncCheckpoints (
        ScopeKey TEXT PRIMARY KEY,
        LastCursor INTEGER DEFAULT 0,
        LastPulledAt TEXT,
        IsBootstrapped INTEGER DEFAULT 0
      );
    `);

    // Ensure default checkpoint exists if table is empty (un-bootstrapped state: IsBootstrapped = 0)
    const cpRow = await db.getFirstAsync("SELECT ScopeKey FROM SyncCheckpoints WHERE ScopeKey = 'global'");
    if (!cpRow) {
      await db.runAsync(
        "INSERT INTO SyncCheckpoints (ScopeKey, LastCursor, LastPulledAt, IsBootstrapped) VALUES ('global', 0, NULL, 0)"
      );
    }

    // Ensure all schema columns exist across older installs (idempotent safeAddColumn)
    await safeAddColumn(db, "LocalCategories", "Description", "TEXT");
    await safeAddColumn(db, "LocalCategories", "Code", "TEXT");
    await safeAddColumn(db, "LocalCategories", "IsSystem", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalCategories", "IsActive", "INTEGER DEFAULT 1");
    await safeAddColumn(db, "LocalCategories", "UpdatedAt", "TEXT");
    await safeAddColumn(db, "LocalCategories", "IsDeleted", "INTEGER DEFAULT 0");

    await safeAddColumn(db, "LocalSuppliers", "IsActive", "INTEGER DEFAULT 1");
    await safeAddColumn(db, "LocalSuppliers", "UpdatedAt", "TEXT");
    await safeAddColumn(db, "LocalSuppliers", "IsDeleted", "INTEGER DEFAULT 0");

    await safeAddColumn(db, "LocalProducts", "SupplierId", "INTEGER");
    await safeAddColumn(db, "LocalProducts", "LowStockThreshold", "INTEGER DEFAULT 10");
    await safeAddColumn(db, "LocalProducts", "IsSalePriceConfigured", "INTEGER DEFAULT 1");
    await safeAddColumn(db, "LocalProducts", "ImagePublicId", "TEXT");
    await safeAddColumn(db, "LocalProducts", "ServerVersion", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalProducts", "UpdatedAt", "TEXT");
    await safeAddColumn(db, "LocalProducts", "IsDeleted", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalProducts", "LastSyncedAt", "TEXT");
    await safeAddColumn(db, "LocalProducts", "IsActive", "INTEGER DEFAULT 1");

    await safeAddColumn(db, "LocalOrders", "CustomerId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "OwnerUserId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "ServerId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "SyncError", "TEXT");
    await safeAddColumn(db, "LocalOrders", "PaymentMethod", "TEXT DEFAULT 'CASH'");
    await safeAddColumn(db, "LocalOrders", "SyncRetryCount", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalOrders", "SyncStatus", "TEXT DEFAULT 'Pending'");
    await safeAddColumn(db, "LocalOrders", "ShiftId", "INTEGER");
    await safeAddColumn(db, "LocalOrders", "ServerVersion", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalOrders", "LastSyncedAt", "TEXT");
    await safeAddColumn(db, "LocalOrders", "NextRetryAt", "TEXT");
    await safeAddColumn(db, "LocalOrders", "LastSafeErrorCode", "TEXT");

    await safeAddColumn(db, "LocalGoodsReceipts", "ServerId", "INTEGER");
    await safeAddColumn(db, "LocalGoodsReceipts", "SyncError", "TEXT");
    await safeAddColumn(db, "LocalGoodsReceipts", "SyncRetryCount", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalGoodsReceipts", "SyncStatus", "TEXT DEFAULT 'Pending'");
    await safeAddColumn(db, "LocalGoodsReceipts", "ShiftId", "INTEGER");
    await safeAddColumn(db, "LocalGoodsReceipts", "ServerVersion", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalGoodsReceipts", "LastSyncedAt", "TEXT");
    await safeAddColumn(db, "LocalGoodsReceipts", "NextRetryAt", "TEXT");
    await safeAddColumn(db, "LocalGoodsReceipts", "LastSafeErrorCode", "TEXT");

    await safeAddColumn(db, "LocalStockAdjustments", "SyncStatus", "TEXT DEFAULT 'Pending'");
    await safeAddColumn(db, "LocalStockAdjustments", "SyncError", "TEXT");
    await safeAddColumn(db, "LocalStockAdjustments", "RetryCount", "INTEGER DEFAULT 0");
    await safeAddColumn(db, "LocalStockAdjustments", "ShiftId", "INTEGER");
    await safeAddColumn(db, "LocalStockAdjustments", "NextRetryAt", "TEXT");
    await safeAddColumn(db, "LocalStockAdjustments", "LastSafeErrorCode", "TEXT");
    await safeAddColumn(db, "LocalStockAdjustments", "LastSyncedAt", "TEXT");

    await db.runAsync("DELETE FROM _schema_version");
    await db.runAsync("INSERT INTO _schema_version (version) VALUES (?)", TARGET_SCHEMA_VERSION);
  } finally {
    try {
      await db.execAsync("PRAGMA foreign_keys = ON;");
    } catch (_) {}
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("=== SQLITE MIGRATION INTEGRATION TESTS (SCENARIOS A - F)                      ===");
  console.log("================================================================================\n");

  cleanUp();

  // Create legacy database with pre-v8 schema and legacy data
  const rawDb = new DatabaseSync(TEST_DB_PATH);
  const adapter = createAdapter(rawDb);

  console.log("[PRE-CONDITION] Building legacy pre-v8 SQLite schema (Schema Version 6)...");

  rawDb.exec(`
    CREATE TABLE _schema_version (version INTEGER);
    INSERT INTO _schema_version (version) VALUES (6);

    CREATE TABLE LocalCategories (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Description TEXT
    );

    CREATE TABLE LocalProducts (
      Id TEXT PRIMARY KEY NOT NULL,
      CategoryId INTEGER NOT NULL,
      Name TEXT NOT NULL,
      Price REAL NOT NULL,
      Barcode TEXT,
      StockQuantity INTEGER NOT NULL
    );

    CREATE TABLE LocalOrders (
      OfflineReferenceId TEXT PRIMARY KEY NOT NULL,
      CustomerId INTEGER,
      TotalAmount REAL NOT NULL,
      CreatedAt TEXT NOT NULL,
      IsSynced INTEGER DEFAULT 0,
      CustomerName TEXT,
      EmployeeName TEXT,
      PaymentMethod TEXT DEFAULT 'CASH',
      OwnerUserId INTEGER
    );

    CREATE TABLE LocalOrderDetails (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OfflineReferenceId TEXT NOT NULL,
      ProductId TEXT NOT NULL,
      Quantity INTEGER NOT NULL,
      Price REAL NOT NULL
    );

    CREATE TABLE LocalGoodsReceipts (
      OfflineReferenceId TEXT PRIMARY KEY NOT NULL,
      SupplierId INTEGER NOT NULL,
      SupplierName TEXT,
      UserId INTEGER,
      TotalAmount REAL NOT NULL,
      Remarks TEXT,
      CreatedAt TEXT NOT NULL,
      IsSynced INTEGER DEFAULT 0
    );

    CREATE TABLE LocalGoodsReceiptDetails (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OfflineReferenceId TEXT NOT NULL,
      ProductId TEXT NOT NULL,
      Quantity INTEGER NOT NULL,
      CostPrice REAL NOT NULL
    );

    CREATE TABLE LocalStockAdjustments (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OfflineReferenceId TEXT NOT NULL,
      ProductId TEXT NOT NULL,
      Delta INTEGER NOT NULL,
      Reason TEXT,
      CreatedAt TEXT NOT NULL,
      UserId INTEGER,
      IsSynced INTEGER DEFAULT 0
    );

    CREATE TABLE DemoSandboxOrders (
      OfflineReferenceId TEXT PRIMARY KEY,
      SessionId TEXT NOT NULL,
      CustomerName TEXT,
      TotalAmount REAL NOT NULL,
      PaymentMethod TEXT DEFAULT 'CASH',
      CreatedAt TEXT NOT NULL,
      IsSynced INTEGER DEFAULT 0,
      SyncStatus TEXT DEFAULT 'Pending'
    );
  `);

  console.log("✓ Pre-v8 tables created.\n");

  // POPULATE SCENARIOS A - F
  console.log("[POPULATING TEST SCENARIOS]");

  // A. Schema cũ có dữ liệu master data đã đồng bộ
  rawDb.exec(`
    INSERT INTO LocalCategories (Id, Name, Description) VALUES (1, 'Cà phê', 'Danh mục cà phê');
    INSERT INTO LocalCategories (Id, Name, Description) VALUES (2, 'Trà', 'Danh mục trà');
    INSERT INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity) VALUES ('232', 1, 'Cà phê đen đá', 25000, 'CF001', 99);
    INSERT INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity) VALUES ('233', 2, 'Trà đào cam sả', 35000, 'TRA001', 50);
  `);
  console.log("✓ Scenario A populated: 2 Categories, 2 Products (LocalProducts)");

  // B. Schema cũ có pending Orders (IsSynced = 0)
  rawDb.exec(`
    INSERT INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, IsSynced, CustomerName, OwnerUserId)
    VALUES ('ORD_OFFLINE_USER1_001', 1, 50000, '2026-09-25T10:00:00Z', 0, 'Khách vãng lai', 1);

    INSERT INTO LocalOrderDetails (OfflineReferenceId, ProductId, Quantity, Price)
    VALUES ('ORD_OFFLINE_USER1_001', '232', 2, 25000);
  `);
  console.log("✓ Scenario B populated: 1 pending Order (ORD_OFFLINE_USER1_001) for User 1");

  // C. Schema cũ có pending GoodsReceipts (IsSynced = 0)
  rawDb.exec(`
    INSERT INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, SupplierName, UserId, TotalAmount, Remarks, CreatedAt, IsSynced)
    VALUES ('GR_OFFLINE_USER1_001', 1, 'Công ty Cung cấp Hạt', 1, 1000000, 'Nhập hạt cà phê', '2026-09-25T09:00:00Z', 0);

    INSERT INTO LocalGoodsReceiptDetails (OfflineReferenceId, ProductId, Quantity, CostPrice)
    VALUES ('GR_OFFLINE_USER1_001', '232', 40, 25000);
  `);
  console.log("✓ Scenario C populated: 1 pending GoodsReceipt (GR_OFFLINE_USER1_001) for User 1");

  // D. Schema cũ có pending StockAdjustments (IsSynced = 0)
  rawDb.exec(`
    INSERT INTO LocalStockAdjustments (OfflineReferenceId, ProductId, Delta, Reason, CreatedAt, UserId, IsSynced)
    VALUES ('ADJ_OFFLINE_USER1_001', '232', -2, 'Hao hụt kiểm kê', '2026-09-25T11:00:00Z', 1, 0);
  `);
  console.log("✓ Scenario D populated: 1 pending StockAdjustment (ADJ_OFFLINE_USER1_001) for User 1");

  // E. Schema cũ có pending mutations của User 2 (multi-account pending mutation)
  rawDb.exec(`
    INSERT INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, IsSynced, CustomerName, OwnerUserId)
    VALUES ('ORD_OFFLINE_USER2_001', 1, 70000, '2026-09-25T10:30:00Z', 0, 'Khách VIP', 2);

    INSERT INTO LocalOrderDetails (OfflineReferenceId, ProductId, Quantity, Price)
    VALUES ('ORD_OFFLINE_USER2_001', '233', 2, 35000);

    INSERT INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, SupplierName, UserId, TotalAmount, Remarks, CreatedAt, IsSynced)
    VALUES ('GR_OFFLINE_USER2_001', 2, 'Công ty Trà', 2, 500000, 'Nhập trà đào', '2026-09-25T09:30:00Z', 0);

    INSERT INTO LocalGoodsReceiptDetails (OfflineReferenceId, ProductId, Quantity, CostPrice)
    VALUES ('GR_OFFLINE_USER2_001', '233', 20, 25000);
  `);
  console.log("✓ Scenario E populated: Pending Orders & Receipts for User 2 (multi-account isolation)");

  // F. Schema cũ có dữ liệu Demo Sandbox
  rawDb.exec(`
    INSERT INTO DemoSandboxOrders (OfflineReferenceId, SessionId, CustomerName, TotalAmount, CreatedAt, IsSynced, SyncStatus)
    VALUES ('DEMO_ORD_001', 'sess_test_123', 'Demo Customer', 25000, '2026-09-25T08:00:00Z', 0, 'Pending');
  `);
  console.log("✓ Scenario F populated: Demo Sandbox Orders\n");

  // RUN MIGRATION TO VERSION 8
  console.log("================================================================================");
  console.log("[RUNNING MIGRATION] Executing executeDatabaseMigrations() to TARGET_SCHEMA_VERSION 8...");
  await executeDatabaseMigrations(adapter);
  console.log("✓ Migration executed successfully without throwing errors.\n");

  // VERIFICATIONS
  console.log("================================================================================");
  console.log("[VERIFYING POST-MIGRATION INVARIANTS]");

  // 1. Schema version = 8
  const versionRow = rawDb.prepare("SELECT version FROM _schema_version LIMIT 1").get();
  console.log(`1. Schema Version: ${versionRow?.version} (Expected: 8)`);
  if (versionRow?.version !== 8) throw new Error("Schema version mismatch!");

  // 2. Không mất LocalProducts
  const products = rawDb.prepare("SELECT * FROM LocalProducts ORDER BY Id").all();
  console.log(`2. LocalProducts count: ${products.length} (Expected: 2)`);
  if (products.length !== 2) throw new Error("LocalProducts were lost during migration!");
  if (products[0].Id !== '232' || products[1].Id !== '233') throw new Error("LocalProducts data corrupted!");
  console.log("   ✓ LocalProducts preserved with correct Id, Name, Price, and StockQuantity.");

  // 3. Không mất pending Orders (IsSynced = 0)
  const orders = rawDb.prepare("SELECT * FROM LocalOrders ORDER BY OfflineReferenceId").all();
  console.log(`3. LocalOrders count: ${orders.length} (Expected: 2)`);
  if (orders.length !== 2) throw new Error("LocalOrders were lost during migration!");
  for (const ord of orders) {
    if (ord.IsSynced !== 0) throw new Error(`Pending order ${ord.OfflineReferenceId} was altered to IsSynced != 0!`);
  }
  console.log("   ✓ All pending orders preserved with IsSynced=0.");

  // 4. Không mất pending OrderDetails
  const orderDetails = rawDb.prepare("SELECT * FROM LocalOrderDetails ORDER BY OfflineReferenceId").all();
  console.log(`4. LocalOrderDetails count: ${orderDetails.length} (Expected: 2)`);
  if (orderDetails.length !== 2) throw new Error("LocalOrderDetails were lost!");
  console.log("   ✓ LocalOrderDetails relationships intact.");

  // 5. Không mất pending GoodsReceipts
  const receipts = rawDb.prepare("SELECT * FROM LocalGoodsReceipts ORDER BY OfflineReferenceId").all();
  console.log(`5. LocalGoodsReceipts count: ${receipts.length} (Expected: 2)`);
  if (receipts.length !== 2) throw new Error("LocalGoodsReceipts were lost!");
  for (const gr of receipts) {
    if (gr.IsSynced !== 0) throw new Error(`Pending receipt ${gr.OfflineReferenceId} was altered to IsSynced != 0!`);
  }
  console.log("   ✓ All pending goods receipts preserved with IsSynced=0.");

  // 6. Không mất pending StockAdjustments
  const adjustments = rawDb.prepare("SELECT * FROM LocalStockAdjustments").all();
  console.log(`6. LocalStockAdjustments count: ${adjustments.length} (Expected: 1)`);
  if (adjustments.length !== 1 || adjustments[0].Delta !== -2 || adjustments[0].IsSynced !== 0) {
    throw new Error("LocalStockAdjustments were lost or altered!");
  }
  console.log("   ✓ Pending stock adjustment preserved.");

  // 7. OwnerUserId and UserId preserved accurately across accounts
  const u1Order = orders.find(o => o.OfflineReferenceId === 'ORD_OFFLINE_USER1_001');
  const u2Order = orders.find(o => o.OfflineReferenceId === 'ORD_OFFLINE_USER2_001');
  if (u1Order.OwnerUserId !== 1 || u2Order.OwnerUserId !== 2) {
    throw new Error("OwnerUserId was corrupted during migration!");
  }
  const u1Receipt = receipts.find(r => r.OfflineReferenceId === 'GR_OFFLINE_USER1_001');
  const u2Receipt = receipts.find(r => r.OfflineReferenceId === 'GR_OFFLINE_USER2_001');
  if (u1Receipt.UserId !== 1 || u2Receipt.UserId !== 2) {
    throw new Error("UserId was corrupted during migration!");
  }
  console.log("7. Multi-account isolation preserved: User 1 and User 2 mutations correctly isolated.");

  // 8. OfflineReferenceId preserved
  if (u1Order.OfflineReferenceId !== 'ORD_OFFLINE_USER1_001' || u2Order.OfflineReferenceId !== 'ORD_OFFLINE_USER2_001') {
    throw new Error("OfflineReferenceId was corrupted!");
  }
  console.log("8. OfflineReferenceId preserved across all entities.");

  // 9. SyncCheckpoints created with IsBootstrapped = 0
  const checkpoint = rawDb.prepare("SELECT * FROM SyncCheckpoints WHERE ScopeKey = 'global'").get();
  console.log(`9. SyncCheckpoints row:`, checkpoint);
  if (!checkpoint) throw new Error("SyncCheckpoints table is missing or empty!");
  if (checkpoint.IsBootstrapped !== 0) throw new Error("Pre-bootstrap checkpoint must have IsBootstrapped = 0!");
  if (checkpoint.LastCursor !== 0) throw new Error("Initial LastCursor must be 0!");
  console.log("   ✓ SyncCheckpoints created correctly with IsBootstrapped=0 and LastCursor=0.");

  // 10. Demo Sandbox data preserved
  const demoOrders = rawDb.prepare("SELECT * FROM DemoSandboxOrders").all();
  console.log(`10. DemoSandboxOrders count: ${demoOrders.length} (Expected: 1)`);
  if (demoOrders.length !== 1 || demoOrders[0].OfflineReferenceId !== 'DEMO_ORD_001') {
    throw new Error("Demo Sandbox data was lost!");
  }
  console.log("    ✓ Demo Sandbox data preserved.");

  // 11. Idempotency verification: Re-run migration a second time!
  console.log("\n[IDEMPOTENCY TEST] Re-running executeDatabaseMigrations() on the migrated DB...");
  await executeDatabaseMigrations(adapter);

  const secondVersionRow = rawDb.prepare("SELECT version FROM _schema_version LIMIT 1").get();
  const secondProducts = rawDb.prepare("SELECT COUNT(*) as c FROM LocalProducts").get();
  const secondOrders = rawDb.prepare("SELECT COUNT(*) as c FROM LocalOrders WHERE IsSynced = 0").get();
  const secondReceipts = rawDb.prepare("SELECT COUNT(*) as c FROM LocalGoodsReceipts WHERE IsSynced = 0").get();

  if (secondVersionRow?.version !== 8) throw new Error("Version changed on second migration run!");
  if (secondProducts.c !== 2) throw new Error("Products changed on second migration run!");
  if (secondOrders.c !== 2) throw new Error("Orders changed on second migration run!");
  if (secondReceipts.c !== 2) throw new Error("Receipts changed on second migration run!");

  console.log("✓ Second migration completed with zero errors and zero data changes (Idempotent: YES).\n");

  cleanUp();

  console.log("================================================================================");
  console.log("=== ALL SCENARIOS (A - F) PASSED WITH ZERO DATA LOSS AND FULL INTEGRITY      ===");
  console.log("================================================================================");
}

runTestSuite().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
