// ==============================================================================
// TEST SUITE: CURSOR ZERO, REQUIRES_BOOTSTRAP, AND AVAILABLE STOCK
// Path: tests/demo-sandbox/test_sync_cursor_bootstrap_stock.cjs
// ==============================================================================

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = path.resolve(__dirname, 'cursor_stock_test.sqlite');

function cleanUp() {
  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
  }
}

// Pure stock calculation logic matching frontend/src/utils/calculator.ts
function calculateEffectiveStock(serverStock, pendingInbound = 0, pendingOutbound = 0, pendingAdjustment = 0) {
  const pendingDelta = (pendingInbound || 0) - (pendingOutbound || 0) + (pendingAdjustment || 0);
  return Math.max(0, serverStock + pendingDelta);
}

function flattenParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

function createAdapter(db) {
  return {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      const flat = flattenParams(params);
      return stmt.run(...flat);
    },
    getAllAsync: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      const flat = flattenParams(params);
      return stmt.all(...flat);
    },
    getFirstAsync: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      const flat = flattenParams(params);
      return stmt.get(...flat) || null;
    }
  };
}

async function initSchema(rawDb) {
  rawDb.exec(`
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
      IsDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS LocalCategories (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      Name TEXT NOT NULL,
      Description TEXT,
      Code TEXT,
      IsSystem INTEGER DEFAULT 0,
      IsActive INTEGER DEFAULT 1,
      IsDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS LocalSuppliers (
      Id INTEGER PRIMARY KEY NOT NULL,
      Name TEXT NOT NULL,
      ContactPerson TEXT,
      Phone TEXT,
      Address TEXT,
      IsActive INTEGER DEFAULT 1,
      IsDeleted INTEGER DEFAULT 0
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
      NextRetryAt TEXT
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
      NextRetryAt TEXT
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
      ShiftId INTEGER,
      NextRetryAt TEXT
    );

    CREATE TABLE IF NOT EXISTS SyncCheckpoints (
      ScopeKey TEXT PRIMARY KEY,
      LastCursor INTEGER DEFAULT 0,
      LastPulledAt TEXT,
      IsBootstrapped INTEGER DEFAULT 0
    );
  `);
}

