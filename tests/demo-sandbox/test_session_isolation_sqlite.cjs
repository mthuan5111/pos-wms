// ==============================================================================
// POS-WMS DEMO SANDBOX SQLITE REPOSITORY-LEVEL INTEGRATION TEST
// Vị trí: tests/demo-sandbox/test_session_isolation_sqlite.cjs
//
// MÔ TẢ PHẠM VI XÁC MINH:
// - Đây là repository-level SQLite integration test chạy qua engine node:sqlite DatabaseSync.
// - Kiểm tra schema và câu lệnh SQL tương đương với mã ứng dụng tại thời điểm test.
// - Lưu ý giới hạn copy-drift: Schema và câu lệnh SQL trong test này được ánh xạ từ
//   frontend/src/database/schemaMigrations.ts và frontend/src/store/useDemoSandboxStore.ts.
// - GIỚI HẠN VÀ NHỮNG GÌ CHƯA CHỨNG MINH ĐƯỢC:
//   * KHÔNG chứng minh adapter expo-sqlite hoạt động.
//   * KHÔNG chứng minh Web OPFS (Origin Private File System) hoạt động trên trình duyệt thật.
//   * KHÔNG chứng minh useDemoSandboxStore đã thực sự chạy qua toàn bộ luồng UI.
//   * KHÔNG chứng minh OfflineSyncQueue runtime của ứng dụng đang chạy (chỉ chứng minh
//     rằng các câu lệnh SQL demo không chèn vào các bảng Local* trong database test).
// ==============================================================================

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.resolve(__dirname, 'sandbox_integration_test.sqlite');

// Dọn dẹp file test cũ nếu có
if (fs.existsSync(DB_FILE)) {
  try {
    fs.unlinkSync(DB_FILE);
  } catch {}
}

