import React from 'react';
import { View, Text } from 'react-native';

export default function PosScreen() {
  return (
    <View className="flex-1 bg-gray-50 justify-center items-center p-6">
      <View className="w-20 h-20 bg-blue-100 rounded-full items-center justify-center mb-4">
        <Text className="text-3xl">🛒</Text>
      </View>
      <Text className="text-2xl font-bold text-gray-800">Màn hình Bán hàng (POS)</Text>
      <Text className="text-gray-500 mt-2 text-center">
        Nơi thu ngân chọn sản phẩm, quét mã vạch và tạo đơn hàng.
      </Text>
    </View>
  );
}