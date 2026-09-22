/**
 * Core pure calculation utilities for Inventory and POS.
 * Used by db.ts, CashierSettingsScreen.tsx, and regression tests.
 */

export function calculateEffectiveStock(
  serverStock: number,
  pendingInbound: number = 0,
  pendingOutbound: number = 0,
  pendingAdjustment: number = 0
): number {
  const pendingDelta = (pendingInbound || 0) - (pendingOutbound || 0) + (pendingAdjustment || 0);
  return Math.max(0, serverStock + pendingDelta);
}

export function calculateZReportRevenue(orders: Array<{ TotalAmount: number; PaymentMethod?: string }>) {
  let revenue = 0;
  let cash = 0;
  let qr = 0;

  orders.forEach(o => {
    revenue += o.TotalAmount;
    const pm = String(o.PaymentMethod || '').toUpperCase();
    if (pm.includes('QR')) {
      qr += o.TotalAmount;
    } else {
      cash += o.TotalAmount;
    }
  });

  return { revenue, cash, qr };
}
