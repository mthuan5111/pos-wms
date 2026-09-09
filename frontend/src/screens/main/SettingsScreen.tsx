import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useSync } from '@/hooks/useSync';
import { getUnsyncedOrders } from '@/database/db';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import CustomButton from '@/components/CustomButton';

export default function SettingsScreen() {
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const { isSyncing } = useSync();
  const { user, logoutAsync } = useAuthStore();

  const checkUnsyncedData = async () => {
    const orders = await getUnsyncedOrders();
    setUnsyncedCount(orders.length);
  };

  useFocusEffect(
    React.useCallback(() => {
      checkUnsyncedData();
    }, [])
  );

  const handleLogout = async () => {
    if (unsyncedCount > 0) {
        if (Platform.OS === 'web') {
            window.alert("Bạn đang có đơn hàng Offline chưa được đẩy lên máy chủ. Đăng xuất lúc này sẽ làm MẤT DOANH THU. Ứng dụng sẽ tự động đồng bộ khi có mạng. Vui lòng chờ đồng bộ hoàn tất trước khi đăng xuất!");
        } else {
            Alert.alert(
                "Cảnh báo bảo mật",
                "Bạn đang có đơn hàng Offline chưa được đẩy lên máy chủ. Đăng xuất lúc này sẽ làm MẤT DOANH THU. Ứng dụng sẽ tự động đồng bộ khi có mạng. Vui lòng chờ đồng bộ hoàn tất trước khi đăng xuất!"
            );
        }
        return;
    }

    if (Platform.OS === 'web') {
        const isConfirmed = window.confirm('Bạn có chắc chắn muốn đăng xuất tài khoản?');
        if (isConfirmed) {
            const { clearLocalData } = require('@/database/db');
            await clearLocalData();
            await logoutAsync();
        }
    } else {
        Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản?', [
        { text: 'Hủy', style: 'cancel' },
        { 
            text: 'Đăng xuất', 
            style: 'destructive', 
            onPress: async () => {
                const { clearLocalData } = require('@/database/db');
                await clearLocalData();
                await logoutAsync();
            }
        },
    ]);
    }
  };

  return (
    <View className="flex-1 bg-white p-6 justify-between">
      <View>
        {/* Account Section */}
        <View className="border-2 border-black p-6 mb-6">
          <Text className="font-black text-black mb-4" style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase' }}>
            Thông tin tài khoản
          </Text>
          <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 16 }} />

          <View className="mb-3 flex-row justify-between">
            <View className="flex-row items-center">
              <Ionicons name="person-outline" size={16} color="#000" />
              <Text className="ml-2" style={{ fontSize: 12, color: '#525252', letterSpacing: 1 }}>Họ tên</Text>
            </View>
            <Text className="text-black font-bold">{user?.name || 'N/A'}</Text>
          </View>

          <View className="mb-3 flex-row justify-between">
            <View className="flex-row items-center">
              <Ionicons name="key-outline" size={16} color="#000" />
              <Text className="ml-2" style={{ fontSize: 12, color: '#525252', letterSpacing: 1 }}>Username</Text>
            </View>
            <Text className="text-black font-bold" style={{ fontFamily: 'monospace' }}>{user?.username}</Text>
          </View>

          <View className="flex-row justify-between">
            <View className="flex-row items-center">
              <Ionicons name="shield-outline" size={16} color="#000" />
              <Text className="ml-2" style={{ fontSize: 12, color: '#525252', letterSpacing: 1 }}>Vai trò</Text>
            </View>
            <View className="border border-black px-2 py-0.5">
              <Text className="text-black font-bold" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>{user?.role}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Logout */}
      <CustomButton
        title="Đăng xuất"
        onPress={handleLogout}
        variant="outline"
      />
    </View>
  );
}