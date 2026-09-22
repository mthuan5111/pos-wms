import { create } from 'zustand';

export interface CacheInvalidationState {
  categoryVersion: number;
  productVersion: number;
  orderVersion: number;
  goodsReceiptVersion: number;
  supplierVersion: number;

  inventoryVersion: number;
  posVersion: number;
  dashboardVersion: number;

  invalidateCategory: () => void;
  invalidateProduct: () => void;
  invalidateOrder: () => void;
  invalidateGoodsReceipt: () => void;
  invalidateSupplier: () => void;
  invalidateInventory: () => void;
  invalidatePos: () => void;
  invalidateDashboard: () => void;
  invalidateAll: () => void;
}

export const useCacheInvalidationStore = create<CacheInvalidationState>((set) => ({
  categoryVersion: 0,
  productVersion: 0,
  orderVersion: 0,
  goodsReceiptVersion: 0,
  supplierVersion: 0,
  inventoryVersion: 0,
  posVersion: 0,
  dashboardVersion: 0,

  invalidateCategory: () => set((state) => ({ categoryVersion: state.categoryVersion + 1 })),
  invalidateProduct: () => set((state) => ({ productVersion: state.productVersion + 1 })),
  invalidateOrder: () => set((state) => ({ orderVersion: state.orderVersion + 1 })),
  invalidateGoodsReceipt: () => set((state) => ({ goodsReceiptVersion: state.goodsReceiptVersion + 1 })),
  invalidateSupplier: () => set((state) => ({ supplierVersion: state.supplierVersion + 1 })),
  invalidateInventory: () => set((state) => ({ inventoryVersion: state.inventoryVersion + 1 })),
  invalidatePos: () => set((state) => ({ posVersion: state.posVersion + 1 })),
  invalidateDashboard: () => set((state) => ({ dashboardVersion: state.dashboardVersion + 1 })),
  invalidateAll: () => set((state) => ({
    categoryVersion: state.categoryVersion + 1,
    productVersion: state.productVersion + 1,
    orderVersion: state.orderVersion + 1,
    goodsReceiptVersion: state.goodsReceiptVersion + 1,
    supplierVersion: state.supplierVersion + 1,
    inventoryVersion: state.inventoryVersion + 1,
    posVersion: state.posVersion + 1,
    dashboardVersion: state.dashboardVersion + 1
  })),
}));

if (__DEV__ && typeof window !== "undefined") {
  (window as any).__CACHE_STORE__ = useCacheInvalidationStore;
}