// Mirror applyBootstrapSnapshotAsync from frontend/src/database/db.ts
async function applyBootstrapSnapshotAsync(db, snap) {
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    // 1. Categories
    if (snap.categories?.length > 0) {
      for (const c of snap.categories) {
        const isTombstone = c.isActive === false || c.IsActive === false;
        if (isTombstone) {
          await db.runAsync("UPDATE LocalCategories SET IsActive = 0, IsDeleted = 1 WHERE Id = ?", [c.id || c.Id]);
        } else {
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalCategories (Id, Name, Description, Code, IsSystem, IsActive, IsDeleted) VALUES (?, ?, ?, ?, ?, 1, 0)",
            [c.id || c.Id, c.name || c.Name, c.description || c.Description || "", c.code || c.Code || null, c.isSystem || c.IsSystem ? 1 : 0]
          );
        }
      }
    }

    // 2. Suppliers
    if (snap.suppliers?.length > 0) {
      for (const s of snap.suppliers) {
        const isTombstone = s.isActive === false || s.IsActive === false;
        if (isTombstone) {
          await db.runAsync("UPDATE LocalSuppliers SET IsActive = 0, IsDeleted = 1 WHERE Id = ?", [s.id || s.Id]);
        } else {
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalSuppliers (Id, Name, ContactPerson, Phone, Address, IsActive, IsDeleted) VALUES (?, ?, ?, ?, ?, 1, 0)",
            [s.id || s.Id, s.name || s.Name, s.contactPerson || s.ContactPerson || "", s.phone || s.Phone || "", s.address || s.Address || ""]
          );
        }
      }
    }

    // 3. Pending movements map for stock calculation (preserve un-synced outbox)
    const pendingOrders = await db.getAllAsync(
      "SELECT OfflineReferenceId FROM LocalOrders WHERE IsSynced = 0"
    );
    const pendingOutboundMap = new Map();
    for (const order of pendingOrders) {
      const details = await db.getAllAsync(
        "SELECT ProductId, Quantity FROM LocalOrderDetails WHERE OfflineReferenceId = ?",
        [order.OfflineReferenceId]
      );
      for (const d of details) {
        pendingOutboundMap.set(String(d.ProductId), (pendingOutboundMap.get(String(d.ProductId)) || 0) + d.Quantity);
      }
    }

    const pendingReceipts = await db.getAllAsync(
      "SELECT OfflineReferenceId FROM LocalGoodsReceipts WHERE IsSynced = 0"
    );
    const pendingInboundMap = new Map();
    for (const rc of pendingReceipts) {
      const details = await db.getAllAsync(
        "SELECT ProductId, Quantity FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ?",
        [rc.OfflineReferenceId]
      );
      for (const d of details) {
        pendingInboundMap.set(String(d.ProductId), (pendingInboundMap.get(String(d.ProductId)) || 0) + d.Quantity);
      }
    }

    const pendingAdjustments = await db.getAllAsync(
      "SELECT ProductId, Delta FROM LocalStockAdjustments WHERE IsSynced = 0"
    );
    const pendingAdjustmentMap = new Map();
    for (const adj of pendingAdjustments) {
      pendingAdjustmentMap.set(String(adj.ProductId), (pendingAdjustmentMap.get(String(adj.ProductId)) || 0) + adj.Delta);
    }

    // 4. Products & Inventories
    const invMap = new Map();
    for (const inv of (snap.inventories || [])) {
      invMap.set(String(inv.productId || inv.ProductId), inv.stockQuantity ?? inv.StockQuantity ?? 0);
    }

    if (snap.products?.length > 0) {
      for (const p of snap.products) {
        const pIdStr = String(p.id || p.Id);
        const isTombstone = p.isActive === false || p.IsActive === false;
        if (isTombstone) {
          await db.runAsync(
            "UPDATE LocalProducts SET IsActive = 0, IsSalePriceConfigured = 0, IsDeleted = 1 WHERE Id = ?",
            [pIdStr]
          );
        } else {
          const serverStock = invMap.get(pIdStr) ?? 0;
          const effectiveStock = calculateEffectiveStock(
            serverStock,
            pendingInboundMap.get(pIdStr) || 0,
            pendingOutboundMap.get(pIdStr) || 0,
            pendingAdjustmentMap.get(pIdStr) || 0
          );
          const threshold = p.lowStockThreshold ?? p.LowStockThreshold ?? 10;
          const isConfigured = (p.isSalePriceConfigured !== false && p.IsSalePriceConfigured !== false) ? 1 : 0;
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalProducts (Id, CategoryId, SupplierId, Name, Price, Barcode, StockQuantity, ImageUrl, ImagePublicId, LowStockThreshold, IsSalePriceConfigured, IsActive, IsDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)",
            [
              pIdStr,
              p.categoryId || p.CategoryId || 1,
              p.supplierId || p.SupplierId || null,
              p.name || p.Name,
              p.price || p.Price || 0,
              p.barcode || p.Barcode || "",
              effectiveStock,
              p.imageUrl || p.ImageUrl || null,
              p.imagePublicId || p.ImagePublicId || null,
              threshold,
              isConfigured
            ]
          );
        }
      }
    }

    // 5. Recent Orders
    if (snap.recentOrders?.length > 0) {
      for (const o of snap.recentOrders) {
        const serverId = o.id || o.Id;
        const offlineRef = o.offlineReferenceId || o.OfflineReferenceId || `SERVER_${serverId}`;
        const exists = await db.getFirstAsync(
          "SELECT OfflineReferenceId FROM LocalOrders WHERE OfflineReferenceId = ? OR ServerId = ?",
          [offlineRef, serverId]
        );
        if (!exists) {
          await db.runAsync(
            "INSERT OR REPLACE INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, IsSynced, SyncStatus, ServerId, PaymentMethod, OwnerUserId, ShiftId) VALUES (?, ?, ?, ?, 1, 'Synced', ?, ?, ?, ?)",
            [
              offlineRef,
              o.customerId || o.CustomerId || 1,
              o.totalAmount || o.TotalAmount || 0,
              o.orderDate || o.OrderDate || new Date().toISOString(),
              serverId,
              o.paymentMethod || o.PaymentMethod || "CASH",
              o.userId || o.UserId || 0,
              o.shiftId || o.ShiftId || null
            ]
          );
        }
      }
    }

    // 6. Update checkpoint: IsBootstrapped = 1, LastCursor = snapshot.currentCursor
    const cursor = snap.currentCursor ?? snap.CurrentCursor ?? 0;
    await db.runAsync(
      "INSERT OR REPLACE INTO SyncCheckpoints (ScopeKey, LastCursor, LastPulledAt, IsBootstrapped) VALUES ('global', ?, ?, 1)",
      [cursor, new Date().toISOString()]
    );
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }
}

