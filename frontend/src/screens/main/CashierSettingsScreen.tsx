import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Alert, Platform, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { getUnsyncedOrders, getLocalOrders, clearLocalData, LocalOrderRow } from "@/database/db";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import CustomButton from "@/components/CustomButton";

export default function CashierSettingsScreen() {
  const { user, logoutAsync } = useAuthStore();
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
      const unsynced = await getUnsyncedOrders();
      setUnsyncedCount(unsynced.length);

      const allOrders = await getLocalOrders();
      const today = new Date().toISOString().split("T")[0];
      const shiftOrders = allOrders.filter(o => o.CreatedAt.startsWith(today));
      
      let revenue = 0;
      let cash = 0;
      let qr = 0;

      shiftOrders.forEach(o => {
        revenue += o.TotalAmount;
        if ((o as any).PaymentMethod === 'VIETQR') {
          qr += o.TotalAmount;
        } else {
          cash += o.TotalAmount;
        }
      });

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

  const handleLogout = async () => {
    if (unsyncedCount > 0) {
      const msg = `Bạn đang có ${unsyncedCount} đơn hàng chưa được đẩy lên máy chủ. Đăng xuất lúc này có thể làm ảnh hưởng dữ liệu. Bạn có chắc muốn tiếp tục?`;
      if (Platform.OS === 'web') {
        if (!window.confirm(msg)) return;
      } else {
        Alert.alert("Cảnh báo", msg, [
          { text: "Hủy", style: "cancel" },
          { text: "Vẫn đăng xuất", style: "destructive", onPress: confirmLogout }
        ]);
        return;
      }
    }
    await confirmLogout();
  };

  const confirmLogout = async () => {
    try {
      await clearLocalData();
      await logoutAsync();
    } catch (e) {
      console.error("Lỗi đăng xuất:", e);
    }
  };

  const formatCurrency = (amount: number) => amount.toLocaleString("vi-VN") + " đ";

  const handlePrintZReport = async () => {
    const htmlContent = `
      <html>
        <head>
          <title>Z-REPORT KẾT CA</title>
          <style>
            body { font-family: monospace; padding: 20px; color: #000; max-width: 400px; margin: auto; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ccc; }
            .total { font-weight: bold; border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; font-size: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>BÁO CÁO KẾT CA (Z-REPORT)</h2>
            <p>Ngày: ${new Date().toLocaleDateString('vi-VN')}</p>
            <p>Thu ngân: ${user?.name || user?.username}</p>
          </div>
          <div class="row"><span>Tổng số đơn hàng:</span><span>${zReportData.orderCount} đơn</span></div>
          <div class="row"><span>Doanh thu Tiền mặt:</span><span>${formatCurrency(zReportData.cashAmount)}</span></div>
          <div class="row"><span>Doanh thu Chuyển khoản (QR):</span><span>${formatCurrency(zReportData.qrAmount)}</span></div>
          <div class="row total"><span>TỔNG DOANH THU CA:</span><span>${formatCurrency(zReportData.totalRevenue)}</span></div>
          <div class="row"><span>Đơn chưa đồng bộ:</span><span>${unsyncedCount} đơn</span></div>
          <p style="text-align: center; margin-top: 30px;">Chữ ký thu ngân: .......................</p>
        </body>
      </html>
    `;

    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    } else {
      try {
        const { printAsync } = require('expo-print');
        await printAsync({ html: htmlContent });
      } catch (e) {
        Alert.alert("Thông báo", "Báo cáo Z-Report đã được ghi nhận.");
      }
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
      
      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
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
