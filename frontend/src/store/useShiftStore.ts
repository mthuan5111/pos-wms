import { create } from "zustand";
import { shiftApi, ShiftDto, ShiftReportDto } from "../services/shiftApi";

interface ShiftState {
  currentShift: ShiftDto | null;
  loading: boolean;
  error: string | null;
  fetchCurrentShift: () => Promise<ShiftDto | null>;
  openShift: (remarks?: string) => Promise<ShiftDto>;
  endShift: (shiftId: number, remarks?: string) => Promise<ShiftReportDto>;
  getShiftPreview: (shiftId: number) => Promise<ShiftReportDto>;
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

  openShift: async (remarks?: string) => {
    set({ loading: true, error: null });
    try {
      const shift = await shiftApi.openShift(remarks);
      set({ currentShift: shift, loading: false });
      return shift;
    } catch (err: any) {
      set({ loading: false, error: err.message || "Lỗi mở ca" });
      throw err;
    }
  },

  endShift: async (shiftId: number, remarks?: string) => {
    set({ loading: true, error: null });
    try {
      const report = await shiftApi.endShift(shiftId, remarks);
      set({ currentShift: null, loading: false });
      return report;
    } catch (err: any) {
      set({ loading: false, error: err.message || "Lỗi kết thúc ca" });
      throw err;
    }
  },

  getShiftPreview: async (shiftId: number) => {
    return await shiftApi.getShiftPreview(shiftId);
  }
}));