// Emulate pullIncrementalChangesAsync logic
async function pullIncrementalChangesMock(db, mockApiResponse) {
  const checkpoint = await db.getFirstAsync(
    "SELECT LastCursor, IsBootstrapped FROM SyncCheckpoints WHERE ScopeKey = 'global'"
  );
  const lastCursor = checkpoint?.LastCursor ?? 0;

  const data = mockApiResponse;
  const changes = data?.changes || data?.Changes || [];
  const nextCursor = data?.nextCursor ?? data?.NextCursor ?? lastCursor;
  const hasMore = !!(data?.hasMore ?? data?.HasMore);
  const requiresBootstrap = !!(data?.requiresBootstrap ?? data?.RequiresBootstrap);

  if (requiresBootstrap) {
    // Re-bootstrap triggered
    if (data.snapshot) {
      await applyBootstrapSnapshotAsync(db, data.snapshot);
    }
    return { appliedCount: 0, nextCursor: data?.snapshot?.currentCursor ?? nextCursor, hasMore: false, reBootstrapped: true };
  }

  if (changes.length === 0) {
    if (nextCursor > lastCursor) {
      await db.runAsync(
        "UPDATE SyncCheckpoints SET LastCursor = ?, LastPulledAt = ? WHERE ScopeKey = 'global'",
        [nextCursor, new Date().toISOString()]
      );
    }
    return { appliedCount: 0, nextCursor, hasMore: false, reBootstrapped: false };
  }

  // Apply changes
  for (const c of changes) {
    if (c.entityType === 'Inventory') {
      const pIdStr = String(c.data.productId);
      const serverStock = c.data.stockQuantity;

      // Pending outbox movements
      const pendingOrders = await db.getAllAsync("SELECT OfflineReferenceId FROM LocalOrders WHERE IsSynced = 0");
      let pendingOut = 0;
      for (const ord of pendingOrders) {
        const details = await db.getAllAsync("SELECT Quantity FROM LocalOrderDetails WHERE OfflineReferenceId = ? AND ProductId = ?", [ord.OfflineReferenceId, pIdStr]);
        for (const d of details) pendingOut += d.Quantity;
      }

      const pendingReceipts = await db.getAllAsync("SELECT OfflineReferenceId FROM LocalGoodsReceipts WHERE IsSynced = 0");
      let pendingIn = 0;
      for (const rc of pendingReceipts) {
        const details = await db.getAllAsync("SELECT Quantity FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ? AND ProductId = ?", [rc.OfflineReferenceId, pIdStr]);
        for (const d of details) pendingIn += d.Quantity;
      }

      const pendingAdjustments = await db.getAllAsync("SELECT Delta FROM LocalStockAdjustments WHERE IsSynced = 0 AND ProductId = ?", [pIdStr]);
      let pendingAdj = 0;
      for (const adj of pendingAdjustments) pendingAdj += adj.Delta;

      const effStock = calculateEffectiveStock(serverStock, pendingIn, pendingOut, pendingAdj);
      await db.runAsync("UPDATE LocalProducts SET StockQuantity = ? WHERE Id = ?", [effStock, pIdStr]);
    }
  }

  await db.runAsync(
    "UPDATE SyncCheckpoints SET LastCursor = ?, LastPulledAt = ? WHERE ScopeKey = 'global'",
    [nextCursor, new Date().toISOString()]
  );

  return { appliedCount: changes.length, nextCursor, hasMore, reBootstrapped: false };
}

