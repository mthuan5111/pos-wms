import React from 'react';
import { View, Text } from 'react-native';

export default function InventoryScreen() {
  return (
    <View className="flex-1 bg-gray-50 justify-center items-center p-6">
      <View className="w-20 h-20 bg-green-100 rounded-full items-center justify-center mb-4">
        <Text className="text-3xl">📦</Text>
      </View>
      <Text className="text-2xl font-bold text-gray-800">Quản lý Kho (Inventory)</Text>
      <Text className="text-gray-500 mt-2 text-center">
        Xem danh sách sản phẩm, số lượng tồn kho và nhập/xóa kho.
      </Text>
    </View>
  );
}