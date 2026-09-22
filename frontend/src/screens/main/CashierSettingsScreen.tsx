import { useModalStore } from '@/store/useModalStore';
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Alert, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { getUnsyncedOrders, getLocalOrders, LocalOrderRow } from "@/database/db";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import CustomButton from "@/components/CustomButton";
import { useSafeLogout } from "@/hooks/useSafeLogout";
import { calculateZReportRevenue } from "@/utils/calculator";
import { generateShiftReportHtml } from "@/utils/printTemplates";
import { printDocument } from "@/utils/printService";

export default function CashierSettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const { handleLogout } = useSafeLogout();
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [todayOrders, setTodayOrders] = useState<LocalOrderRow[]>([]);
  const [zReportData, setZReportData] = useState({
    totalRevenue: 0,
    orderCount: 0,
    cashAmount: 0,
    qrAmount: 0,
  });

  const loadShiftData = async () => {
    try {
      const unsynced = await getUnsyncedOrders(user?.id || 0);
      setUnsyncedCount(unsynced.length);

      const allOrders = await getLocalOrders();
      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const utcToday = now.toISOString().split("T")[0];
      const shiftOrders = allOrders.filter(o =>
        (o.OwnerUserId === user?.id || !o.OwnerUserId) &&
        (o.CreatedAt.startsWith(localToday) || o.CreatedAt.startsWith(utcToday))
      );

      const { revenue, cash, qr } = calculateZReportRevenue(shiftOrders);

      setTodayOrders(shiftOrders);
      setZReportData({
        totalRevenue: revenue,
        orderCount: shiftOrders.length,
        cashAmount: cash,
        qrAmount: qr,
      });
    } catch (e) {
      console.error("[CashierSettings] Lỗi tải dữ liệu ca làm việc:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadShiftData();
    }, [])
  );

  const formatCurrency = (amount: number) => amount.toLocaleString("vi-VN") + " đ";

  const handlePrintZReport = async () => {
    const todayStr = new Date().toLocaleDateString('vi-VN');
    const htmlContent = generateShiftReportHtml({
      shiftId: `Z-${new Date().toLocaleDateString('en-CA').replace(/-/g, '')}`,
      userName: user?.name || user?.username || 'Thu ngân',
      role: 'Cashier',
      startedAt: new Date().toISOString(),
      status: 'Closed',
      orderCount: zReportData.orderCount,
      completedOrderCount: zReportData.orderCount,
      canceledOrderCount: 0,
      cashRevenue: zReportData.cashAmount,
      qrRevenue: zReportData.qrAmount,
      totalRevenue: zReportData.totalRevenue,
      pendingSyncCount: unsyncedCount,
      notes: `Báo cáo Z-Report tổng kết ca ngày ${todayStr}`,
    }, { paperSize: '80mm' });

    try {
      await printDocument(htmlContent, `ZReport_${user?.username || 'Cashier'}`);
    } catch (e: any) {
      useModalStore.getState().showModal({
        title: "Thông báo",
        message: "Không thể in Z-Report: " + (e.message || ''),
        type: "info"
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b-4 border-black flex-row justify-between items-center bg-white">
        <View>
          <Text className="font-serif text-2xl font-black text-black uppercase">Cài đặt Thu ngân</Text>
          <Text className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Nghiệp vụ ca làm việc</Text>
        </View>
        <Ionicons name="person-circle-outline" size={32} color="#000" />
      </View>

      <ScrollView
        className="flex-1 p-4"
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* User Info */}
        <View className="mb-4 p-4 border-2 border-black bg-white">
          <Text className="font-bold text-xs text-gray-500 uppercase tracking-widest border-b-2 border-black pb-2 mb-3">Tài khoản thu ngân</Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-600 font-bold">Họ tên:</Text>
            <Text className="text-black font-black">{user?.name}</Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-600 font-bold">Tên đăng nhập:</Text>
            <Text className="text-black font-bold">@{user?.username}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-600 font-bold">Trạng thái đồng bộ:</Text>
            <Text className={`font-bold ${unsyncedCount > 0 ? 'text-red-600' : 'text-green-700'}`}>
              {unsyncedCount > 0 ? `${unsyncedCount} đơn chưa đồng bộ` : 'Đã đồng bộ toàn bộ'}
            </Text>
          </View>
        </View>

        {/* Z-Report Summary */}
        <View className="mb-6 p-4 border-2 border-black bg-white">
          <View className="flex-row justify-between items-center border-b-2 border-black pb-2 mb-4">
            <Text className="font-black text-sm text-black uppercase tracking-wider">Báo cáo kết ca (Z-Report)</Text>
            <View className="bg-black px-2 py-0.5">
              <Text className="text-white font-bold text-xs uppercase">Hôm nay</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-black font-bold">Số lượng đơn hàng:</Text>
            <Text className="text-black font-black text-lg">{zReportData.orderCount} đơn</Text>
          </View>

          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-600 font-bold">Doanh thu Tiền mặt:</Text>
            <Text className="text-black font-bold">{formatCurrency(zReportData.cashAmount)}</Text>
          </View>

          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-600 font-bold">Doanh thu Chuyển khoản (QR):</Text>
            <Text className="text-black font-bold">{formatCurrency(zReportData.qrAmount)}</Text>
          </View>

          <View className="border-t-2 border-dashed border-gray-300 pt-3 mt-1 flex-row justify-between items-center mb-4">
            <Text className="text-black font-black uppercase text-sm">Tổng doanh thu ca:</Text>
            <Text className="text-black font-black font-serif text-xl">{formatCurrency(zReportData.totalRevenue)}</Text>
          </View>

          <TouchableOpacity
            className="flex-row justify-center items-center bg-black py-3 px-4 border-2 border-black"
            onPress={handlePrintZReport}
          >
            <Ionicons name="print-outline" size={18} color="#fff" />
            <Text className="text-white font-bold uppercase tracking-wider text-xs ml-2">In phiếu kết ca (Z-Report)</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <CustomButton title="Đăng xuất" onPress={handleLogout} variant="outline" className="mb-8" />
      </ScrollView>
    </SafeAreaView>
  );
}

export { calculateZReportRevenue } from "@/utils/calculator";
