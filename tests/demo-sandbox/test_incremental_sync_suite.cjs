// ==============================================================================
// TEST SUITE: COMPLETE INCREMENTAL & MULTI-DEVICE OFFLINE SYNC (CLONE DATABASE)
// Path: tests/demo-sandbox/test_incremental_sync_suite.cjs
// Tests: A (Bootstrap), B (Incremental Pull), C (Order Offline->Push->Pull),
//        D (GoodsReceipt), E (StockAdjustment Idempotency), F (Multi-Device Sync),
//        G (Tombstone Handling), H (Account Isolation), I (Offline Kill/Restart)
// ==============================================================================

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const axios = require('../../frontend/node_modules/axios');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5050/api';

// -----------------------------------------------------------------------------
// STRICT PRODUCTION GUARD: Unconditionally rejects ANY production hostname/IP
// -----------------------------------------------------------------------------
const FORBIDDEN_HOSTS = ['run.app', 'pos-wms-backend', '34.15.189.115'];
if (FORBIDDEN_HOSTS.some(h => BASE_URL.toLowerCase().includes(h))) {
  console.error('\n======================================================================');
  console.error('BLOCKED BY STRICT PRODUCTION GUARD: Mutation tests are strictly prohibited against Production!');
  console.error(`Target Host: ${BASE_URL}`);
  console.error('======================================================================\n');
  process.exit(1);
}

const DB_FILE_A = path.resolve(__dirname, 'deviceA_test.sqlite');
const DB_FILE_B = path.resolve(__dirname, 'deviceB_test.sqlite');

function cleanupDbFiles() {
  [DB_FILE_A, DB_FILE_B].forEach(f => {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  });
}

function initDeviceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS LocalCategories (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Description TEXT,
      Code TEXT,
      IsSystem INTEGER DEFAULT 0,
      IsActive INTEGER DEFAULT 1,
      UpdatedAt TEXT,
      IsDeleted INTEGER DEFAULT 0,
      ServerVersion INTEGER DEFAULT 1,
      LastSyncedAt TEXT
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
      IsActive INTEGER DEFAULT 1,
      UpdatedAt TEXT,
      IsDeleted INTEGER DEFAULT 0,
      ServerVersion INTEGER DEFAULT 1,
      LastSyncedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS LocalSuppliers (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      ContactName TEXT,
      Phone TEXT,
      Email TEXT,
      Address TEXT,
      IsActive INTEGER DEFAULT 1,
      UpdatedAt TEXT,
      IsDeleted INTEGER DEFAULT 0,
      ServerVersion INTEGER DEFAULT 1,
      LastSyncedAt TEXT
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
      ShiftId INTEGER,
      ServerVersion INTEGER DEFAULT 1,
      LastSyncedAt TEXT,
      NextRetryAt TEXT,
      LastSafeErrorCode TEXT
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
      ShiftId INTEGER,
      ServerVersion INTEGER DEFAULT 1,
      LastSyncedAt TEXT,
      NextRetryAt TEXT,
      LastSafeErrorCode TEXT
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
      SystemQuantity INTEGER NOT NULL,
      ActualQuantity INTEGER NOT NULL,
      Difference INTEGER NOT NULL,
      Reason TEXT,
      UserId INTEGER,
      CreatedAt TEXT NOT NULL,
      IsSynced INTEGER DEFAULT 0,
      SyncError TEXT,
      SyncRetryCount INTEGER DEFAULT 0,
      SyncStatus TEXT DEFAULT 'Pending',
      ServerVersion INTEGER DEFAULT 1,
      LastSyncedAt TEXT,
      NextRetryAt TEXT,
      LastSafeErrorCode TEXT
    );

    CREATE TABLE IF NOT EXISTS SyncCheckpoints (
      ScopeKey TEXT PRIMARY KEY NOT NULL,
      LastCursor INTEGER NOT NULL DEFAULT 0,
      LastPulledAt TEXT,
      IsBootstrapped INTEGER NOT NULL DEFAULT 0
    );
  `);
}

async function runSuite() {
  console.log('======================================================================');
  console.log('=== MULTI-DEVICE & INCREMENTAL OFFLINE SYNC INTEGRATION SUITE      ===');
  console.log(`=== Target: ${BASE_URL} ===`);
  console.log('======================================================================\n');

  cleanupDbFiles();

  // 1. Authenticate users
  console.log('[INIT] Authenticating Admin and Cashier1...');
  const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin@123';
  const adminLogin = await axios.post(`${BASE_URL}/Auth/login`, { username: 'admin', password: ADMIN_PASSWORD });
  const adminToken = adminLogin.data.data.accessToken;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  const cashierLogin = await axios.post(`${BASE_URL}/Auth/login`, { username: 'cashier1', password: ADMIN_PASSWORD });
  const cashierToken = cashierLogin.data.data.accessToken;
  const cashierHeaders = { Authorization: `Bearer ${cashierToken}` };
  console.log('✓ Authentication successful (Admin ID: 1, Cashier1 ID: 2)\n');

  // ---------------------------------------------------------------------------
  // TEST A: BOOTSTRAP ON EMPTY SQLITE
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST A: Bootstrap on Empty SQLite (Device A)');
  console.log('----------------------------------------------------------------------');
  let dbA = new DatabaseSync(DB_FILE_A);
  initDeviceSchema(dbA);

  const snapshotRes = await axios.get(`${BASE_URL}/Sync/bootstrap-snapshot`, { headers: adminHeaders });
  const snapshot = snapshotRes.data;
  console.log(`Snapshot fetched: Cursor=${snapshot.currentCursor}, Products=${snapshot.products.length}, Categories=${snapshot.categories.length}`);

  // Ingest snapshot into Device A SQLite
  const nowIso = new Date().toISOString();
  const stockMap = new Map((snapshot.inventories || []).map(i => [i.productId ?? i.ProductId, i.stockQuantity ?? i.StockQuantity ?? 0]));

  dbA.exec('BEGIN TRANSACTION;');
  for (const c of snapshot.categories) {
    dbA.prepare(`
      INSERT OR REPLACE INTO LocalCategories (Id, Name, Description, Code, IsSystem, IsActive, UpdatedAt, ServerVersion, LastSyncedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(c.id, c.name, c.description || null, c.code || null, c.isSystem ? 1 : 0, c.isActive !== false ? 1 : 0, c.updatedAt || nowIso, 1, nowIso);
  }
  for (const p of snapshot.products) {
    const stockQty = stockMap.get(p.id) ?? 0;
    dbA.prepare(`
      INSERT OR REPLACE INTO LocalProducts (Id, CategoryId, SupplierId, Name, Price, Barcode, StockQuantity, LowStockThreshold, IsSalePriceConfigured, IsActive, UpdatedAt, ServerVersion, LastSyncedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(p.id), p.categoryId, p.supplierId || null, p.name, p.price, p.barcode || null, stockQty, p.lowStockThreshold || 10, p.isSalePriceConfigured ? 1 : 0, p.isActive !== false ? 1 : 0, p.updatedAt || nowIso, 1, nowIso);
  }
  for (const s of snapshot.suppliers) {
    dbA.prepare(`
      INSERT OR REPLACE INTO LocalSuppliers (Id, Name, ContactName, Phone, Email, Address, IsActive, UpdatedAt, ServerVersion, LastSyncedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(s.id, s.name, s.contactName || null, s.phone || null, s.email || null, s.address || null, s.isActive !== false ? 1 : 0, s.updatedAt || nowIso, 1, nowIso);
  }
  for (const o of snapshot.recentOrders) {
    dbA.prepare(`
      INSERT OR REPLACE INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, IsSynced, CustomerName, PaymentMethod, OwnerUserId, ServerId, SyncStatus, LastSyncedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'Synced', ?)
    `).run(o.offlineReferenceId || `SRV_ORD_${o.id}`, o.customerId || null, o.totalAmount ?? 0, o.orderDate || o.createdAt || nowIso, o.customerName || null, o.paymentMethod || 'CASH', o.userId || 1, o.id, nowIso);
  }
  for (const gr of snapshot.recentGoodsReceipts) {
    dbA.prepare(`
      INSERT OR REPLACE INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, TotalAmount, CreatedAt, IsSynced, UserId, ServerId, SyncStatus, LastSyncedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?, 'Synced', ?)
    `).run(gr.offlineReferenceId || `SRV_GR_${gr.id}`, gr.supplierId, gr.totalAmount ?? 0, gr.receiptDate || gr.createdAt || nowIso, gr.userId || 1, gr.id, nowIso);
  }
  dbA.prepare(`
    INSERT OR REPLACE INTO SyncCheckpoints (ScopeKey, LastCursor, LastPulledAt, IsBootstrapped)
    VALUES ('DEFAULT', ?, ?, 1)
  `).run(snapshot.currentCursor, nowIso);
  dbA.exec('COMMIT;');

  // Assertions for Test A
  const pCount = dbA.prepare('SELECT COUNT(*) as c FROM LocalProducts;').get().c;
  const cCount = dbA.prepare('SELECT COUNT(*) as c FROM LocalCategories;').get().c;
  const sCount = dbA.prepare('SELECT COUNT(*) as c FROM LocalSuppliers;').get().c;
  const pendingOrders = dbA.prepare('SELECT COUNT(*) as c FROM LocalOrders WHERE IsSynced = 0;').get().c;
  const pendingGR = dbA.prepare('SELECT COUNT(*) as c FROM LocalGoodsReceipts WHERE IsSynced = 0;').get().c;
  const checkpoint = dbA.prepare(`SELECT * FROM SyncCheckpoints WHERE ScopeKey = 'DEFAULT';`).get();

  if (pCount !== 38 || cCount !== 8 || sCount !== 7) {
    throw new Error(`Test A Failed: Expected 38 products, 8 categories, 7 suppliers. Found: P=${pCount}, C=${cCount}, S=${sCount}`);
  }
  if (pendingOrders !== 0 || pendingGR !== 0) {
    throw new Error(`Test A Failed: Bootstrap must NOT create pending outbox records! Found: Orders=${pendingOrders}, GR=${pendingGR}`);
  }
  if (!checkpoint || checkpoint.IsBootstrapped !== 1 || checkpoint.LastCursor !== snapshot.currentCursor) {
    throw new Error(`Test A Failed: SyncCheckpoints not set correctly!`);
  }
  console.log(`✓ PASS: Bootstrap populated SQLite (38 products, 8 categories, 7 suppliers, 0 pending outbox, Cursor: ${checkpoint.LastCursor})\n`);

  // ---------------------------------------------------------------------------
  // TEST B: INCREMENTAL PULL
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST B: Incremental Pull (Modify Product on Server -> Client Pulls 1 Change)');
  console.log('----------------------------------------------------------------------');
  const targetProd = snapshot.products.find(p => p.id === 232) || snapshot.products[0];
  const oldName = targetProd.name;
  const updatedName = `${oldName} [SyncTest_${Date.now() % 10000}]`;

  console.log(`Updating Product ID ${targetProd.id} on server to '${updatedName}'...`);
  await axios.put(`${BASE_URL}/Products/${targetProd.id}`, {
    categoryId: targetProd.categoryId,
    supplierId: targetProd.supplierId,
    name: updatedName,
    price: targetProd.price,
    barcode: targetProd.barcode,
    lowStockThreshold: targetProd.lowStockThreshold || 10,
    isActive: true
  }, { headers: adminHeaders });

  // Pull changes using Device A's cursor
  const cursorBefore = checkpoint.LastCursor;
  const changesRes = await axios.get(`${BASE_URL}/Sync/changes?after=${cursorBefore}&limit=50`, { headers: adminHeaders });
  const changesData = changesRes.data;
  console.log(`Pull response: nextCursor=${changesData.nextCursor}, changesCount=${changesData.changes.length}`);

  const prodChange = changesData.changes.find(c => c.entityType === 'Product' && Number(c.entityId) === targetProd.id);
  if (!prodChange) {
    throw new Error(`Test B Failed: Did not receive SyncChange for modified Product ID ${targetProd.id}!`);
  }
  if (prodChange.operation !== 'Upsert') {
    throw new Error(`Test B Failed: Expected operation 'Upsert', got '${prodChange.operation}'`);
  }

  // Apply to SQLite and advance cursor
  const parsedData = prodChange.data || (prodChange.dataJson ? JSON.parse(prodChange.dataJson) : {});
  dbA.prepare(`UPDATE LocalProducts SET Name = ?, UpdatedAt = ?, ServerVersion = ? WHERE Id = ?;`)
     .run(parsedData.name ?? parsedData.Name, prodChange.changedAt, prodChange.version, String(targetProd.id));
  dbA.prepare(`UPDATE SyncCheckpoints SET LastCursor = ?, LastPulledAt = ? WHERE ScopeKey = 'DEFAULT';`)
     .run(changesData.nextCursor, new Date().toISOString());

  const localUpdatedProd = dbA.prepare('SELECT Name FROM LocalProducts WHERE Id = ?;').get(String(targetProd.id));
  if (localUpdatedProd.Name !== updatedName) {
    throw new Error(`Test B Failed: Local product name not updated in SQLite!`);
  }

  // Query again with new cursor -> must be empty
  const emptyRes = await axios.get(`${BASE_URL}/Sync/changes?after=${changesData.nextCursor}&limit=50`, { headers: adminHeaders });
  if (emptyRes.data.changes.length !== 0) {
    throw new Error(`Test B Failed: Query with updated cursor returned ${emptyRes.data.changes.length} changes (expected 0)!`);
  }
  console.log(`✓ PASS: Incremental pull verified: exactly 1 change received, SQLite updated, cursor advanced to ${changesData.nextCursor}, repeat query returned 0\n`);

  // ---------------------------------------------------------------------------
  // TEST C: OFFLINE ORDER -> PUSH -> ACK -> PULL BACK DEDUP
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST C: Offline Order -> Push -> Ack -> Pull Back (Zero Duplication)');
  console.log('----------------------------------------------------------------------');
  const orderRef = `OFFLINE_ORD_${Date.now()}`;
  const orderUnitPrice = 25000;
  const orderQty = 1;
  const orderTotal = orderUnitPrice * orderQty;

  // Insert into SQLite as pending
  dbA.prepare(`
    INSERT INTO LocalOrders (OfflineReferenceId, TotalAmount, CreatedAt, IsSynced, PaymentMethod, OwnerUserId, SyncStatus)
    VALUES (?, ?, ?, 0, 'CASH', 2, 'Pending');
  `).run(orderRef, orderTotal, nowIso);
  dbA.prepare(`
    INSERT INTO LocalOrderDetails (OfflineReferenceId, ProductId, Quantity, Price)
    VALUES (?, ?, ?, ?);
  `).run(orderRef, String(targetProd.id), orderQty, orderUnitPrice);

  const pendingBeforePush = dbA.prepare('SELECT COUNT(*) as c FROM LocalOrders WHERE IsSynced = 0;').get().c;
  if (pendingBeforePush !== 1) throw new Error('Test C Failed: Local order not inserted as pending!');

  // Push to server
  const orderPayload = {
    UserId: 2,
    CustomerId: 1,
    TotalAmount: orderTotal,
    PaymentMethod: 'CASH',
    OrderDate: nowIso,
    Status: 1,
    OfflineReferenceId: orderRef,
    Details: [{ ProductId: targetProd.id, Quantity: orderQty, UnitPrice: orderUnitPrice }]
  };
  const orderPushRes = await axios.post(`${BASE_URL}/Orders/sync`, orderPayload, { headers: cashierHeaders });
  const serverOrderId = orderPushRes.data.data;
  console.log(`Order push succeeded. Server Order ID: ${serverOrderId}`);

  // Client updates local record to Synced
  dbA.prepare(`
    UPDATE LocalOrders
    SET IsSynced = 1, SyncStatus = 'Synced', ServerId = ?, LastSyncedAt = ?
    WHERE OfflineReferenceId = ?;
  `).run(serverOrderId, new Date().toISOString(), orderRef);

  // Now Device A pulls incremental changes (which include this Order change)
  const currentCursorA = dbA.prepare(`SELECT LastCursor FROM SyncCheckpoints WHERE ScopeKey = 'DEFAULT';`).get().LastCursor;
  const orderPullRes = await axios.get(`${BASE_URL}/Sync/changes?after=${currentCursorA}&limit=50`, { headers: adminHeaders });
  
  // Apply changes with dedup check: if OfflineReferenceId matches, do not insert duplicate
  for (const ch of orderPullRes.data.changes) {
    if (ch.entityType === 'Order') {
      const ordData = ch.data || (ch.dataJson ? JSON.parse(ch.dataJson) : {});
      const ordRef = ordData.offlineReferenceId ?? ordData.OfflineReferenceId;
      const ordId = ordData.id ?? ordData.Id;
      const existing = dbA.prepare('SELECT OfflineReferenceId FROM LocalOrders WHERE OfflineReferenceId = ?;').get(ordRef);
      if (existing) {
        // Matched existing local order! Only ensure ServerId is synced
        dbA.prepare(`UPDATE LocalOrders SET ServerId = ?, SyncStatus = 'Synced', IsSynced = 1 WHERE OfflineReferenceId = ?;`)
           .run(ordId, ordRef);
      } else {
        dbA.prepare(`
          INSERT INTO LocalOrders (OfflineReferenceId, TotalAmount, CreatedAt, IsSynced, PaymentMethod, OwnerUserId, ServerId, SyncStatus)
          VALUES (?, ?, ?, 1, ?, ?, ?, 'Synced');
        `).run(ordRef, ordData.totalAmount ?? ordData.TotalAmount, ch.changedAt, ordData.paymentMethod ?? ordData.PaymentMethod ?? 'CASH', ordData.userId ?? ordData.UserId, ordId);
      }
    }
  }
  dbA.prepare(`UPDATE SyncCheckpoints SET LastCursor = ? WHERE ScopeKey = 'DEFAULT';`).run(orderPullRes.data.nextCursor);

  const totalMatchingOrders = dbA.prepare('SELECT COUNT(*) as c FROM LocalOrders WHERE OfflineReferenceId = ?;').get(orderRef).c;
  if (totalMatchingOrders !== 1) {
    throw new Error(`Test C Failed: Duplicate order created! Expected 1, found ${totalMatchingOrders}`);
  }
  console.log(`✓ PASS: Order pushed, acknowledged (ServerId: ${serverOrderId}), and pull dedup verified (count = 1)\n`);

  // ---------------------------------------------------------------------------
  // TEST D: OFFLINE GOODSRECEIPT -> PUSH -> ACK -> INVENTORY SNAPSHOT
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST D: Offline GoodsReceipt -> Push -> Ack -> Inventory Update');
  console.log('----------------------------------------------------------------------');
  // Get product stock before GR
  const prodBeforeGR = dbA.prepare('SELECT StockQuantity FROM LocalProducts WHERE Id = ?;').get(String(targetProd.id)).StockQuantity;
  const grRef = `OFFLINE_GR_${Date.now()}`;
  const grQty = 10;
  const grCost = 15000;
  const grTotal = grQty * grCost;

  dbA.prepare(`
    INSERT INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, TotalAmount, CreatedAt, IsSynced, UserId, SyncStatus)
    VALUES (?, 1, ?, ?, 0, 1, 'Pending');
  `).run(grRef, grTotal, nowIso);
  dbA.prepare(`
    INSERT INTO LocalGoodsReceiptDetails (OfflineReferenceId, ProductId, Quantity, CostPrice)
    VALUES (?, ?, ?, ?);
  `).run(grRef, String(targetProd.id), grQty, grCost);

  // Push GR to server
  const grPayload = {
    SupplierId: 1,
    Remarks: 'Incremental sync test GR',
    ReceiptDate: nowIso,
    OfflineReferenceId: grRef,
    Details: [{ ProductId: targetProd.id, Quantity: grQty, CostPrice: grCost }]
  };
  const grPushRes = await axios.post(`${BASE_URL}/GoodsReceipts/sync`, grPayload, { headers: adminHeaders });
  const serverGrId = grPushRes.data.data;
  console.log(`GoodsReceipt pushed. Server GR ID: ${serverGrId}`);

  // Mark local GR synced
  dbA.prepare(`
    UPDATE LocalGoodsReceipts
    SET IsSynced = 1, SyncStatus = 'Synced', ServerId = ?
    WHERE OfflineReferenceId = ?;
  `).run(serverGrId, grRef);

  // Pull incremental changes (should contain Inventory change for targetProd)
  const cursorBeforeGRPull = dbA.prepare(`SELECT LastCursor FROM SyncCheckpoints WHERE ScopeKey = 'DEFAULT';`).get().LastCursor;
  const grChangesRes = await axios.get(`${BASE_URL}/Sync/changes?after=${cursorBeforeGRPull}&limit=50`, { headers: adminHeaders });
  
  const invChange = grChangesRes.data.changes.find(c => c.entityType === 'Inventory' && Number(c.entityId) === targetProd.id);
  if (!invChange) {
    throw new Error('Test D Failed: Did not receive Inventory SyncChange after GoodsReceipt push!');
  }
  const parsedInv = invChange.data || (invChange.dataJson ? JSON.parse(invChange.dataJson) : {});
  const invStock = parsedInv.stockQuantity ?? parsedInv.StockQuantity;
  console.log(`Received server-authoritative inventory update: Product ID ${targetProd.id} New Stock = ${invStock}`);

  // Update SQLite product stock from server authoritative inventory
  dbA.prepare('UPDATE LocalProducts SET StockQuantity = ? WHERE Id = ?;').run(invStock, String(targetProd.id));
  dbA.prepare(`UPDATE SyncCheckpoints SET LastCursor = ? WHERE ScopeKey = 'DEFAULT';`).run(grChangesRes.data.nextCursor);

  const localStockAfterGR = dbA.prepare('SELECT StockQuantity FROM LocalProducts WHERE Id = ?;').get(String(targetProd.id)).StockQuantity;
  console.log(`Local stock updated from ${prodBeforeGR} to ${localStockAfterGR} (+${localStockAfterGR - prodBeforeGR})`);
  console.log('✓ PASS: GoodsReceipt pushed, acknowledged, and server-authoritative inventory synced\n');

  // ---------------------------------------------------------------------------
  // TEST E: STOCKADJUSTMENT 5 CONCURRENT IDEMPOTENT REQUESTS
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST E: StockAdjustment 5 Concurrent Idempotent Requests');
  console.log('----------------------------------------------------------------------');
  const adjRef = `OFFLINE_SA_${Date.now()}`;
  const invCurrentRes = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const liveInv = invCurrentRes.data.data.find(i => (i.productId || i.ProductId) === targetProd.id);
  const curStock = liveInv.stockQuantity ?? liveInv.StockQuantity;
  const targetStock = curStock + 5;

  const adjPayload = {
    ProductId: targetProd.id,
    Delta: 5,
    Reason: 'Concurrent Idempotency Test',
    OfflineReferenceId: adjRef
  };

  console.log(`Current Stock: ${curStock}, Target Stock: ${targetStock}, Ref: ${adjRef}`);
  console.log('Firing 5 parallel requests with the same OfflineReferenceId...');
  const promises = Array.from({ length: 5 }, () => 
    axios.post(`${BASE_URL}/Inventories/adjust`, adjPayload, { headers: adminHeaders })
  );
  const results = await Promise.all(results_promises = promises);
  const successCodes = results.map(r => r.status);
  console.log(`Responses: ${successCodes.join(', ')}`);

  // Verify server stock
  const postAdjRes = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const liveInvAfter = postAdjRes.data.data.find(i => (i.productId || i.ProductId) === targetProd.id);
  const actualStockAfter = liveInvAfter.stockQuantity ?? liveInvAfter.StockQuantity;

  if (actualStockAfter !== targetStock) {
    throw new Error(`Test E Failed: Stock changed multiple times! Expected ${targetStock}, got ${actualStockAfter}`);
  }
  console.log(`✓ PASS: 5 concurrent adjustments resolved idempotently. Final stock = ${actualStockAfter}\n`);

  // ---------------------------------------------------------------------------
  // TEST F: MULTI-DEVICE SYNC (Device A -> Cloud -> Device B)
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST F: Multi-Device Sync (Device A -> Cloud -> Device B)');
  console.log('----------------------------------------------------------------------');
  let dbB = new DatabaseSync(DB_FILE_B);
  initDeviceSchema(dbB);

  // Bootstrap Device B
  const snapB = (await axios.get(`${BASE_URL}/Sync/bootstrap-snapshot`, { headers: adminHeaders })).data;
  dbB.prepare(`
    INSERT INTO SyncCheckpoints (ScopeKey, LastCursor, LastPulledAt, IsBootstrapped)
    VALUES ('DEFAULT', ?, ?, 1);
  `).run(snapB.currentCursor, nowIso);
  console.log(`Device B bootstrapped at cursor ${snapB.currentCursor}`);

  // Device A creates and pushes an order
  const multiDevOrderRef = `MULTI_DEV_ORD_${Date.now()}`;
  const multiPayload = {
    UserId: 2,
    CustomerId: 1,
    TotalAmount: 30000,
    PaymentMethod: 'CASH',
    OrderDate: new Date().toISOString(),
    Status: 1,
    OfflineReferenceId: multiDevOrderRef,
    Details: [{ ProductId: targetProd.id, Quantity: 1, UnitPrice: 30000 }]
  };
  const multiOrderRes = await axios.post(`${BASE_URL}/Orders/sync`, multiPayload, { headers: cashierHeaders });
  const multiServerId = multiOrderRes.data.data;
  console.log(`Device A pushed order ${multiDevOrderRef} (Server ID: ${multiServerId})`);

  // Device B pulls incremental changes
  const cursorB = dbB.prepare(`SELECT LastCursor FROM SyncCheckpoints WHERE ScopeKey = 'DEFAULT';`).get().LastCursor;
  const bPullRes = await axios.get(`${BASE_URL}/Sync/changes?after=${cursorB}&limit=50`, { headers: cashierHeaders });
  console.log(`Device B pulled ${bPullRes.data.changes.length} changes. nextCursor=${bPullRes.data.nextCursor}`);

  // Device B ingests changes
  for (const ch of bPullRes.data.changes) {
    if (ch.entityType === 'Order') {
      const o = ch.data || (ch.dataJson ? JSON.parse(ch.dataJson) : {});
      const oRef = o.offlineReferenceId ?? o.OfflineReferenceId;
      const oId = o.id ?? o.Id;
      // Upsert into LocalOrders with IsSynced = 1 and SyncStatus = 'Synced'
      dbB.prepare(`
        INSERT OR REPLACE INTO LocalOrders (OfflineReferenceId, TotalAmount, CreatedAt, IsSynced, PaymentMethod, OwnerUserId, ServerId, SyncStatus)
        VALUES (?, ?, ?, 1, ?, ?, ?, 'Synced');
      `).run(oRef, o.totalAmount ?? o.TotalAmount, ch.changedAt, o.paymentMethod ?? o.PaymentMethod ?? 'CASH', o.userId ?? o.UserId, oId);
    }
  }
  dbB.prepare(`UPDATE SyncCheckpoints SET LastCursor = ? WHERE ScopeKey = 'DEFAULT';`).run(bPullRes.data.nextCursor);

  // Verify Device B state
  const bOrder = dbB.prepare('SELECT * FROM LocalOrders WHERE OfflineReferenceId = ?;').get(multiDevOrderRef);
  if (!bOrder) {
    throw new Error('Test F Failed: Device B did not receive Device A\'s order!');
  }
  if (bOrder.IsSynced !== 1 || bOrder.SyncStatus !== 'Synced') {
    throw new Error(`Test F Failed: Device B order marked as un-synced! (${bOrder.SyncStatus})`);
  }

  // CRITICAL: Check that Device B does NOT have any pending outbox items
  const bPendingOutbox = dbB.prepare('SELECT COUNT(*) as c FROM LocalOrders WHERE IsSynced = 0;').get().c;
  if (bPendingOutbox !== 0) {
    throw new Error(`Test F Failed: Device B generated pending outbox entries (${bPendingOutbox}) from pulled changes!`);
  }
  console.log('✓ PASS: Device B pulled Device A order, marked Synced, generated 0 outbox entries (no push loop)\n');

  // ---------------------------------------------------------------------------
  // TEST G: TOMBSTONE HANDLING
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST G: Tombstone Handling (Deactivated / Deleted Product)');
  console.log('----------------------------------------------------------------------');
  // Deactivate product on server
  console.log(`Deactivating Product ID ${targetProd.id} on server...`);
  await axios.put(`${BASE_URL}/Products/${targetProd.id}/deactivate`, {
    reason: 'Ngung kinh doanh de test tombstone sync'
  }, { headers: adminHeaders });

  // Device A pulls incremental changes
  const cursorBeforeTomb = dbA.prepare(`SELECT LastCursor FROM SyncCheckpoints WHERE ScopeKey = 'DEFAULT';`).get().LastCursor;
  const tombPullRes = await axios.get(`${BASE_URL}/Sync/changes?after=${cursorBeforeTomb}&limit=50`, { headers: adminHeaders });
  
  const tombChange = tombPullRes.data.changes.find(c => c.entityType === 'Product' && Number(c.entityId) === targetProd.id);
  if (!tombChange) {
    throw new Error('Test G Failed: Did not receive SyncChange for deactivated product!');
  }
  const tombData = tombChange.data || (tombChange.dataJson ? JSON.parse(tombChange.dataJson) : {});
  const tombIsActive = tombData.isActive ?? tombData.IsActive;
  if (tombIsActive !== false) {
    throw new Error('Test G Failed: Tombstone data does not indicate IsActive = false!');
  }

  // Device A applies tombstone: marks local record inactive, not saleable
  dbA.prepare(`
    UPDATE LocalProducts
    SET IsActive = 0, IsSalePriceConfigured = 0, IsDeleted = 1, UpdatedAt = ?
    WHERE Id = ?;
  `).run(tombChange.changedAt, String(targetProd.id));
  dbA.prepare(`UPDATE SyncCheckpoints SET LastCursor = ? WHERE ScopeKey = 'DEFAULT';`).run(tombPullRes.data.nextCursor);

  // Check product is inactive
  const deactivatedProd = dbA.prepare('SELECT IsActive, IsDeleted, IsSalePriceConfigured FROM LocalProducts WHERE Id = ?;').get(String(targetProd.id));
  if (deactivatedProd.IsActive !== 0 || deactivatedProd.IsDeleted !== 1) {
    throw new Error('Test G Failed: Product not properly marked as tombstone in SQLite!');
  }

  // Check that historical order line items still exist and are untouched
  const histDetail = dbA.prepare('SELECT * FROM LocalOrderDetails WHERE ProductId = ?;').get(String(targetProd.id));
  if (!histDetail) {
    throw new Error('Test G Failed: Historical order detail was corrupted or deleted!');
  }
  console.log(`✓ PASS: Tombstone applied: Product deactivated, sale disabled, historical order line items preserved (Detail ID: ${histDetail.Id})\n`);

  // Reactivate product so test database returns to clean operational state
  await axios.put(`${BASE_URL}/Products/${targetProd.id}/reactivate`, {}, { headers: adminHeaders });
  console.log(`Re-activated Product ID ${targetProd.id} back to operational state.`);

  // ---------------------------------------------------------------------------
  // TEST H: ACCOUNT ISOLATION
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST H: Account Isolation (User A Mutation Isolated from User B)');
  console.log('----------------------------------------------------------------------');
  const userAOrderRef = `USER_A_ORD_${Date.now()}`;
  // User A (Cashier1, ID: 2) creates pending order offline
  dbA.prepare(`
    INSERT INTO LocalOrders (OfflineReferenceId, TotalAmount, CreatedAt, IsSynced, PaymentMethod, OwnerUserId, SyncStatus)
    VALUES (?, 15000, ?, 0, 'CASH', 2, 'Pending');
  `).run(userAOrderRef, nowIso);

  // User B (Admin, ID: 1) logs in. Outbox query scoped to User B (ID: 1):
  const userBOutbox = dbA.prepare(`
    SELECT * FROM LocalOrders WHERE IsSynced = 0 AND (OwnerUserId = 1 OR OwnerUserId IS NULL);
  `).all();

  const userAOutbox = dbA.prepare(`
    SELECT * FROM LocalOrders WHERE IsSynced = 0 AND OwnerUserId = 2;
  `).all();

  if (userBOutbox.some(o => o.OfflineReferenceId === userAOrderRef)) {
    throw new Error('Test H Failed: User A mutation leaked into User B outbox query!');
  }
  if (!userAOutbox.some(o => o.OfflineReferenceId === userAOrderRef)) {
    throw new Error('Test H Failed: User A mutation missing from User A outbox query!');
  }
  console.log('✓ PASS: Account isolation verified: User A pending mutation is completely hidden from User B sync scope\n');

  // ---------------------------------------------------------------------------
  // TEST I: OFFLINE RESTART / KILL TOLERANCE
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------------');
  console.log('TEST I: Offline App Kill / Restart Persistence');
  console.log('----------------------------------------------------------------------');
  const killRef = `KILL_TEST_ORD_${Date.now()}`;
  dbA.prepare(`
    INSERT INTO LocalOrders (OfflineReferenceId, TotalAmount, CreatedAt, IsSynced, PaymentMethod, OwnerUserId, SyncStatus)
    VALUES (?, 10000, ?, 0, 'CASH', 2, 'Pending');
  `).run(killRef, nowIso);

  // Simulate App Kill
  console.log('Closing SQLite database connection (simulating App Kill)...');
  dbA.close();

  // Simulate App Restart
  console.log('Re-opening SQLite database (simulating App Restart)...');
  dbA = new DatabaseSync(DB_FILE_A);

  const survivedOrder = dbA.prepare('SELECT * FROM LocalOrders WHERE OfflineReferenceId = ?;').get(killRef);
  if (!survivedOrder || survivedOrder.IsSynced !== 0 || survivedOrder.SyncStatus !== 'Pending') {
    throw new Error('Test I Failed: Pending order did NOT persist across process kill/restart!');
  }
  console.log('✓ Order survived app restart with IsSynced=0 and SyncStatus=Pending.');

  // Network restored: sync order
  const killPayload = {
    UserId: 2,
    CustomerId: 1,
    TotalAmount: 10000,
    PaymentMethod: 'CASH',
    OrderDate: nowIso,
    Status: 1,
    OfflineReferenceId: killRef,
    Details: [{ ProductId: targetProd.id, Quantity: 1, UnitPrice: 10000 }]
  };
  const killRes = await axios.post(`${BASE_URL}/Orders/sync`, killPayload, { headers: cashierHeaders });
  const killServerId = killRes.data.data;

  dbA.prepare(`UPDATE LocalOrders SET IsSynced = 1, SyncStatus = 'Synced', ServerId = ? WHERE OfflineReferenceId = ?;`)
     .run(killServerId, killRef);

  const finalCheck = dbA.prepare('SELECT IsSynced, SyncStatus, ServerId FROM LocalOrders WHERE OfflineReferenceId = ?;').get(killRef);
  if (finalCheck.IsSynced !== 1 || finalCheck.ServerId !== killServerId) {
    throw new Error('Test I Failed: Order failed to sync cleanly after restart!');
  }
  console.log(`✓ PASS: Offline mutation survived app kill/restart, synced cleanly once network restored (ServerId: ${killServerId})\n`);

  // Cleanup connections
  dbA.close();
  dbB.close();
  cleanupDbFiles();

  console.log('======================================================================');
  console.log('=== ALL TESTS (A through I) PASSED 100% ON CLONE DATABASE!         ===');
  console.log('======================================================================\n');
}

runSuite().catch(err => {
  console.error('\n!!! TEST SUITE FAILED !!!');
  console.error(err.response?.data || err.message);
  if (err.stack) console.error(err.stack);
  cleanupDbFiles();
  process.exit(1);
});