function initDatabaseSchema(db) {
  // 1. Tạo các bảng Local Production (base showcase data)
  db.exec(`
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
      IsSalePriceConfigured INTEGER DEFAULT 1
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
      Price REAL NOT NULL
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
      CostPrice REAL NOT NULL
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

  // 2. Tạo các bảng Demo Sandbox (theo schemaMigrations.ts)
  db.exec(`
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
  `);

  // Seed sample local production master data (to verify it never changes)
  db.prepare(`INSERT INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity) VALUES (?, ?, ?, ?, ?, ?)`).run('PROD-01', 1, 'Sữa tươi tiệt trùng Vinamilk 1L', 35000, '8934673123456', 50);
  db.prepare(`INSERT INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity) VALUES (?, ?, ?, ?, ?, ?)`).run('PROD-02', 1, 'Bánh mì sandwich Kinh Đô', 20000, '8934673654321', 30);

  // Seed sample local production completed order
  db.prepare(`INSERT INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, IsSynced, OwnerUserId, SyncStatus) VALUES (?, ?, ?, ?, 1, 1, 'Synced')`).run('ORD-REAL-001', 1, 35000, '2026-09-20T08:00:00Z');
}

function runIntegrationTests() {
  console.log('======================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ TÍCH HỢP TẦNG LƯU TRỮ SQLITE CHO DEMO SANDBOX');
  console.log(`Database SQLite: ${DB_FILE}`);
  console.log('======================================================================\n');

  let db = new DatabaseSync(DB_FILE);
  initDatabaseSchema(db);

  const baselineLocalProductsCount = db.prepare('SELECT COUNT(*) as c FROM LocalProducts').get().c;
  const baselineLocalOrdersCount = db.prepare('SELECT COUNT(*) as c FROM LocalOrders').get().c;

  console.log(`[INIT] Thiết lập schema và dữ liệu Local Production gốc.`);
  console.log(`  LocalProducts: ${baselineLocalProductsCount} | LocalOrders: ${baselineLocalOrdersCount}\n`);

  // ==========================================================================
  // KỊCH BẢN A: PHÂN TÁCH PHIÊN GIỮA SESSION A VÀ SESSION B
  // ==========================================================================
  console.log('----------------------------------------------------------------------');
  console.log('KỊCH BẢN A: PHÂN TÁCH PHIÊN (SESSION ISOLATION TRÊN SQLITE THẬT)');
  console.log('----------------------------------------------------------------------');

  const sessionA = 'DEMO-SES-AAA-111111';
  const sessionB = 'DEMO-SES-BBB-222222';
  const now = new Date().toISOString();

  // Hằng số UserId giả định dùng riêng cho môi trường SQLite test (không liên hệ với ID thật trong SQL Server)
  const TEST_DEMO_USER_ID = 900001;

  // 1. Tạo session records
  db.prepare('INSERT INTO DemoSandboxSessions (SessionId, CreatedAt, LastActivityAt) VALUES (?, ?, ?)').run(sessionA, now, now);
  db.prepare('INSERT INTO DemoSandboxSessions (SessionId, CreatedAt, LastActivityAt) VALUES (?, ?, ?)').run(sessionB, now, now);

  // 2. Session A tạo dữ liệu sandbox
  const orderA_Id = 'DEMO-ORDER-AAA-001';
  const shiftA_Code = 'DEMO-SHIFT-AAA-001';
  const grA_Id = 'DEMO-GR-AAA-001';
  const adjA_Id = 'DEMO-ADJ-AAA-001';

  db.prepare(`INSERT INTO DemoSandboxShifts (SessionId, ShiftCode, UserId, StartedAt, Status, StartingCash) VALUES (?, ?, ?, ?, 'Open', ?)`).run(sessionA, shiftA_Code, TEST_DEMO_USER_ID, now, 200000);
  db.prepare(`INSERT INTO DemoSandboxOrders (OfflineReferenceId, SessionId, CustomerName, TotalAmount, PaymentMethod, CreatedAt, IsSynced, SyncStatus, ShiftCode) VALUES (?, ?, ?, ?, 'CASH', ?, 0, 'Pending', ?)`).run(orderA_Id, sessionA, 'Khách hàng A', 70000, now, shiftA_Code);
  db.prepare(`INSERT INTO DemoSandboxOrderDetails (OfflineReferenceId, SessionId, ProductId, ProductName, Quantity, Price) VALUES (?, ?, ?, ?, ?, ?)`).run(orderA_Id, sessionA, 'PROD-01', 'Sữa tươi', 2, 35000);
  db.prepare(`INSERT INTO DemoSandboxGoodsReceipts (OfflineReferenceId, SessionId, SupplierId, SupplierName, TotalAmount, CreatedAt, Status, IsSynced, ShiftCode) VALUES (?, ?, 1, 'NCC Vinamilk', 150000, ?, 'Completed', 0, ?)`).run(grA_Id, sessionA, now, shiftA_Code);
  db.prepare(`INSERT INTO DemoSandboxGoodsReceiptDetails (OfflineReferenceId, SessionId, ProductId, ProductName, Quantity, MockCostPrice) VALUES (?, ?, 'PROD-01', 'Sữa tươi', 5, 30000)`).run(grA_Id, sessionA);
  db.prepare(`INSERT INTO DemoSandboxStockAdjustments (OfflineReferenceId, SessionId, ProductId, Delta, Reason, CreatedAt, BeforeQty, AfterQty) VALUES (?, ?, 'PROD-01', 3, 'Kiểm kê dư A', ?, 50, 53)`).run(adjA_Id, sessionA, now);

  // 3. Session B tạo bộ dữ liệu độc lập khác
  const orderB_Id = 'DEMO-ORDER-BBB-999';
  const shiftB_Code = 'DEMO-SHIFT-BBB-999';
  const grB_Id = 'DEMO-GR-BBB-999';
  const adjB_Id = 'DEMO-ADJ-BBB-999';

  db.prepare(`INSERT INTO DemoSandboxShifts (SessionId, ShiftCode, UserId, StartedAt, Status, StartingCash) VALUES (?, ?, ?, ?, 'Open', ?)`).run(sessionB, shiftB_Code, TEST_DEMO_USER_ID, now, 500000);
  db.prepare(`INSERT INTO DemoSandboxOrders (OfflineReferenceId, SessionId, CustomerName, TotalAmount, PaymentMethod, CreatedAt, IsSynced, SyncStatus, ShiftCode) VALUES (?, ?, ?, ?, 'QR', ?, 0, 'Pending', ?)`).run(orderB_Id, sessionB, 'Khách hàng B', 40000, now, shiftB_Code);
  db.prepare(`INSERT INTO DemoSandboxOrderDetails (OfflineReferenceId, SessionId, ProductId, ProductName, Quantity, Price) VALUES (?, ?, ?, ?, ?, ?)`).run(orderB_Id, sessionB, 'PROD-02', 'Bánh mì', 2, 20000);
  db.prepare(`INSERT INTO DemoSandboxGoodsReceipts (OfflineReferenceId, SessionId, SupplierId, SupplierName, TotalAmount, CreatedAt, Status, IsSynced, ShiftCode) VALUES (?, ?, 2, 'NCC Kinh Đô', 200000, ?, 'Completed', 0, ?)`).run(grB_Id, sessionB, now, shiftB_Code);
  db.prepare(`INSERT INTO DemoSandboxGoodsReceiptDetails (OfflineReferenceId, SessionId, ProductId, ProductName, Quantity, MockCostPrice) VALUES (?, ?, 'PROD-02', 'Bánh mì', 10, 20000)`).run(grB_Id, sessionB);
  db.prepare(`INSERT INTO DemoSandboxStockAdjustments (OfflineReferenceId, SessionId, ProductId, Delta, Reason, CreatedAt, BeforeQty, AfterQty) VALUES (?, ?, 'PROD-02', -1, 'Hư hỏng B', ?, 30, 29)`).run(adjB_Id, sessionB, now);

  // 4. Kiểm tra phân tách truy vấn theo SessionId
  const ordersQueryA = db.prepare('SELECT * FROM DemoSandboxOrders WHERE SessionId = ?').all(sessionA);
  const ordersQueryB = db.prepare('SELECT * FROM DemoSandboxOrders WHERE SessionId = ?').all(sessionB);

  const shiftsQueryA = db.prepare('SELECT * FROM DemoSandboxShifts WHERE SessionId = ?').all(sessionA);
  const shiftsQueryB = db.prepare('SELECT * FROM DemoSandboxShifts WHERE SessionId = ?').all(sessionB);

  const grQueryA = db.prepare('SELECT * FROM DemoSandboxGoodsReceipts WHERE SessionId = ?').all(sessionA);
  const grQueryB = db.prepare('SELECT * FROM DemoSandboxGoodsReceipts WHERE SessionId = ?').all(sessionB);

  const adjQueryA = db.prepare('SELECT * FROM DemoSandboxStockAdjustments WHERE SessionId = ?').all(sessionA);
  const adjQueryB = db.prepare('SELECT * FROM DemoSandboxStockAdjustments WHERE SessionId = ?').all(sessionB);

  const isCrossIsolated = (
    ordersQueryA.length === 1 && ordersQueryA[0].OfflineReferenceId === orderA_Id &&
    ordersQueryB.length === 1 && ordersQueryB[0].OfflineReferenceId === orderB_Id &&
    !ordersQueryA.some(o => o.OfflineReferenceId === orderB_Id) &&
    !ordersQueryB.some(o => o.OfflineReferenceId === orderA_Id) &&
    shiftsQueryA.length === 1 && shiftsQueryA[0].ShiftCode === shiftA_Code &&
    shiftsQueryB.length === 1 && shiftsQueryB[0].ShiftCode === shiftB_Code &&
    grQueryA.length === 1 && grQueryA[0].OfflineReferenceId === grA_Id &&
    grQueryB.length === 1 && grQueryB[0].OfflineReferenceId === grB_Id &&
    adjQueryA.length === 1 && adjQueryA[0].OfflineReferenceId === adjA_Id &&
    adjQueryB.length === 1 && adjQueryB[0].OfflineReferenceId === adjB_Id
  );

  console.log(`[ISOLATION CHECK] Query Session A chỉ thấy dữ liệu Session A: ${ordersQueryA.length === 1 && grQueryA.length === 1}`);
  console.log(`[ISOLATION CHECK] Query Session B chỉ thấy dữ liệu Session B: ${ordersQueryB.length === 1 && grQueryB.length === 1}`);
  console.log(`[ISOLATION RESULT] ${isCrossIsolated ? 'PASS_REPOSITORY_LEVEL: Đạt trong phạm vi repository-level SQLite test (không phát hiện dữ liệu chéo trong các truy vấn đã kiểm tra)' : 'FAIL: Bị rò rỉ dữ liệu chéo'}`);

  if (!isCrossIsolated) {
    throw new Error('Kịch bản A thất bại: dữ liệu giữa các session không độc lập!');
  }

  // ==========================================================================
  // KỊCH BẢN B: PERSISTENCE SAU KHI ĐÓNG/MỞ LẠI CONNECTION (MÔ PHỎNG RELOAD APP)
  // ==========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('KỊCH BẢN PERSISTENCE: ĐÓNG VÀ MỞ LẠI KẾT NỐI SQLITE (MÔ PHỎNG APP RELOAD)');
  console.log('----------------------------------------------------------------------');

  // Đóng kết nối hiện tại để mô phỏng tắt app hoặc reload trang
  db.close();
  console.log('[RELOAD SIMULATION] Đã đóng kết nối SQLite DatabaseSync.');

  // Mở lại kết nối từ cùng file SQLite DB
  db = new DatabaseSync(DB_FILE);
  console.log('[RELOAD SIMULATION] Đã mở lại kết nối SQLite DatabaseSync mới.');

  const reloadedOrdersA = db.prepare('SELECT * FROM DemoSandboxOrders WHERE SessionId = ?').all(sessionA);
  const reloadedOrdersB = db.prepare('SELECT * FROM DemoSandboxOrders WHERE SessionId = ?').all(sessionB);
  const reloadedShiftsA = db.prepare('SELECT * FROM DemoSandboxShifts WHERE SessionId = ?').all(sessionA);

  const isPersistenceValid = (
    reloadedOrdersA.length === 1 && reloadedOrdersA[0].OfflineReferenceId === orderA_Id &&
    reloadedOrdersB.length === 1 && reloadedOrdersB[0].OfflineReferenceId === orderB_Id &&
    reloadedShiftsA.length === 1 && reloadedShiftsA[0].ShiftCode === shiftA_Code
  );

  console.log(`[PERSISTENCE CHECK] Session A orders còn nguyên: ${reloadedOrdersA.length === 1}`);
  console.log(`[PERSISTENCE CHECK] Session B orders còn nguyên: ${reloadedOrdersB.length === 1}`);
  console.log(`[PERSISTENCE RESULT] ${isPersistenceValid ? 'PASS_REPOSITORY_LEVEL: Dữ liệu Sandbox tồn tại trong tệp SQLite sau khi reopen' : 'FAIL: Mất dữ liệu sau reload'}`);

  if (!isPersistenceValid) {
    throw new Error('Kịch bản Persistence thất bại!');
  }

  // ==========================================================================
  // KỊCH BẢN C: CÁCH LY HÀNG ĐỢI ĐỒNG BỘ (SYNC ISOLATION)
  // ==========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('KỊCH BẢN SYNC ISOLATION: XÁC MINH DEMO DATA KHÔNG LỌT VÀO QUEUE THẬT');
  console.log('----------------------------------------------------------------------');

  // Kiểm tra bảng Local production queue
  const localOrdersQueue = db.prepare('SELECT * FROM LocalOrders WHERE IsSynced = 0').all();
  const localReceiptsQueue = db.prepare('SELECT * FROM LocalGoodsReceipts WHERE IsSynced = 0').all();
  const localAdjustmentsQueue = db.prepare('SELECT * FROM LocalStockAdjustments WHERE IsSynced = 0').all();

  const isQueueClean = (
    localOrdersQueue.length === 0 &&
    localReceiptsQueue.length === 0 &&
    localAdjustmentsQueue.length === 0
  );

  console.log(`[QUEUE CHECK] LocalOrders (IsSynced=0): ${localOrdersQueue.length} (Kỳ vọng: 0)`);
  console.log(`[QUEUE CHECK] LocalGoodsReceipts (IsSynced=0): ${localReceiptsQueue.length} (Kỳ vọng: 0)`);
  console.log(`[QUEUE CHECK] LocalStockAdjustments (IsSynced=0): ${localAdjustmentsQueue.length} (Kỳ vọng: 0)`);

  // Mô phỏng đồng bộ của DemoUser: CHỈ UPDATE cờ IsSynced trong DemoSandboxOrders, KHÔNG gọi API backend
  db.prepare(`UPDATE DemoSandboxOrders SET IsSynced = 1, SyncStatus = 'Synced' WHERE SessionId = ?`).run(sessionA);
  db.prepare(`UPDATE DemoSandboxGoodsReceipts SET IsSynced = 1 WHERE SessionId = ?`).run(sessionA);

  const syncedSandboxOrders = db.prepare('SELECT IsSynced, SyncStatus FROM DemoSandboxOrders WHERE SessionId = ?').all(sessionA);
  const syncedSandboxReceipts = db.prepare('SELECT IsSynced FROM DemoSandboxGoodsReceipts WHERE SessionId = ?').all(sessionA);

  const isSimulationIsolated = (
    syncedSandboxOrders[0].IsSynced === 1 &&
    syncedSandboxOrders[0].SyncStatus === 'Synced' &&
    syncedSandboxReceipts[0].IsSynced === 1 &&
    db.prepare('SELECT COUNT(*) as c FROM LocalOrders').get().c === baselineLocalOrdersCount
  );

  console.log(`[SYNC SIMULATION] Cập nhật cờ IsSynced trong bảng DemoSandboxOrders: ${syncedSandboxOrders[0].IsSynced === 1}`);
  console.log(`[SYNC SIMULATION] Bảng LocalOrders trong database test không bị thêm dữ liệu: ${db.prepare('SELECT COUNT(*) as c FROM LocalOrders').get().c === baselineLocalOrdersCount}`);
  console.log(`[SYNC ISOLATION RESULT] ${isQueueClean && isSimulationIsolated ? 'PASS_REPOSITORY_LEVEL: Demo SQL không chèn vào các bảng Local* trong database test' : 'FAIL'}`);

  if (!isQueueClean || !isSimulationIsolated) {
    throw new Error('Kịch bản Sync Isolation thất bại!');
  }

  // ==========================================================================
  // KỊCH BẢN D: RESET MỘT SESSION AN TOÀN (CÓ WHERE SessionId = ?)
  // ==========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('KỊCH BẢN RESET: RESET SESSION A CHỈ XÓA SESSION A, GIỮ NGUYÊN SESSION B');
  console.log('----------------------------------------------------------------------');

  // Câu lệnh reset chính xác từ useDemoSandboxStore.ts (MỌI CÂU ĐỀU CÓ WHERE SessionId = ?)
  db.prepare('DELETE FROM DemoSandboxOrderDetails WHERE SessionId = ?').run(sessionA);
  db.prepare('DELETE FROM DemoSandboxOrders WHERE SessionId = ?').run(sessionA);
  db.prepare('DELETE FROM DemoSandboxShifts WHERE SessionId = ?').run(sessionA);
  db.prepare('DELETE FROM DemoSandboxGoodsReceiptDetails WHERE SessionId = ?').run(sessionA);
  db.prepare('DELETE FROM DemoSandboxGoodsReceipts WHERE SessionId = ?').run(sessionA);
  db.prepare('DELETE FROM DemoSandboxStockAdjustments WHERE SessionId = ?').run(sessionA);
  db.prepare('DELETE FROM DemoSandboxSessions WHERE SessionId = ?').run(sessionA);

  // Kiểm tra sau reset
  const remainingOrdersA = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxOrders WHERE SessionId = ?').get(sessionA).c;
  const remainingShiftsA = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxShifts WHERE SessionId = ?').get(sessionA).c;
  const remainingGrA = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxGoodsReceipts WHERE SessionId = ?').get(sessionA).c;
  const remainingAdjA = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxStockAdjustments WHERE SessionId = ?').get(sessionA).c;
  const remainingSessionsA = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxSessions WHERE SessionId = ?').get(sessionA).c;

  const remainingOrdersB = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxOrders WHERE SessionId = ?').get(sessionB).c;
  const remainingShiftsB = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxShifts WHERE SessionId = ?').get(sessionB).c;
  const remainingGrB = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxGoodsReceipts WHERE SessionId = ?').get(sessionB).c;
  const remainingAdjB = db.prepare('SELECT COUNT(*) as c FROM DemoSandboxStockAdjustments WHERE SessionId = ?').get(sessionB).c;

  const currentLocalProductsCount = db.prepare('SELECT COUNT(*) as c FROM LocalProducts').get().c;
  const currentLocalOrdersCount = db.prepare('SELECT COUNT(*) as c FROM LocalOrders').get().c;

  const isResetValid = (
    remainingOrdersA === 0 && remainingShiftsA === 0 && remainingGrA === 0 && remainingAdjA === 0 && remainingSessionsA === 0 &&
    remainingOrdersB === 1 && remainingShiftsB === 1 && remainingGrB === 1 && remainingAdjB === 1 &&
    currentLocalProductsCount === baselineLocalProductsCount &&
    currentLocalOrdersCount === baselineLocalOrdersCount
  );

  console.log(`[RESET CHECK] Session A dữ liệu bị xóa: orders=${remainingOrdersA}, shifts=${remainingShiftsA}, gr=${remainingGrA}`);
  console.log(`[RESET CHECK] Session B dữ liệu còn nguyên: orders=${remainingOrdersB}, shifts=${remainingShiftsB}, gr=${remainingGrB}`);
  console.log(`[RESET CHECK] LocalProducts base data không đổi: ${currentLocalProductsCount} == ${baselineLocalProductsCount}`);
  console.log(`[RESET CHECK] LocalOrders base data không đổi: ${currentLocalOrdersCount} == ${baselineLocalOrdersCount}`);
  console.log(`[RESET RESULT] ${isResetValid ? 'PASS_REPOSITORY_LEVEL: Reset Session A hoàn thành trong phạm vi câu lệnh test có WHERE SessionId' : 'FAIL'}`);

  if (!isResetValid) {
    throw new Error('Kịch bản Reset thất bại!');
  }

  db.close();

  // Dọn dẹp file test
  try {
    fs.unlinkSync(DB_FILE);
  } catch {}

  console.log('\n======================================================================');
  console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ TÍCH HỢP SQLITE (REPOSITORY LEVEL):');
  console.log('======================================================================');
  console.log('✓ Kịch bản A (Phân tách phiên giữa 2 sessions độc lập):       PASS_REPOSITORY_LEVEL');
  console.log('✓ Kịch bản Persistence (Tồn tại trong tệp SQLite sau reopen):  PASS_REPOSITORY_LEVEL');
  console.log('✓ Kịch bản Sync Isolation (Không chèn vào Local* test):       PASS_REPOSITORY_LEVEL');
  console.log('✓ Kịch bản Reset an toàn (Chỉ xóa session chỉ định):          PASS_REPOSITORY_LEVEL');
  console.log('======================================================================\n');
}

try {
  runIntegrationTests();
} catch (err) {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
}
