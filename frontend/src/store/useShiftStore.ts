import { create } from "zustand";
import { shiftApi, ShiftDto, ShiftReportDto } from "../services/shiftApi";

interface ShiftState {
  currentShift: ShiftDto | null;
  loading: boolean;
  error: string | null;
  fetchCurrentShift: () => Promise<ShiftDto | null>;
  openShift: (openingCash?: number, remarks?: string) => Promise<ShiftDto>;
  endShift: (shiftId: number, actualCash?: number, remarks?: string) => Promise<ShiftReportDto>;
  forceCloseShift: (shiftId: number, reason: string) => Promise<ShiftReportDto>;
  getShiftPreview: (shiftId: number) => Promise<ShiftReportDto>;
  clearCurrentShift: () => void;
}

export const useShiftStore = create<ShiftState>((set) => ({
  currentShift: null,
  loading: false,
  error: null,

  fetchCurrentShift: async () => {
    set({ loading: true, error: null });
    try {
      const shift = await shiftApi.getCurrentShift();
      set({ currentShift: shift, loading: false });
      return shift;
    } catch (err: any) {
      set({ loading: false, error: err.message || "Lỗi tải ca làm việc" });
      return null;
    }
  },

  openShift: async (openingCash?: number, remarks?: string) => {
    set({ loading: true, error: null });
    try {
      const shift = await shiftApi.openShift(openingCash, remarks);
      set({ currentShift: shift, loading: false });
      return shift;
    } catch (err: any) {
      set({ loading: false, error: err.message || "Lỗi mở ca" });
      throw err;
    }
  },

  endShift: async (shiftId: number, actualCash?: number, remarks?: string) => {
    set({ loading: true, error: null });
    try {
      const report = await shiftApi.endShift(shiftId, actualCash, remarks);
      set({ currentShift: null, loading: false });
      return report;
    } catch (err: any) {
      set({ loading: false, error: err.message || "Lỗi kết thúc ca" });
      throw err;
    }
  },

  forceCloseShift: async (shiftId: number, reason: string) => {
    set({ loading: true, error: null });
    try {
      const report = await shiftApi.forceCloseShift(shiftId, reason);
      set({ currentShift: null, loading: false });
      return report;
    } catch (err: any) {
      set({ loading: false, error: err.message || "Lỗi cưỡng chế kết thúc ca" });
      throw err;
    }
  },

  getShiftPreview: async (shiftId: number) => {
    return await shiftApi.getShiftPreview(shiftId);
  },

  clearCurrentShift: () => {
    set({ currentShift: null, error: null });
  }
}));
