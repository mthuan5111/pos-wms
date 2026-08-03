import React from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function SettingsScreen() {
  const { user, logoutAsync } = useAuthStore();

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
        const isConfirmed = window.confirm('Bạn có chắc chắn muốn đăng xuất tài khoản?');
        if (isConfirmed) {
            await logoutAsync();
        }
    } else {
        Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản?', [
        { text: 'Hủy', style: 'cancel' },
        { 
            text: 'Đăng xuất', 
            style: 'destructive', 
            onPress: async () => await logoutAsync()
        },
    ]);
    }
    
  };

  return (
    <View className="flex-1 bg-gray-50 p-6 justify-between">
      <View className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <Text className="text-xl font-bold text-gray-800 mb-3">Thông tin tài khoản</Text>
        <View className="space-y-2">
          <Text className="text-gray-600 text-base">👤 Họ tên: <Text className="font-semibold text-gray-900">{user?.name || 'N/A'}</Text></Text>
          <Text className="text-gray-600 text-base">🔑 Username: <Text className="font-semibold text-gray-900">{user?.username}</Text></Text>
          <Text className="text-gray-600 text-base">🛡 Vai trò: <Text className="font-semibold text-blue-600">{user?.role}</Text></Text>
        </View>
      </View>

      <TouchableOpacity 
        onPress={handleLogout}
        className="bg-red-500 py-3.5 rounded-xl items-center mb-4 shadow-sm"
      >
        <Text className="text-white font-bold text-base">Đăng xuất</Text>
      </TouchableOpacity>
    </View>
  );
}