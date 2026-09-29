import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getDBConnection } from '@/database/db';

const DEMO_SESSION_KEY = 'pos_wms_demo_session_id';
const DEMO_STEPS_KEY = 'pos_wms_demo_steps';

export interface DemoShiftInfo {
  shiftCode: string;
  startedAt: string;
  startingCash: number;
  status: 'Open' | 'Closed';
  orderCount: number;
  totalRevenue: number;
  cashRevenue: number;
  qrRevenue: number;
}

export interface DemoOrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface DemoOrderResult {
  offlineReferenceId: string;
  totalAmount: number;
  createdAt: string;
  customerName: string;
  paymentMethod: string;
  items: DemoOrderItem[];
}

interface DemoSandboxState {
  demoSessionId: string;
  activeShift: DemoShiftInfo | null;
  sandboxStockDeltas: Record<string, number>;
  pendingSyncCount: number;
  completedSteps: Record<string, boolean>;
  isGuideModalVisible: boolean;
  isResetModalVisible: boolean;
  isSimulatingSync: boolean;

  setGuideModalVisible: (visible: boolean) => void;
  setResetModalVisible: (visible: boolean) => void;
  markStepCompleted: (step: string) => Promise<void>;

  initSession: () => Promise<string>;
  resetSandbox: () => Promise<void>;
  openShift: (startingCash?: number) => Promise<DemoShiftInfo>;
  closeShift: (endingCash?: number, remarks?: string) => Promise<{
    shiftCode: string;
    startedAt: string;
    endedAt: string;
    startingCash: number;
    cashRevenue: number;
    qrRevenue: number;
    endingCash: number;
    expectedCash: number;
    difference: number;
    totalRevenue: number;
    orderCount: number;
  }>;
  createSandboxOrder: (order: {
    customerName: string;
    totalAmount: number;
    paymentMethod: string;
    items: DemoOrderItem[];
  }) => Promise<DemoOrderResult>;
  createSandboxGoodsReceipt: (receipt: {
    supplierId: number;
    supplierName: string;
    remarks?: string;
    items: Array<{ productId: string; name: string; quantity: number; mockCostPrice: number }>;
  }) => Promise<{ offlineReferenceId: string; totalAmount: number; totalQuantity: number }>;
  createSandboxStockAdjustment: (adj: {
    productId: string;
    delta: number;
    reason: string;
    beforeQty: number;
    afterQty: number;
  }) => Promise<{ offlineReferenceId: string }>;
  simulateSync: () => Promise<void>;
  getEffectiveStock: (productId: string, baseStock: number) => number;
  getSandboxOrders: () => Promise<any[]>;
}

const getStoredItem = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const setStoredItem = async (key: string, value: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {}
};

const removeStoredItem = async (key: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {}
};

