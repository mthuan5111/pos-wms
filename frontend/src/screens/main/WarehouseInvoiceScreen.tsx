import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getServerReceipts } from "@/services/goodsReceiptApi";

export default function WarehouseInvoiceScreen() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadServerReceipts = async () => {
    setIsLoading(true);
    try {
      const res = await getServerReceipts();
      if (res.isSuccess) {
          setReceipts(res.data);
      }
    } catch (error) {
      console.error("[Warehouse] Lỗi lấy lịch sử nhập hàng:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadServerReceipts();
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
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-6 pt-5 pb-4 bg-white border-b-4 border-black mb-4">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text style={{ fontFamily: 'serif', fontSize: 36, fontWeight: '900', color: '#000', letterSpacing: -1, textTransform: 'uppercase' }}>
              Lịch sử nhập
            </Text>
            <Text className="mt-1" style={{ fontSize: 11, letterSpacing: 4, color: '#525252', textTransform: 'uppercase' }}>
              Đã đồng bộ lên máy chủ
            </Text>
          </View>
          <View className="w-12 h-12 border-2 border-black items-center justify-center">
            <Ionicons name="cloud-done-outline" size={24} color="#000" />
          </View>
        </View>
      </View>

      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadServerReceipts} />}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View className="bg-white p-4 mb-4 border-2 border-black">
            <View className="flex-row justify-between items-center mb-2 pb-2 border-b-2 border-black">
              <Text className="font-bold text-lg text-black">{item.offlineReferenceId || `ID: ${item.id}`}</Text>
              <Text className="text-black font-black font-serif text-lg">{formatCurrency(item.totalAmount)}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="time" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2 font-bold">{formatDate(item.createdAt)}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="business" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2">{item.supplier?.name || "Không rõ nhà cung cấp"}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="person" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2">{item.user?.name || "Người tạo: " + item.userId}</Text>
            </View>
            {item.remarks && (
                <View className="flex-row mt-2 p-2 bg-gray-100">
                    <Ionicons name="chatbox" size={14} color="#525252" style={{ width: 20 }} />
                    <Text className="text-black ml-2 flex-1 italic">{item.remarks}</Text>
                </View>
            )}
            
            {item.details && item.details.length > 0 && (
                <View className="mt-4 pt-2 border-t-2 border-dashed border-gray-300">
                    <Text className="font-bold text-black mb-2 text-xs uppercase" style={{ letterSpacing: 1 }}>Chi tiết ({item.details.length} sản phẩm)</Text>
                    {item.details.map((d: any, idx: number) => (
                        <View key={idx} className="flex-row justify-between items-center mb-1">
                            <Text className="text-black flex-1" numberOfLines={1}>{d.product?.name || `SP ID: ${d.productId}`}</Text>
                            <Text className="text-black font-bold ml-2">x{d.quantity}</Text>
                        </View>
                    ))}
                </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center mt-20">
                <Ionicons name="server-outline" size={48} color="#525252" />
                <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
                <Text className="font-bold text-lg text-black">Chưa có dữ liệu</Text>
            </View>
          ) : <ActivityIndicator size="large" color="#000" className="mt-20" />
        }
      />
    </SafeAreaView>
  );
}
