import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useSafeLogout } from '@/hooks/useSafeLogout';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';

const ROUTE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Dashboard: { label: "Tổng quan", icon: "pie-chart" },
  POS: { label: "Bán hàng", icon: "cart" },
  Inventory: { label: "Kho hàng", icon: "cube" },
  Invoice: { label: "Hóa đơn", icon: "receipt" },
  WarehouseInvoice: { label: "Hóa đơn kho", icon: "receipt" },
  Statistics: { label: "Thống kê", icon: "stats-chart" },
  UserManagement: { label: "Tài khoản", icon: "people" },
  SystemLog: { label: "Nhật ký hệ thống", icon: "list" },
  Settings: { label: "Cài đặt", icon: "settings" },
  CashierSettings: { label: "Cài đặt", icon: "settings" },
  WarehouseSettings: { label: "Cài đặt", icon: "settings" },
};

export default function DesktopSidebar(props: BottomTabBarProps) {
  const user = useAuthStore(state => state.user);
  const role = user?.role || "";
  const { handleLogout } = useSafeLogout();

  const activeIndex = props.state.index;
  const activeRoute = props.state.routes[activeIndex]?.name;
  console.log('[DesktopSidebar] render activeIndex:', activeIndex, 'activeRoute:', activeRoute);

  return (
    <View
      testID="desktop-left-sidebar"
      style={Platform.OS === 'web' ? ({
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: 240,
        backgroundColor: '#FFFFFF',
        borderRightWidth: 3,
        borderRightColor: '#000000',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
      } as any) : {
        width: 240,
        backgroundColor: '#FFFFFF',
        borderRightWidth: 3,
        borderRightColor: '#000000',
      }}
    >
      {/* Brand Header */}
      <View className="p-5 border-b-2 border-black bg-white">
        <Text className="font-serif text-2xl font-black text-black tracking-tighter uppercase">
          POS & WMS
        </Text>
        <Text className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mt-0.5">
          Hệ thống bán hàng & kho
        </Text>
        <View className="mt-2.5 inline-flex self-start bg-black px-2 py-0.5 border border-black">
          <Text className="text-[10px] font-black text-white uppercase tracking-wider">
            {role === "Admin" ? "Quản trị viên" : role === "Manager" ? "Quản lý" : role === "Cashier" ? "Thu ngân" : "Thủ kho"}
          </Text>
        </View>
      </View>

      {/* Navigation Links */}
      <ScrollView className="flex-1 py-3 px-2" showsVerticalScrollIndicator={false}>
        {props.state.routes.map((route, index) => {
          const isFocused = activeIndex === index;
          const meta = ROUTE_META[route.name] || { label: route.name, icon: "cube-outline" };

          const onPress = () => {
            console.log('[DesktopSidebar] Navigating to:', route.name);
            const event = props.navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              props.navigation.dispatch({
                ...CommonActions.navigate({ name: route.name, merge: true }),
                target: props.state.key,
              });
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              testID={`sidebar-nav-${route.name.toLowerCase()}`}
              onPress={onPress}
              activeOpacity={0.8}
              className={`flex-row items-center px-4 py-3 mb-1.5 border-2 ${
                isFocused
                  ? 'bg-black border-black text-white'
                  : 'bg-white border-transparent hover:border-gray-300'
              }`}
            >
              <Ionicons
                name={isFocused ? meta.icon : (`${meta.icon}-outline` as any)}
                size={20}
                color={isFocused ? '#FFFFFF' : '#000000'}
                style={{ marginRight: 12 }}
              />
              <Text
                className={`text-xs font-bold uppercase tracking-wider ${
                  isFocused ? 'text-white font-black' : 'text-black'
                }`}
              >
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer / User & Logout */}
      <View className="p-4 border-t-2 border-black bg-gray-50">
        <View className="flex-row items-center mb-3">
          <View className="w-8 h-8 rounded-full bg-black items-center justify-center mr-2.5">
            <Ionicons name="person" size={16} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-black text-black" numberOfLines={1}>
              {user?.name || user?.username}
            </Text>
            <Text className="text-[10px] text-gray-500 font-bold uppercase">
              @{user?.username}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          testID="sidebar-logout-btn"
          onPress={handleLogout}
          className="border border-black py-2 px-3 bg-white flex-row items-center justify-center"
        >
          <Ionicons name="log-out-outline" size={14} color="#000" style={{ marginRight: 6 }} />
          <Text className="text-[11px] font-bold uppercase tracking-wider text-black">
            Đăng xuất
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
