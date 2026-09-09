import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { getDBConnection } from "@/database/db";

export default function ReceiptsTab() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation<any>();

  const loadReceipts = async () => {
    setIsLoading(true);
    try {
      const db = await getDBConnection();
      const rows = await db.getAllAsync<any>("SELECT * FROM LocalGoodsReceipts ORDER BY CreatedAt DESC");
      setReceipts(rows);
    } catch (error) {
      console.error("[Inventory] Lỗi lấy danh sách phiếu nhập:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadReceipts();
    }, [])
  );

  const formatCurrency = (amount: number) => amount.toLocaleString("vi-VN") + " đ";
  
  const formatDate = (isoStr: string) => {
      try {
          const d = new Date(isoStr);
          return d.toLocaleString("vi-VN");
      } catch {
          return isoStr;
      }
  };

  return (
    <View className="flex-1 bg-white p-4">
      <View className="mb-4 flex-row justify-between items-center">
          <Text className="font-bold text-black uppercase" style={{ letterSpacing: 1 }}>Phiếu nhập chưa đồng bộ</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Settings")} className="bg-black px-4 py-2">
              <Text className="text-white font-bold uppercase text-xs">Đồng bộ</Text>
          </TouchableOpacity>
      </View>
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.OfflineReferenceId}
        refreshing={isLoading}
        onRefresh={loadReceipts}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View className="bg-white p-4 mb-4 border-2 border-black">
            <View className="flex-row justify-between items-center mb-2 pb-2 border-b-2 border-black">
              <Text className="font-bold text-lg text-black">{item.OfflineReferenceId}</Text>
              <Text className="text-black font-black font-serif text-lg">{formatCurrency(item.TotalAmount)}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="time" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2 font-bold">{formatDate(item.CreatedAt)}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="business" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2">{item.SupplierName || "NCC ID: " + item.SupplierId}</Text>
            </View>
            {item.Remarks && (
                <View className="flex-row mt-2 p-2 bg-gray-100">
                    <Ionicons name="chatbox" size={14} color="#525252" style={{ width: 20 }} />
                    <Text className="text-black ml-2 flex-1 italic">{item.Remarks}</Text>
                </View>
            )}
            <View className="mt-2 flex-row justify-end">
                {item.IsSynced === 1 ? (
                    <Text className="text-green-700 font-bold text-xs uppercase"><Ionicons name="checkmark-circle" /> Đã đồng bộ</Text>
                ) : (
                    <Text className="text-red-700 font-bold text-xs uppercase"><Ionicons name="alert-circle" /> Chưa đồng bộ</Text>
                )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="document-text-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black">Chưa có phiếu nhập nào</Text>
          </View>
        }
      />
    </View>
  );
}
