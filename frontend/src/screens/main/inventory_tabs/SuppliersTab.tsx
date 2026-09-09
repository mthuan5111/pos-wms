import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getDBConnection, LocalSupplierRow } from "@/database/db";

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<LocalSupplierRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const db = await getDBConnection();
      const rows = await db.getAllAsync<LocalSupplierRow>("SELECT * FROM LocalSuppliers");
      setSuppliers(rows);
    } catch (error) {
      console.error("[Inventory] Lỗi lấy danh sách nhà cung cấp:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSuppliers();
    }, [])
  );

  return (
    <View className="flex-1 bg-white p-4">
      <FlatList
        data={suppliers}
        keyExtractor={(item) => item.Id.toString()}
        refreshing={isLoading}
        onRefresh={loadSuppliers}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View className="bg-white p-4 mb-4 border-2 border-black">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="font-bold text-lg text-black">{item.Name}</Text>
              <Text className="text-black bg-gray-200 px-2 py-1 text-xs font-bold uppercase">ID: {item.Id}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="person" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2">{item.ContactPerson || "Không có người liên hệ"}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="call" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2">{item.Phone || "Chưa cập nhật số điện thoại"}</Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="location" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2 flex-1" numberOfLines={2}>{item.Address || "Chưa cập nhật địa chỉ"}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="business-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black">Chưa có nhà cung cấp</Text>
          </View>
        }
      />
    </View>
  );
}
