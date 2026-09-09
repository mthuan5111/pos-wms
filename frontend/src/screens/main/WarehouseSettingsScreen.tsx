import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { getDBConnection, clearLocalData } from "@/database/db";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import CustomButton from "@/components/CustomButton";

export default function WarehouseSettingsScreen() {
  const { user, logoutAsync } = useAuthStore();
  const [unsyncedReceiptsCount, setUnsyncedReceiptsCount] = useState(0);
  const [totalReceiptsCount, setTotalReceiptsCount] = useState(0);

  const loadWarehouseData = async () => {
    try {
      const db = await getDBConnection();
      const unsynced = await db.getAllAsync<any>(
        "SELECT * FROM LocalGoodsReceipts WHERE IsSynced = 0"
      );
      setUnsyncedReceiptsCount(unsynced.length);

      const allReceipts = await db.getAllAsync<any>(
        "SELECT * FROM LocalGoodsReceipts"
      );
      setTotalReceiptsCount(allReceipts.length);
    } catch (e) {
      console.error("[WarehouseSettings] Lỗi tải dữ liệu kho:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadWarehouseData();
    }, [])
  );

  const handleLogout = async () => {
    if (unsyncedReceiptsCount > 0) {
      const msg = `Bạn đang có ${unsyncedReceiptsCount} phiếu nhập chưa đồng bộ lên máy chủ. Bạn có chắc chắn muốn đăng xuất?`;
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

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b-4 border-black flex-row justify-between items-center bg-white">
        <View>
          <Text className="font-serif text-2xl font-black text-black uppercase">Cài đặt Thủ kho</Text>
          <Text className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Quản lý phiên làm việc</Text>
        </View>
        <Ionicons name="cube-outline" size={32} color="#000" />
      </View>
      
      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        {/* User Info */}
        <View className="mb-4 p-4 border-2 border-black bg-white">
          <Text className="font-bold text-xs text-gray-500 uppercase tracking-widest border-b-2 border-black pb-2 mb-3">Tài khoản Thủ kho</Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-600 font-bold">Họ tên:</Text>
            <Text className="text-black font-black">{user?.name}</Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-600 font-bold">Tên đăng nhập:</Text>
            <Text className="text-black font-bold">@{user?.username}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-600 font-bold">Vai trò:</Text>
            <Text className="text-black font-bold uppercase">Warehouse Staff</Text>
          </View>
        </View>

        {/* Sync Status */}
        <View className="mb-6 p-4 border-2 border-black bg-white">
          <Text className="font-black text-sm text-black uppercase tracking-wider border-b-2 border-black pb-2 mb-3">Trạng thái dữ liệu kho</Text>

          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-600 font-bold">Tổng số phiếu nhập đã lập:</Text>
            <Text className="text-black font-black text-base">{totalReceiptsCount} phiếu</Text>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-gray-600 font-bold">Phiếu nhập chưa đồng bộ:</Text>
            <Text className={`font-bold ${unsyncedReceiptsCount > 0 ? 'text-red-600' : 'text-green-700'}`}>
              {unsyncedReceiptsCount > 0 ? `${unsyncedReceiptsCount} phiếu chưa đẩy lên` : 'Đã đồng bộ toàn bộ'}
            </Text>
          </View>
        </View>

        {/* Logout */}
        <CustomButton title="Đăng xuất" onPress={handleLogout} variant="outline" className="mb-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