export const useDemoSandboxStore = create<DemoSandboxState>((set, get) => ({
  demoSessionId: '',
  activeShift: null,
  sandboxStockDeltas: {},
  pendingSyncCount: 0,
  completedSteps: {},
  isGuideModalVisible: false,
  isResetModalVisible: false,
  isSimulatingSync: false,

  setGuideModalVisible: (visible) => set({ isGuideModalVisible: visible }),
  setResetModalVisible: (visible) => set({ isResetModalVisible: visible }),

  markStepCompleted: async (step: string) => {
    const current = { ...get().completedSteps, [step]: true };
    set({ completedSteps: current });
    await setStoredItem(DEMO_STEPS_KEY, JSON.stringify(current));
  },

  initSession: async () => {
    let sessionId = await getStoredItem(DEMO_SESSION_KEY);
    if (!sessionId) {
      sessionId = `DEMO-SES-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await setStoredItem(DEMO_SESSION_KEY, sessionId);
    }

    let steps: Record<string, boolean> = {};
    const stepsStr = await getStoredItem(DEMO_STEPS_KEY);
    if (stepsStr) {
      try {
        steps = JSON.parse(stepsStr);
      } catch {}
    }

    set({ demoSessionId: sessionId, completedSteps: steps });

    // Load active sandbox shift and pending sync count from SQLite
    try {
      const db = await getDBConnection();

      // Ensure session record exists
      const existingSes = await db.getFirstAsync<{ SessionId: string }>(
        'SELECT SessionId FROM DemoSandboxSessions WHERE SessionId = ?',
        [sessionId]
      );
      if (!existingSes) {
        const now = new Date().toISOString();
        await db.runAsync(
          'INSERT INTO DemoSandboxSessions (SessionId, CreatedAt, LastActivityAt) VALUES (?, ?, ?)',
          [sessionId, now, now]
        );
      } else {
        await db.runAsync(
          'UPDATE DemoSandboxSessions SET LastActivityAt = ? WHERE SessionId = ?',
          [new Date().toISOString(), sessionId]
        );
      }

      // Query active shift for this session
      const activeShiftRow = await db.getFirstAsync<any>(
        "SELECT * FROM DemoSandboxShifts WHERE SessionId = ? AND Status = 'Open' ORDER BY Id DESC LIMIT 1",
        [sessionId]
      );

      let shiftInfo: DemoShiftInfo | null = null;
      if (activeShiftRow) {
        // Compute revenue and order count for this shift
        const shiftOrders = await db.getAllAsync<any>(
          'SELECT TotalAmount, PaymentMethod FROM DemoSandboxOrders WHERE SessionId = ? AND ShiftCode = ?',
          [sessionId, activeShiftRow.ShiftCode]
        );
        let rev = 0;
        let cashRev = 0;
        let qrRev = 0;
        shiftOrders.forEach(o => {
          rev += Number(o.TotalAmount || 0);
          if (String(o.PaymentMethod).toUpperCase().includes('QR')) {
            qrRev += Number(o.TotalAmount || 0);
          } else {
            cashRev += Number(o.TotalAmount || 0);
          }
        });
        shiftInfo = {
          shiftCode: activeShiftRow.ShiftCode,
          startedAt: activeShiftRow.StartedAt,
          startingCash: Number(activeShiftRow.StartingCash || 0),
          status: 'Open',
          orderCount: shiftOrders.length,
          totalRevenue: rev,
          cashRevenue: cashRev,
          qrRevenue: qrRev,
        };
      }

      // Query pending sync count (unsynced sandbox orders and receipts)
      const unsyncedOrders = await db.getAllAsync<any>(
        'SELECT OfflineReferenceId FROM DemoSandboxOrders WHERE SessionId = ? AND IsSynced = 0',
        [sessionId]
      );
      const unsyncedReceipts = await db.getAllAsync<any>(
        'SELECT OfflineReferenceId FROM DemoSandboxGoodsReceipts WHERE SessionId = ? AND IsSynced = 0',
        [sessionId]
      );

      // Reconstruct sandbox stock deltas from sandbox orders, receipts, adjustments
      const stockDeltas: Record<string, number> = {};
      const orderDetails = await db.getAllAsync<{ ProductId: string; Quantity: number }>(
        'SELECT ProductId, Quantity FROM DemoSandboxOrderDetails WHERE SessionId = ?',
        [sessionId]
      );
      orderDetails.forEach(od => {
        stockDeltas[od.ProductId] = (stockDeltas[od.ProductId] || 0) - Number(od.Quantity || 0);
      });

      const receiptDetails = await db.getAllAsync<{ ProductId: string; Quantity: number }>(
        'SELECT ProductId, Quantity FROM DemoSandboxGoodsReceiptDetails WHERE SessionId = ?',
        [sessionId]
      );
      receiptDetails.forEach(rd => {
        stockDeltas[rd.ProductId] = (stockDeltas[rd.ProductId] || 0) + Number(rd.Quantity || 0);
      });

      const adjustments = await db.getAllAsync<{ ProductId: string; Delta: number }>(
        'SELECT ProductId, Delta FROM DemoSandboxStockAdjustments WHERE SessionId = ?',
        [sessionId]
      );
      adjustments.forEach(ad => {
        stockDeltas[ad.ProductId] = (stockDeltas[ad.ProductId] || 0) + Number(ad.Delta || 0);
      });

      set({
        activeShift: shiftInfo,
        pendingSyncCount: unsyncedOrders.length + unsyncedReceipts.length,
        sandboxStockDeltas: stockDeltas,
      });
    } catch (e) {
      console.warn('[DemoSandboxStore] Init session warning:', e);
    }

    return sessionId;
  },

  resetSandbox: async () => {
    const sessionId = get().demoSessionId;
    if (sessionId) {
      try {
        const db = await getDBConnection();
        await db.runAsync('DELETE FROM DemoSandboxOrderDetails WHERE SessionId = ?', [sessionId]);
        await db.runAsync('DELETE FROM DemoSandboxOrders WHERE SessionId = ?', [sessionId]);
        await db.runAsync('DELETE FROM DemoSandboxShifts WHERE SessionId = ?', [sessionId]);
        await db.runAsync('DELETE FROM DemoSandboxGoodsReceiptDetails WHERE SessionId = ?', [sessionId]);
        await db.runAsync('DELETE FROM DemoSandboxGoodsReceipts WHERE SessionId = ?', [sessionId]);
        await db.runAsync('DELETE FROM DemoSandboxStockAdjustments WHERE SessionId = ?', [sessionId]);
        await db.runAsync('DELETE FROM DemoSandboxSessions WHERE SessionId = ?', [sessionId]);
      } catch (e) {
        console.error('[DemoSandboxStore] Error clearing sandbox SQLite tables:', e);
      }
    }

    // Generate fresh session ID
    const newSessionId = `DEMO-SES-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await setStoredItem(DEMO_SESSION_KEY, newSessionId);
    await removeStoredItem(DEMO_STEPS_KEY);

    set({
      demoSessionId: newSessionId,
      activeShift: null,
      sandboxStockDeltas: {},
      pendingSyncCount: 0,
      completedSteps: {},
      isResetModalVisible: false,
    });
  },

  openShift: async (startingCash: number = 0) => {
    let sessionId = get().demoSessionId;
    if (!sessionId) {
      sessionId = await get().initSession();
    }
    const shiftCode = `DEMO-SHIFT-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const db = await getDBConnection();

    await db.runAsync(
      `INSERT INTO DemoSandboxShifts (SessionId, ShiftCode, UserId, StartedAt, Status, StartingCash) VALUES (?, ?, ?, ?, 'Open', ?)`,
      [sessionId, shiftCode, 5, startedAt, startingCash]
    );

    const shiftInfo: DemoShiftInfo = {
      shiftCode,
      startedAt,
      startingCash,
      status: 'Open',
      orderCount: 0,
      totalRevenue: 0,
      cashRevenue: 0,
      qrRevenue: 0,
    };

    set({ activeShift: shiftInfo });
    await get().markStepCompleted('shift');
    return shiftInfo;
  },

  closeShift: async (endingCash: number = 0, remarks?: string) => {
    const shift = get().activeShift;
    const sessionId = get().demoSessionId;
    if (!shift || !sessionId) {
      throw new Error('Không có ca làm việc trải nghiệm đang mở.');
    }

    const db = await getDBConnection();
    const endedAt = new Date().toISOString();
    const expectedCash = shift.startingCash + shift.cashRevenue;
    const difference = endingCash - expectedCash;

    const summarySnapshot = JSON.stringify({
      orderCount: shift.orderCount,
      totalRevenue: shift.totalRevenue,
      cashRevenue: shift.cashRevenue,
      qrRevenue: shift.qrRevenue,
      startingCash: shift.startingCash,
      endingCash,
      expectedCash,
      difference,
      endedAt,
      remarks,
    });

    await db.runAsync(
      `UPDATE DemoSandboxShifts 
       SET EndedAt = ?, Status = 'Closed', EndingCash = ?, ExpectedCash = ?, Difference = ?, SummarySnapshot = ?, Remarks = ?
       WHERE SessionId = ? AND ShiftCode = ?`,
      [endedAt, endingCash, expectedCash, difference, summarySnapshot, remarks || '', sessionId, shift.shiftCode]
    );

    set({ activeShift: null });
    await get().markStepCompleted('shift');

    return {
      shiftCode: shift.shiftCode,
      startedAt: shift.startedAt,
      endedAt,
      startingCash: shift.startingCash,
      cashRevenue: shift.cashRevenue,
      qrRevenue: shift.qrRevenue,
      endingCash,
      expectedCash,
      difference,
      totalRevenue: shift.totalRevenue,
      orderCount: shift.orderCount,
    };
  },

  createSandboxOrder: async (order) => {
    let sessionId = get().demoSessionId;
    if (!sessionId) {
      sessionId = await get().initSession();
    }

    const shift = get().activeShift;
    if (!shift || shift.status !== 'Open') {
      const err: any = new Error('Bạn chưa mở ca làm việc. Vui lòng mở ca trước khi thực hiện thanh toán.');
      err.code = 'SHIFT_NOT_OPEN';
      throw err;
    }

    const offlineReferenceId = `DEMO-ORDER-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const shiftCode = shift.shiftCode;

    const db = await getDBConnection();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO DemoSandboxOrders (OfflineReferenceId, SessionId, CustomerName, TotalAmount, PaymentMethod, CreatedAt, IsSynced, SyncStatus, ShiftCode)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', ?)`,
        [offlineReferenceId, sessionId, order.customerName, order.totalAmount, order.paymentMethod, createdAt, shiftCode]
      );

      for (const item of order.items) {
        await db.runAsync(
          `INSERT INTO DemoSandboxOrderDetails (OfflineReferenceId, SessionId, ProductId, ProductName, Quantity, Price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [offlineReferenceId, sessionId, item.productId, item.name, item.quantity, item.price]
        );
      }
    });

    // Update stock deltas
    const currentDeltas = { ...get().sandboxStockDeltas };
    for (const item of order.items) {
      currentDeltas[item.productId] = (currentDeltas[item.productId] || 0) - item.quantity;
    }

    // Update active shift stats if open
    let updatedShift = shift;
    if (shift) {
      const isQr = String(order.paymentMethod).toUpperCase().includes('QR');
      updatedShift = {
        ...shift,
        orderCount: shift.orderCount + 1,
        totalRevenue: shift.totalRevenue + order.totalAmount,
        cashRevenue: isQr ? shift.cashRevenue : shift.cashRevenue + order.totalAmount,
        qrRevenue: isQr ? shift.qrRevenue + order.totalAmount : shift.qrRevenue,
      };
    }

    set({
      sandboxStockDeltas: currentDeltas,
      activeShift: updatedShift,
      pendingSyncCount: get().pendingSyncCount + 1,
    });

    await get().markStepCompleted('pos');
    await get().markStepCompleted('invoice');

    return {
      offlineReferenceId,
      totalAmount: order.totalAmount,
      createdAt,
      customerName: order.customerName,
      paymentMethod: order.paymentMethod,
      items: order.items,
    };
  },

  createSandboxGoodsReceipt: async (receipt) => {
    let sessionId = get().demoSessionId;
    if (!sessionId) {
      sessionId = await get().initSession();
    }

    const offlineReferenceId = `DEMO-GR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    let totalAmt = 0;
    let totalQty = 0;

    receipt.items.forEach(i => {
      totalAmt += i.quantity * i.mockCostPrice;
      totalQty += i.quantity;
    });

    const shift = get().activeShift;
    const shiftCode = shift?.shiftCode || null;

    const db = await getDBConnection();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO DemoSandboxGoodsReceipts (OfflineReferenceId, SessionId, SupplierId, SupplierName, TotalAmount, Remarks, CreatedAt, Status, IsSynced, ShiftCode)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed', 0, ?)`,
        [offlineReferenceId, sessionId, receipt.supplierId, receipt.supplierName, totalAmt, receipt.remarks || '', createdAt, shiftCode]
      );

      for (const item of receipt.items) {
        await db.runAsync(
          `INSERT INTO DemoSandboxGoodsReceiptDetails (OfflineReferenceId, SessionId, ProductId, ProductName, Quantity, MockCostPrice)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [offlineReferenceId, sessionId, item.productId, item.name, item.quantity, item.mockCostPrice]
        );
      }
    });

    // Update stock deltas
    const currentDeltas = { ...get().sandboxStockDeltas };
    for (const item of receipt.items) {
      currentDeltas[item.productId] = (currentDeltas[item.productId] || 0) + item.quantity;
    }

    set({
      sandboxStockDeltas: currentDeltas,
      pendingSyncCount: get().pendingSyncCount + 1,
    });

    await get().markStepCompleted('receipt');

    return {
      offlineReferenceId,
      totalAmount: totalAmt,
      totalQuantity: totalQty,
    };
  },

  createSandboxStockAdjustment: async (adj) => {
    let sessionId = get().demoSessionId;
    if (!sessionId) {
      sessionId = await get().initSession();
    }

    const offlineReferenceId = `DEMO-ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const createdAt = new Date().toISOString();

    const db = await getDBConnection();
    await db.runAsync(
      `INSERT INTO DemoSandboxStockAdjustments (OfflineReferenceId, SessionId, ProductId, Delta, Reason, CreatedAt, BeforeQty, AfterQty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [offlineReferenceId, sessionId, adj.productId, adj.delta, adj.reason, createdAt, adj.beforeQty, adj.afterQty]
    );

    const currentDeltas = { ...get().sandboxStockDeltas };
    currentDeltas[adj.productId] = (currentDeltas[adj.productId] || 0) + adj.delta;

    set({ sandboxStockDeltas: currentDeltas });
    await get().markStepCompleted('adjust');

    return { offlineReferenceId };
  },

  simulateSync: async () => {
    const sessionId = get().demoSessionId;
    if (!sessionId) return;

    set({ isSimulatingSync: true });
    // Simulate network delay
    await new Promise(r => setTimeout(r, 600));

    try {
      const db = await getDBConnection();
      await db.runAsync(
        "UPDATE DemoSandboxOrders SET IsSynced = 1, SyncStatus = 'Synced' WHERE SessionId = ?",
        [sessionId]
      );
      await db.runAsync(
        "UPDATE DemoSandboxGoodsReceipts SET IsSynced = 1 WHERE SessionId = ?",
        [sessionId]
      );
      set({ pendingSyncCount: 0 });
      await get().markStepCompleted('offline');
    } finally {
      set({ isSimulatingSync: false });
    }
  },

  getEffectiveStock: (productId: string, baseStock: number) => {
    const delta = get().sandboxStockDeltas[productId] || 0;
    return Math.max(0, baseStock + delta);
  },

  getSandboxOrders: async () => {
    const sessionId = get().demoSessionId;
    if (!sessionId) return [];
    try {
      const db = await getDBConnection();
      return await db.getAllAsync<any>(
        'SELECT * FROM DemoSandboxOrders WHERE SessionId = ? ORDER BY CreatedAt DESC',
        [sessionId]
      );
    } catch {
      return [];
    }
  },
}));