async function runTests() {
  console.log("================================================================================");
  console.log("=== TEST SUITE: CURSOR ZERO, REQUIRES_BOOTSTRAP, AND AVAILABLE STOCK         ===");
  console.log("================================================================================\n");

  cleanUp();
  const rawDb = new DatabaseSync(TEST_DB_PATH);
  const adapter = createAdapter(rawDb);
  await initSchema(rawDb);

  // -------------------------------------------------------------------------
  // TEST 1: CURSOR 0 HANDLING (Production Valid State)
  // -------------------------------------------------------------------------
  console.log("--- TEST 1: Production Valid State with Cursor 0 ---");
  // Set IsBootstrapped = 1, LastCursor = 0
  await adapter.runAsync(
    "INSERT OR REPLACE INTO SyncCheckpoints (ScopeKey, LastCursor, LastPulledAt, IsBootstrapped) VALUES ('global', 0, ?, 1)",
    new Date().toISOString()
  );

  // When pullIncrementalChanges is called with cursor 0 and server returns changes: []
  const pullResult = await pullIncrementalChangesMock(adapter, {
    changes: [],
    nextCursor: 0,
    hasMore: false,
    requiresBootstrap: false
  });

  console.log("Pull result with cursor=0:", pullResult);
  if (pullResult.reBootstrapped) throw new Error("Cursor 0 triggered an unwanted re-bootstrap!");
  if (pullResult.appliedCount !== 0) throw new Error("Expected 0 changes applied!");

  const cpAfter = await adapter.getFirstAsync("SELECT * FROM SyncCheckpoints WHERE ScopeKey = 'global'");
  if (cpAfter.IsBootstrapped !== 1 || cpAfter.LastCursor !== 0) {
    throw new Error("Checkpoint state altered unexpectedly!");
  }
  console.log("✓ Test 1 Passed: Cursor 0 completes normally with zero loops and IsBootstrapped=1 maintained.\n");

  // -------------------------------------------------------------------------
  // TEST 2: REQUIRES_BOOTSTRAP HANDLING (Retention Gap Recovery)
  // -------------------------------------------------------------------------
  console.log("--- TEST 2: requiresBootstrap Handling Without Dropping Outbox ---");
  // Populate local product and a pending local order
  await adapter.runAsync(
    "INSERT INTO LocalProducts (Id, CategoryId, Name, Price, Barcode, StockQuantity) VALUES ('232', 1, 'Cà phê đen', 25000, 'CF01', 97)"
  );
  await adapter.runAsync(
    "INSERT INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, IsSynced, OwnerUserId) VALUES ('PENDING_ORD_101', 1, 50000, ?, 0, 1)",
    new Date().toISOString()
  );
  await adapter.runAsync(
    "INSERT INTO LocalOrderDetails (OfflineReferenceId, ProductId, Quantity, Price) VALUES ('PENDING_ORD_101', '232', 2, 25000)"
  );

  // Client has stale cursor (e.g. cursor = 5), server returns requiresBootstrap: true
  await adapter.runAsync("UPDATE SyncCheckpoints SET LastCursor = 5 WHERE ScopeKey = 'global'");

  const snapshotData = {
    currentCursor: 200,
    categories: [{ id: 1, name: 'Cà phê' }],
    suppliers: [{ id: 1, name: 'NCC Cà phê' }],
    products: [{ id: 232, categoryId: 1, name: 'Cà phê đen', price: 25000, barcode: 'CF01', lowStockThreshold: 10, isSalePriceConfigured: true, isActive: true }],
    inventories: [{ productId: 232, stockQuantity: 99 }], // server stock is 99
    recentOrders: []
  };

  const reqBootResult = await pullIncrementalChangesMock(adapter, {
    requiresBootstrap: true,
    minimumAvailableCursor: 100,
    changes: [],
    nextCursor: 200,
    hasMore: false,
    snapshot: snapshotData
  });

  console.log("requiresBootstrap handling result:", reqBootResult);
  if (!reqBootResult.reBootstrapped) throw new Error("Expected reBootstrapped = true!");
  if (reqBootResult.nextCursor !== 200) throw new Error("NextCursor must match snapshot currentCursor!");

  // Verify pending outbox is STRICTLY preserved!
  const pendingOrd = await adapter.getFirstAsync("SELECT * FROM LocalOrders WHERE OfflineReferenceId = 'PENDING_ORD_101'");
  if (!pendingOrd) throw new Error("CRITICAL FAILURE: Pending order was deleted during re-bootstrap!");
  if (pendingOrd.IsSynced !== 0) throw new Error("CRITICAL FAILURE: Pending order was marked as Synced prematurely!");

  // Verify effective stock: serverStock (99) - pendingOutbound (2) = 97!
  const prodAfterBoot = await adapter.getFirstAsync("SELECT StockQuantity FROM LocalProducts WHERE Id = '232'");
  console.log(`Product 232 Stock after re-bootstrap: ${prodAfterBoot.StockQuantity} (Expected: 97 = ServerStock 99 - PendingOutbound 2)`);
  if (prodAfterBoot.StockQuantity !== 97) throw new Error("Effective stock calculation failed on re-bootstrap!");

  const cpAfterReqBoot = await adapter.getFirstAsync("SELECT * FROM SyncCheckpoints WHERE ScopeKey = 'global'");
  if (cpAfterReqBoot.LastCursor !== 200 || cpAfterReqBoot.IsBootstrapped !== 1) {
    throw new Error("Checkpoint cursor was not advanced to 200!");
  }
  console.log("✓ Test 2 Passed: requiresBootstrap safely upserts master data, recalculates stock, and preserves outbox.\n");

  // -------------------------------------------------------------------------
  // TEST 3: LOCAL AVAILABLE STOCK FORMULA & INFLOW/OUTFLOW/ADJUSTMENT
  // -------------------------------------------------------------------------
  console.log("--- TEST 3: Local Available Stock Formula & Lifecycle ---");
  // Formula: AvailableStock = ServerStock + PendingInbound - PendingOutbound + PendingAdjustment

  // Case A: Create pending GoodsReceipt of +10
  await adapter.runAsync(
    "INSERT INTO LocalGoodsReceipts (OfflineReferenceId, SupplierId, TotalAmount, CreatedAt, IsSynced, UserId) VALUES ('PENDING_GR_201', 1, 200000, ?, 0, 1)",
    new Date().toISOString()
  );
  await adapter.runAsync(
    "INSERT INTO LocalGoodsReceiptDetails (OfflineReferenceId, ProductId, Quantity, CostPrice) VALUES ('PENDING_GR_201', '232', 10, 20000)"
  );

  // Case B: Create pending StockAdjustment of -1
  await adapter.runAsync(
    "INSERT INTO LocalStockAdjustments (OfflineReferenceId, ProductId, Delta, Reason, CreatedAt, UserId, IsSynced) VALUES ('PENDING_ADJ_301', '232', -1, 'Vỡ cốc', ?, 1, 0)",
    new Date().toISOString()
  );

  // At this moment:
  // ServerStock = 99
  // PendingInbound = +10 (PENDING_GR_201)
  // PendingOutbound = 2 (PENDING_ORD_101)
  // PendingAdjustment = -1 (PENDING_ADJ_301)
  // Expected AvailableStock = 99 + 10 - 2 - 1 = 106
  let eff = calculateEffectiveStock(99, 10, 2, -1);
  console.log(`Calculated Effective Stock: ${eff} (Expected: 106)`);
  if (eff !== 106) throw new Error("Stock formula calculation error!");

  // Step 2: Push Order succeeds -> IsSynced = 1
  await adapter.runAsync("UPDATE LocalOrders SET IsSynced = 1, SyncStatus = 'Synced' WHERE OfflineReferenceId = 'PENDING_ORD_101'");

  // Incremental pull arrives with server inventory update for Product 232: stockQuantity = 97 (99 - 2 processed on server)
  await pullIncrementalChangesMock(adapter, {
    changes: [{
      entityType: 'Inventory',
      operation: 'Update',
      data: { productId: 232, stockQuantity: 97 }
    }],
    nextCursor: 201,
    hasMore: false,
    requiresBootstrap: false
  });

  // Now:
  // ServerStock = 97
  // PendingInbound = +10
  // PendingOutbound = 0 (Order is now synced!)
  // PendingAdjustment = -1
  // Expected EffectiveStock = 97 + 10 - 0 - 1 = 106
  const prodAfterSync = await adapter.getFirstAsync("SELECT StockQuantity FROM LocalProducts WHERE Id = '232'");
  console.log(`Product 232 Stock after order sync & inventory pull: ${prodAfterSync.StockQuantity} (Expected: 106, NO double deduction!)`);
  if (prodAfterSync.StockQuantity !== 106) throw new Error("Double deduction occurred!");

  // Step 3: Push GoodsReceipt succeeds -> IsSynced = 1
  await adapter.runAsync("UPDATE LocalGoodsReceipts SET IsSynced = 1, SyncStatus = 'Synced' WHERE OfflineReferenceId = 'PENDING_GR_201'");

  // Incremental pull arrives with server inventory update: stockQuantity = 107 (97 + 10 processed on server)
  await pullIncrementalChangesMock(adapter, {
    changes: [{
      entityType: 'Inventory',
      operation: 'Update',
      data: { productId: 232, stockQuantity: 107 }
    }],
    nextCursor: 202,
    hasMore: false,
    requiresBootstrap: false
  });

  // Now:
  // ServerStock = 107
  // PendingInbound = 0 (Receipt is now synced!)
  // PendingOutbound = 0
  // PendingAdjustment = -1
  // Expected EffectiveStock = 107 - 1 = 106
  const prodAfterGR = await adapter.getFirstAsync("SELECT StockQuantity FROM LocalProducts WHERE Id = '232'");
  console.log(`Product 232 Stock after GR sync & inventory pull: ${prodAfterGR.StockQuantity} (Expected: 106, NO double addition!)`);
  if (prodAfterGR.StockQuantity !== 106) throw new Error("Double addition occurred!");

  // Step 4: Non-negative stock protection test
  const negativeStockCheck = calculateEffectiveStock(1, 0, 10, 0); // 1 - 10 = -9 -> clamped to 0
  console.log(`Non-negative clamp test: calculateEffectiveStock(1, 0, 10, 0) = ${negativeStockCheck} (Expected: 0)`);
  if (negativeStockCheck !== 0) throw new Error("Negative stock was not clamped to 0!");

  console.log("✓ Test 3 Passed: Stock lifecycle verifies exact math, no double deductions, and non-negative clamping.\n");

  cleanUp();
  console.log("================================================================================");
  console.log("=== ALL CURSOR, REQUIRES_BOOTSTRAP, AND STOCK INVARIANTS CONFIRMED           ===");
  console.log("================================================================================");
}

runTests().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
