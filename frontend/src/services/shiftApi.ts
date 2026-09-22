import apiClient from "./apiClient";

export interface ShiftDto {
  id: number;
  userId: number;
  userName: string;
  role: string;
  startedAt: string;
  endedAt?: string | null;
  status: string;
  finalReportSnapshot?: string | null;
  closingRemarks?: string | null;
}

export interface ShiftReportDto {
  shiftId: number;
  userId: number;
  userName: string;
  role: string;
  startedAt: string;
  endedAt?: string | null;
  status: string;
  closingRemarks?: string | null;

  // Cashier
  orderCount: number;
  completedOrderCount: number;
  canceledOrderCount: number;
  cashRevenue: number;
  qrRevenue: number;
  totalRevenue: number;
  pendingSyncCount: number;

  // Warehouse
  receiptCount: number;
  totalReceiptAmount: number;
  receiptQuantityTotal: number;
  adjustmentIncreaseCount: number;
  adjustmentIncreaseQuantity: number;
  adjustmentDecreaseCount: number;
  adjustmentDecreaseQuantity: number;
}

export const shiftApi = {
  getCurrentShift: async (): Promise<ShiftDto | null> => {
    const res = await apiClient.get<any>("/shifts/current");
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data;
    }
    return res.data ?? null;
  },

  openShift: async (remarks?: string): Promise<ShiftDto> => {
    const res = await apiClient.post<any>("/shifts/open", { remarks });
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data;
    }
    return res.data;
  },

  getShiftPreview: async (shiftId: number): Promise<ShiftReportDto> => {
    const res = await apiClient.get<any>(`/shifts/${shiftId}/preview`);
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data;
    }
    return res.data;
  },

  endShift: async (shiftId: number, closingRemarks?: string): Promise<ShiftReportDto> => {
    const res = await apiClient.post<any>(`/shifts/${shiftId}/end`, { closingRemarks });
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data;
    }
    return res.data;
  },

  getShiftReport: async (shiftId: number): Promise<ShiftReportDto> => {
    const res = await apiClient.get<any>(`/shifts/${shiftId}/report`);
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data;
    }
    return res.data;
  },

  getShiftHistory: async (userId?: number, role?: string, page = 1, pageSize = 20): Promise<ShiftDto[]> => {
    const res = await apiClient.get<any>("/shifts/history", {
      params: { userId, role, page, pageSize }
    });
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data ?? [];
    }
    return res.data ?? [];
  }
};
