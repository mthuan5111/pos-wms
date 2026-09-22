import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDBConnection, getLocalOrders, getUnsyncedOrders, LocalOrderRow } from '@/database/db';
import { calculateZReportRevenue } from '@/utils/calculator';
import { formatVietnamDateTime } from '@/utils/timezone';
import { useModalStore } from '@/store/useModalStore';
import { useShiftStore } from '@/store/useShiftStore';
import { ShiftReportDto } from '@/services/shiftApi';
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';
import { generateShiftReportHtml } from '@/utils/printTemplates';
import { printDocument } from '@/utils/printService';

export default function StatisticsScreen() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role || 'Cashier';
  const { showModal } = useModalStore();
  const {
    currentShift,
    fetchCurrentShift,
    openShift,
    endShift,
    getShiftPreview,
    loading: shiftLoading
  } = useShiftStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showShiftSummaryModal, setShowShiftSummaryModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reportData, setReportData] = useState<ShiftReportDto | null>(null);

  const isShiftActionRef = useRef(false);

  // Cashier stats
  const [cashierOrders, setCashierOrders] = useState<LocalOrderRow[]>([]);
  const [cashierStats, setCashierStats] = useState({
    totalRevenue: 0,
    orderCount: 0,
    cashAmount: 0,
    qrAmount: 0,
    canceledCount: 0,
    unsyncedCount: 0,
  });

  // Warehouse stats
  const [warehouseStats, setWarehouseStats] = useState({
    receiptCount: 0,
    totalReceiptValue: 0,
    totalQty: 0,
    adjustmentCount: 0,
    totalQtyIncrease: 0,
    totalQtyDecrease: 0,
    unsyncedReceipts: 0,
  });

  // Admin/Manager filter
  const [filterRole, setFilterRole] = useState<'all' | 'cashier' | 'warehouse'>('all');

  const formatCurrency = (val: number) => (val || 0).toLocaleString('vi-VN') + ' đ';

  const loadData = async () => {
    setIsLoading(true);
    try {
      const activeShift = await fetchCurrentShift();
      const shiftStartTime = activeShift?.startedAt ? new Date(activeShift.startedAt).getTime() : 0;
      const activeShiftId = activeShift?.id || (activeShift as any)?.Id;

      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const utcToday = now.toISOString().split('T')[0];
      const db = await getDBConnection();

      if (role === 'Cashier' || role === 'Admin' || role === 'Manager') {
        const allOrders = await getLocalOrders();
        const userOrders = allOrders.filter(o => {
          const matchUser = role === 'Cashier' ? (o.OwnerUserId === user?.id || !o.OwnerUserId) : true;
          if (!matchUser) return false;
          // In active shift, match shift id or orders created after shift started
          if (activeShiftId) {
            if (o.ShiftId && Number(o.ShiftId) === Number(activeShiftId)) return true;
            if (shiftStartTime > 0 && new Date(o.CreatedAt).getTime() >= shiftStartTime) return true;
          }
          // Match local today or UTC today
          return o.CreatedAt.startsWith(localToday) || o.CreatedAt.startsWith(utcToday);
        });

        const unsynced = await getUnsyncedOrders(user?.id || 0);
        const { revenue, cash, qr } = calculateZReportRevenue(userOrders);

        setCashierOrders(userOrders);
        setCashierStats({
          totalRevenue: revenue,
          orderCount: userOrders.length,
          cashAmount: cash,
          qrAmount: qr,
          canceledCount: 0,
          unsyncedCount: unsynced.length,
        });
      }

      if (role === 'WarehouseStaff' || role === 'Admin' || role === 'Manager') {
        let receipts: any[] = [];
        if (role === 'WarehouseStaff') {
          receipts = await db.getAllAsync<any>(
            "SELECT * FROM LocalGoodsReceipts WHERE (UserId = ? OR UserId IS NULL) AND (CreatedAt LIKE ? OR CreatedAt LIKE ?)",
            [user?.id || 0, `${localToday}%`, `${utcToday}%`]
          );
        } else {
          receipts = await db.getAllAsync<any>(
            "SELECT * FROM LocalGoodsReceipts WHERE CreatedAt LIKE ? OR CreatedAt LIKE ?",
            [`${localToday}%`, `${utcToday}%`]
          );
        }

        const totalVal = receipts.reduce((sum, r) => sum + (r.TotalAmount || 0), 0);
        const unsyncedR = receipts.filter(r => r.IsSynced === 0).length;

        let adjustments: any[] = [];
        try {
          adjustments = await db.getAllAsync<any>(
            "SELECT * FROM LocalStockAdjustments WHERE CreatedAt LIKE ? OR CreatedAt LIKE ?",
            [`${localToday}%`, `${utcToday}%`]
          );
        } catch {}

        let inc = 0;
        let dec = 0;
        adjustments.forEach(a => {
          if (a.Delta > 0) inc += a.Delta;
          else if (a.Delta < 0) dec += Math.abs(a.Delta);
        });

        setWarehouseStats({
          receiptCount: receipts.length,
          totalReceiptValue: totalVal,
          totalQty: receipts.reduce((sum, r) => sum + (r.TotalQuantity || 0), 0),
          adjustmentCount: adjustments.length,
          totalQtyIncrease: inc,
          totalQtyDecrease: dec,
          unsyncedReceipts: unsyncedR,
        });
      }
    } catch (e) {
      console.warn('[StatisticsScreen] Error loading statistics:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [role, user])
  );

  const handleOpenShift = async () => {
    if (isShiftActionRef.current) return;
    isShiftActionRef.current = true;
    try {
      setIsLoading(true);
      await openShift();
      setShowOpenShiftModal(false);
      showModal({
        title: 'Mở ca thành công',
        message: 'Ca làm việc mới đã được bắt đầu.',
        type: 'success'
      });
      await loadData();
    } catch (err: any) {
      showModal({
        title: 'Lỗi mở ca',
        message: err.response?.data?.message || err.message || 'Không thể mở ca làm việc.',
        type: 'error'
      });
    } finally {
      isShiftActionRef.current = false;
      setIsLoading(false);
    }
  };

  const hasActiveShift = Boolean(currentShift && (currentShift.id || (currentShift as any)?.Id));
  const shiftId = currentShift?.id || (currentShift as any)?.Id;

  const handleStartEndShiftFlow = async () => {
    if (!hasActiveShift) {
      showModal({
        title: 'Thông báo',
        message: 'Hiện không có ca làm việc nào đang mở.',
        type: 'info'
      });
      return;
    }

    try {
      setIsLoading(true);
      // Fetch reconciled server preview
      let preview: ShiftReportDto;
      try {
        preview = await getShiftPreview(shiftId);
      } catch {
        // Fallback to local stats if offline
        preview = {
          shiftId: shiftId,
          userId: user?.id || 0,
          userName: user?.name || user?.username || '',
          role: role,
          startedAt: currentShift?.startedAt || new Date().toISOString(),
          status: 'Open',
          orderCount: cashierStats.orderCount,
          completedOrderCount: cashierStats.orderCount,
          canceledOrderCount: cashierStats.canceledCount,
          cashRevenue: cashierStats.cashAmount,
          qrRevenue: cashierStats.qrAmount,
          totalRevenue: cashierStats.totalRevenue,
          pendingSyncCount: cashierStats.unsyncedCount,
          receiptCount: warehouseStats.receiptCount,
          totalReceiptAmount: warehouseStats.totalReceiptValue,
          receiptQuantityTotal: warehouseStats.totalQty,
          adjustmentIncreaseCount: 0,
          adjustmentIncreaseQuantity: warehouseStats.totalQtyIncrease,
          adjustmentDecreaseCount: 0,
          adjustmentDecreaseQuantity: warehouseStats.totalQtyDecrease,
        };
      }
      setReportData(preview);
      setShowShiftSummaryModal(true);
    } catch (err: any) {
      showModal({
        title: 'Lỗi tải báo cáo',
        message: err.message || 'Không thể lấy bản xem trước báo cáo.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmEndShift = async () => {
    if (isShiftActionRef.current || !hasActiveShift) return;
    isShiftActionRef.current = true;
    setShowShiftSummaryModal(false);

    try {
      setIsLoading(true);
      // Pre-sync pending local orders so server backend has all shift orders before locking snapshot
      try {
        await useGlobalSyncStore.getState().syncNow('pre-shift-close');
      } catch (syncErr) {
        console.warn('[StatisticsScreen] Pre-close sync warning:', syncErr);
      }

      const closedReport = await endShift(shiftId);
      setReportData(closedReport);

      showModal({
        title: 'Đã kết thúc ca làm việc.',
        message: 'Ca làm việc đã được đóng và khóa snapshot thành công.',
        type: 'success'
      });

      // Immediately open print preview modal
      setShowPrintModal(true);
      await loadData();
    } catch (err: any) {
      showModal({
        title: 'Lỗi kết thúc ca',
        message: err.response?.data?.message || err.message || 'Không thể kết thúc ca làm việc.',
        type: 'error'
      });
    } finally {
      isShiftActionRef.current = false;
      setIsLoading(false);
    }
  };

  const handlePrintReport = async () => {
    if (!reportData) return;
    const htmlContent = generateShiftReportHtml({
      shiftId: reportData.shiftId,
      userName: reportData.userName || user?.name || user?.username || 'Nhân viên',
      role: reportData.role,
      startedAt: reportData.startedAt,
      endedAt: reportData.endedAt || new Date().toISOString(),
      status: reportData.status,
      orderCount: reportData.orderCount || 0,
      completedOrderCount: reportData.completedOrderCount || reportData.orderCount || 0,
      canceledOrderCount: reportData.canceledOrderCount || 0,
      cashRevenue: reportData.cashRevenue || 0,
      qrRevenue: reportData.qrRevenue || 0,
      totalRevenue: reportData.totalRevenue || 0,
      pendingSyncCount: reportData.pendingSyncCount || 0,
      receiptCount: reportData.receiptCount || 0,
      totalReceiptAmount: reportData.totalReceiptAmount || 0,
      receiptQuantityTotal: reportData.receiptQuantityTotal || 0,
      adjustmentIncreaseQuantity: reportData.adjustmentIncreaseQuantity || 0,
      adjustmentDecreaseQuantity: reportData.adjustmentDecreaseQuantity || 0,
      notes: reportData.closingRemarks || undefined,
    }, { paperSize: '80mm' });

    try {
      await printDocument(htmlContent, `BaoCaoCa_${reportData.shiftId}`);
    } catch (err: any) {
      console.warn('[StatisticsScreen] Print report error:', err);
      showModal({ title: 'Thông báo', message: 'Không thể in báo cáo ca: ' + (err.message || ''), type: 'info' });
    }
  };

  return (
    <SafeAreaView testID="statistics-screen" className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-5 pb-4 bg-white border-b-4 border-black">
        <Text style={{ fontFamily: 'serif', fontSize: 32, fontWeight: '900', color: '#000', letterSpacing: -1, textTransform: 'uppercase' }}>
          THỐNG KÊ
        </Text>
        <Text className="mt-1" style={{ fontSize: 11, letterSpacing: 3, color: '#525252', textTransform: 'uppercase' }}>
          {role === 'Cashier' ? 'Báo cáo thu ngân' : role === 'WarehouseStaff' ? 'Báo cáo kho' : 'Báo cáo tổng hợp'}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4 sm:px-6 pt-4"
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* SHIFT STATUS BANNER */}
        <View className="border-2 border-black p-5 mb-6 bg-white">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="font-black text-black uppercase tracking-widest text-xs">
              Ca làm việc {role === 'Cashier' ? 'thu ngân' : role === 'WarehouseStaff' ? 'thủ kho' : 'quản lý'}
            </Text>
            <View className={`px-2 py-0.5 border ${hasActiveShift ? 'bg-green-100 border-green-600' : 'bg-yellow-100 border-yellow-600'}`}>
              <Text className={`text-[10px] font-bold ${hasActiveShift ? 'text-green-800' : 'text-yellow-800'}`}>
                {hasActiveShift ? `ĐANG TRONG CA (#${shiftId})` : 'CHƯA MỞ CA'}
              </Text>
            </View>
          </View>
          <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

          {hasActiveShift ? (
            <>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs font-bold text-gray-600">Bắt đầu:</Text>
                <Text className="text-xs font-bold text-black font-mono">{formatVietnamDateTime(currentShift?.startedAt || '')}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs font-bold text-gray-600">Người thực hiện:</Text>
                <Text className="text-xs font-bold text-black">{user?.name || user?.username} (@{user?.username})</Text>
              </View>
            </>
          ) : (
            <Text className="text-xs text-gray-600 italic mb-2">
              Bạn chưa mở ca làm việc. Vui lòng nhấn "Mở ca" để bắt đầu ghi nhận giao dịch.
            </Text>
          )}

          {/* Shift Action Buttons */}
          <View className="mt-4 pt-4 border-t border-gray-200">
            {!hasActiveShift ? (
              <TouchableOpacity
                testID="btn-open-shift"
                onPress={() => setShowOpenShiftModal(true)}
                className="bg-black py-3 px-4 border-2 border-black items-center justify-center flex-row"
              >
                <Ionicons name="play-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text className="text-white font-black uppercase tracking-wider text-xs">
                  Mở ca
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="btn-end-shift"
                onPress={handleStartEndShiftFlow}
                className="bg-black py-3 px-4 border-2 border-black items-center justify-center flex-row"
              >
                <Ionicons name="stop-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text className="text-white font-black uppercase tracking-wider text-xs">
                  Kết thúc ca
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===================== CASHIER VIEW ===================== */}
        {role === 'Cashier' && (
          <View>
            <View className="flex-row flex-wrap gap-3 mb-6">
              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-gray-50">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Phiếu bán</Text>
                <Text className="text-2xl font-black text-black mt-1">{cashierStats.orderCount}</Text>
              </View>

              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-gray-50">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Doanh thu</Text>
                <Text className="text-lg font-black text-black mt-1">{formatCurrency(cashierStats.totalRevenue)}</Text>
              </View>

              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-white">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Tiền mặt</Text>
                <Text className="text-base font-bold text-black mt-1">{formatCurrency(cashierStats.cashAmount)}</Text>
              </View>

              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-white">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">QR</Text>
                <Text className="text-base font-bold text-black mt-1">{formatCurrency(cashierStats.qrAmount)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ===================== WAREHOUSE VIEW ===================== */}
        {role === 'WarehouseStaff' && (
          <View>
            <View className="flex-row flex-wrap gap-3 mb-6">
              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-gray-50">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Phiếu nhập</Text>
                <Text className="text-2xl font-black text-black mt-1">{warehouseStats.receiptCount}</Text>
              </View>

              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-gray-50">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Tổng tiền</Text>
                <Text className="text-lg font-black text-black mt-1">{formatCurrency(warehouseStats.totalReceiptValue)}</Text>
              </View>

              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-white">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Điều chỉnh tồn</Text>
                <Text className="text-xl font-bold text-black mt-1">{warehouseStats.adjustmentCount}</Text>
              </View>

              <View className="flex-1 min-w-[140px] border-2 border-black p-4 bg-white">
                <Text className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Tăng / giảm</Text>
                <Text className="text-sm font-bold text-black mt-1">
                  +{warehouseStats.totalQtyIncrease} / -{warehouseStats.totalQtyDecrease}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ===================== ADMIN / MANAGER VIEW ===================== */}
        {(role === 'Admin' || role === 'Manager') && (
          <View>
            {/* Filter Tabs */}
            <View className="flex-row border-2 border-black mb-6">
              <TouchableOpacity
                onPress={() => setFilterRole('all')}
                className={`flex-1 py-2.5 items-center ${filterRole === 'all' ? 'bg-black' : 'bg-white'}`}
              >
                <Text className={`text-xs font-bold uppercase tracking-wider ${filterRole === 'all' ? 'text-white' : 'text-black'}`}>
                  Tất cả
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterRole('cashier')}
                className={`flex-1 py-2.5 items-center border-l-2 border-r-2 border-black ${filterRole === 'cashier' ? 'bg-black' : 'bg-white'}`}
              >
                <Text className={`text-xs font-bold uppercase tracking-wider ${filterRole === 'cashier' ? 'text-white' : 'text-black'}`}>
                  Bán hàng
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterRole('warehouse')}
                className={`flex-1 py-2.5 items-center ${filterRole === 'warehouse' ? 'bg-black' : 'bg-white'}`}
              >
                <Text className={`text-xs font-bold uppercase tracking-wider ${filterRole === 'warehouse' ? 'text-white' : 'text-black'}`}>
                  Kho hàng
                </Text>
              </TouchableOpacity>
            </View>

            {(filterRole === 'all' || filterRole === 'cashier') && (
              <View className="border-2 border-black p-5 mb-6 bg-white">
                <Text className="font-black text-black mb-3 uppercase tracking-widest text-xs">
                  Bán hàng
                </Text>
                <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-bold text-gray-600">Phiếu bán:</Text>
                  <Text className="text-xs font-black text-black">{cashierStats.orderCount} phiếu</Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-bold text-gray-600">Tiền mặt:</Text>
                  <Text className="text-xs font-bold text-black">{formatCurrency(cashierStats.cashAmount)}</Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-bold text-gray-600">QR:</Text>
                  <Text className="text-xs font-bold text-black">{formatCurrency(cashierStats.qrAmount)}</Text>
                </View>
                <View className="flex-row justify-between pt-2 border-t border-gray-200">
                  <Text className="text-xs font-black uppercase text-black">Doanh thu:</Text>
                  <Text className="text-sm font-black text-black font-mono">{formatCurrency(cashierStats.totalRevenue)}</Text>
                </View>
              </View>
            )}

            {(filterRole === 'all' || filterRole === 'warehouse') && (
              <View className="border-2 border-black p-5 mb-6 bg-white">
                <Text className="font-black text-black mb-3 uppercase tracking-widest text-xs">
                  Kho hàng
                </Text>
                <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-bold text-gray-600">Phiếu nhập:</Text>
                  <Text className="text-xs font-black text-black">{warehouseStats.receiptCount} phiếu</Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-bold text-gray-600">Tổng tiền:</Text>
                  <Text className="text-xs font-bold text-black">{formatCurrency(warehouseStats.totalReceiptValue)}</Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-bold text-gray-600">Điều chỉnh tồn:</Text>
                  <Text className="text-xs font-bold text-black">{warehouseStats.adjustmentCount} lần</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs font-bold text-gray-600">Tăng / giảm:</Text>
                  <Text className="text-xs font-bold text-black">+{warehouseStats.totalQtyIncrease} / -{warehouseStats.totalQtyDecrease}</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* OPEN SHIFT CONFIRM MODAL */}
      <Modal visible={showOpenShiftModal} transparent animationType="fade">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-[92%] max-w-sm p-5 border-4 border-black">
            <Text className="text-lg font-black uppercase text-black mb-2">Mở ca làm việc</Text>
            <Text className="text-xs text-gray-600 mb-5">
              Bạn có chắc chắn muốn mở ca làm việc mới? Toàn bộ giao dịch sẽ được liên kết với ca này.
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setShowOpenShiftModal(false)}
                className="flex-1 py-2.5 border-2 border-gray-400 items-center justify-center"
              >
                <Text className="text-xs font-bold text-gray-700 uppercase">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="btn-confirm-open-shift"
                onPress={handleOpenShift}
                className="flex-1 bg-black py-2.5 border-2 border-black items-center justify-center"
              >
                <Text className="text-xs font-black text-white uppercase">Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SHIFT SUMMARY PREVIEW MODAL */}
      <Modal visible={showShiftSummaryModal} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-[94%] max-w-md p-5 border-4 border-black max-h-[90%]">
            <View className="pb-3 border-b-2 border-black mb-4">
              <Text className="text-lg font-black uppercase text-black">Tổng kết ca làm việc</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Xác nhận số liệu trước khi kết thúc ca</Text>
            </View>

            {reportData && (
              <View className="bg-gray-50 p-4 border border-gray-300 mb-4 flex-col gap-1.5">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Mã ca:</Text>
                  <Text className="text-xs font-bold text-black">#{reportData.shiftId}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Bắt đầu:</Text>
                  <Text className="text-xs font-bold text-black">{formatVietnamDateTime(reportData.startedAt)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Người thực hiện:</Text>
                  <Text className="text-xs font-bold text-black">{reportData.userName} ({reportData.role})</Text>
                </View>

                {role === 'Cashier' && (
                  <>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Phiếu bán:</Text>
                      <Text className="text-xs font-bold text-black">{reportData.orderCount}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Tiền mặt:</Text>
                      <Text className="text-xs font-bold text-black">{formatCurrency(reportData.cashRevenue)}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">QR:</Text>
                      <Text className="text-xs font-bold text-black">{formatCurrency(reportData.qrRevenue)}</Text>
                    </View>
                    <View className="flex-row justify-between pt-2 border-t border-gray-300">
                      <Text className="text-xs font-black uppercase">DOANH THU:</Text>
                      <Text className="text-sm font-black text-black">{formatCurrency(reportData.totalRevenue)}</Text>
                    </View>
                  </>
                )}

                {role === 'WarehouseStaff' && (
                  <>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Phiếu nhập:</Text>
                      <Text className="text-xs font-bold text-black">{reportData.receiptCount}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Tổng tiền:</Text>
                      <Text className="text-xs font-bold text-black">{formatCurrency(reportData.totalReceiptAmount)}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Tổng lượng nhập:</Text>
                      <Text className="text-xs font-bold text-black">{reportData.receiptQuantityTotal}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Tăng / giảm:</Text>
                      <Text className="text-xs font-bold text-black">+{reportData.adjustmentIncreaseQuantity} / -{reportData.adjustmentDecreaseQuantity}</Text>
                    </View>
                  </>
                )}

                {role !== 'Cashier' && role !== 'WarehouseStaff' && (
                  <>
                    <View className="flex-row justify-between pt-1 border-t border-gray-200">
                      <Text className="text-xs font-bold text-gray-700">Phiếu bán / Doanh thu:</Text>
                      <Text className="text-xs font-bold text-black">{reportData.orderCount} / {formatCurrency(reportData.totalRevenue)}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs font-bold text-gray-700">Phiếu nhập / Tổng tiền:</Text>
                      <Text className="text-xs font-bold text-black">{reportData.receiptCount} / {formatCurrency(reportData.totalReceiptAmount)}</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setShowShiftSummaryModal(false)}
                className="flex-1 py-2.5 border-2 border-gray-400 items-center justify-center"
              >
                <Text className="text-xs font-bold text-gray-700 uppercase">Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="btn-confirm-end-shift"
                onPress={handleConfirmEndShift}
                className="flex-1 bg-black py-2.5 border-2 border-black items-center justify-center"
              >
                <Text className="text-xs font-black text-white uppercase">Xác nhận kết ca</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PRINT PREVIEW MODAL (IMMEDIATELY AFTER END SHIFT) */}
      <Modal visible={showPrintModal} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-[94%] max-w-md p-5 border-4 border-black max-h-[90%]">
            <View className="pb-3 border-b-2 border-black mb-4">
              <Text className="text-lg font-black uppercase text-black">Báo cáo kết ca</Text>
              <Text className="text-xs text-gray-600 mt-0.5">Ca làm việc đã kết thúc thành công</Text>
            </View>

            {reportData && (
              <View className="bg-gray-50 p-4 border border-gray-300 mb-4 flex-col gap-1.5">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Mã ca:</Text>
                  <Text className="text-xs font-bold text-black">#{reportData.shiftId}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Người thực hiện:</Text>
                  <Text className="text-xs font-bold text-black">{reportData.userName}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Bắt đầu:</Text>
                  <Text className="text-xs font-bold text-black">{formatVietnamDateTime(reportData.startedAt)}</Text>
                </View>
                {reportData.endedAt && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-600">Kết thúc:</Text>
                    <Text className="text-xs font-bold text-black">{formatVietnamDateTime(reportData.endedAt)}</Text>
                  </View>
                )}
                {role === 'Cashier' && (
                  <View className="flex-row justify-between pt-2 border-t border-gray-300">
                    <Text className="text-xs font-black uppercase">DOANH THU:</Text>
                    <Text className="text-sm font-black text-black">{formatCurrency(reportData.totalRevenue)}</Text>
                  </View>
                )}
                {role === 'WarehouseStaff' && (
                  <View className="flex-row justify-between pt-2 border-t border-gray-300">
                    <Text className="text-xs font-black uppercase">TỔNG TIỀN NHẬP:</Text>
                    <Text className="text-sm font-black text-black">{formatCurrency(reportData.totalReceiptAmount)}</Text>
                  </View>
                )}
              </View>
            )}

            <View className="flex-row gap-2">
              <TouchableOpacity
                testID="btn-close-print-preview"
                onPress={() => setShowPrintModal(false)}
                className="flex-1 py-2.5 border-2 border-gray-400 items-center justify-center"
              >
                <Text className="text-xs font-bold text-gray-700 uppercase">Đóng</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="btn-print-report"
                onPress={handlePrintReport}
                className="flex-1 bg-black py-2.5 border-2 border-black items-center justify-center flex-row"
              >
                <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text className="text-xs font-black text-white uppercase">In báo cáo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
