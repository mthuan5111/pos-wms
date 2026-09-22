import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useSafeLogout } from '@/hooks/useSafeLogout';

const ROUTE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  POS: { label: "Bán hàng", icon: "cart" },
  Inventory: { label: "Kho hàng", icon: "cube" },
  Invoice: { label: "Hóa đơn", icon: "receipt" },
  Statistics: { label: "Thống kê", icon: "stats-chart" },
  Dashboard: { label: "Tổng quan", icon: "pie-chart" },
  UserManagement: { label: "Tài khoản", icon: "people" },
  SystemLog: { label: "Nhật ký", icon: "list" },
  Settings: { label: "Cài đặt", icon: "settings" },
  CashierSettings: { label: "Cài đặt", icon: "settings" },
  WarehouseSettings: { label: "Cài đặt", icon: "settings" },
  WarehouseInvoice: { label: "Hóa đơn kho", icon: "receipt" },
};

// Primary routes to keep directly on bottom bar for quick access
const PRIMARY_ROUTE_ORDER = ["POS", "Inventory", "Invoice", "Statistics"];

export default function MobileBottomTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore(state => state.user);
  const { handleLogout } = useSafeLogout();
  const [isMoreMenuVisible, setIsMoreMenuVisible] = useState(false);

  const activeIndex = props.state.index;
  const activeRoute = props.state.routes[activeIndex]?.name;
  const allRoutes = props.state.routes;

  const navigateTo = (routeName: string, routeKey: string) => {
    const event = props.navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });

    if (activeRoute !== routeName && !event.defaultPrevented) {
      props.navigation.dispatch({
        ...CommonActions.navigate({ name: routeName, merge: true }),
        target: props.state.key,
      });
    }
  };

  // If routes count <= 5, display all routes directly
  const useCompactMenu = allRoutes.length > 5;

  let primaryRoutes = allRoutes;
  let secondaryRoutes: typeof allRoutes = [];

  if (useCompactMenu) {
    // Pick up to 4 primary routes that exist in allRoutes
    const primaries = allRoutes.filter(r => PRIMARY_ROUTE_ORDER.includes(r.name));
    const primaryNames = new Set(primaries.map(p => p.name));
    primaryRoutes = primaries;
    secondaryRoutes = allRoutes.filter(r => !primaryNames.has(r.name));
  }

  const isSecondaryActive = secondaryRoutes.some(r => r.name === activeRoute);

  const bottomPad = Math.max(insets.bottom, 8);
  const barHeight = 56 + bottomPad;

  return (
    <>
      <View
        testID="mobile-bottom-tab-bar"
        style={{
          height: barHeight,
          paddingBottom: bottomPad,
          paddingTop: 6,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 2,
          borderTopColor: '#000000',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}
      >
        {primaryRoutes.map((route) => {
          const isFocused = activeRoute === route.name;
          const meta = ROUTE_META[route.name] || { label: route.name, icon: "cube-outline" };

          return (
            <TouchableOpacity
              key={route.key}
              testID={`bottom-tab-${route.name.toLowerCase()}`}
              onPress={() => navigateTo(route.name, route.key)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                paddingHorizontal: 2,
              }}
            >
              <Ionicons
                name={isFocused ? meta.icon : (`${meta.icon}-outline` as any)}
                size={22}
                color={isFocused ? '#000000' : '#737373'}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: isFocused ? '800' : '600',
                  color: isFocused ? '#000000' : '#737373',
                  marginTop: 2,
                  textAlign: 'center',
                }}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
              {isFocused && (
                <View
                  style={{
                    position: 'absolute',
                    top: -6,
                    left: '25%',
                    right: '25%',
                    height: 3,
                    backgroundColor: '#000000',
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}

        {/* If compact menu is enabled, render "Thêm" button */}
        {useCompactMenu && (
          <TouchableOpacity
            testID="bottom-tab-more"
            onPress={() => setIsMoreMenuVisible(true)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              paddingHorizontal: 2,
            }}
          >
            <Ionicons
              name={isSecondaryActive ? "grid" : "grid-outline"}
              size={22}
              color={isSecondaryActive ? '#000000' : '#737373'}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: isSecondaryActive ? '800' : '600',
                color: isSecondaryActive ? '#000000' : '#737373',
                marginTop: 2,
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              Thêm
            </Text>
            {isSecondaryActive && (
              <View
                style={{
                  position: 'absolute',
                  top: -6,
                  left: '25%',
                  right: '25%',
                  height: 3,
                  backgroundColor: '#000000',
                }}
              />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* "Thêm" Bottom Sheet Modal */}
      <Modal
        visible={isMoreMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMoreMenuVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsMoreMenuVisible(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: '#FFFFFF',
              borderTopWidth: 3,
              borderTopColor: '#000000',
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom + 16, 24),
              paddingHorizontal: 20,
              maxHeight: '75%',
            }}
          >
            {/* Sheet Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 2, borderBottomColor: '#000000', paddingBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Chức năng mở rộng
                </Text>
                <Text style={{ fontSize: 11, color: '#525252' }}>
                  {user?.name || user?.username} ({user?.role})
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsMoreMenuVisible(false)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {secondaryRoutes.map((route) => {
                const isFocused = activeRoute === route.name;
                const meta = ROUTE_META[route.name] || { label: route.name, icon: "cube-outline" };

                return (
                  <TouchableOpacity
                    key={route.key}
                    testID={`more-item-${route.name.toLowerCase()}`}
                    onPress={() => {
                      setIsMoreMenuVisible(false);
                      navigateTo(route.name, route.key);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      borderWidth: 2,
                      borderColor: '#000000',
                      backgroundColor: isFocused ? '#000000' : '#FFFFFF',
                    }}
                  >
                    <Ionicons
                      name={isFocused ? meta.icon : (`${meta.icon}-outline` as any)}
                      size={22}
                      color={isFocused ? '#FFFFFF' : '#000000'}
                      style={{ marginRight: 14 }}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: isFocused ? '#FFFFFF' : '#000000',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Logout button in More Menu */}
              <TouchableOpacity
                testID="more-menu-logout-btn"
                onPress={() => {
                  setIsMoreMenuVisible(false);
                  handleLogout();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  marginTop: 10,
                  borderWidth: 1.5,
                  borderColor: '#dc2626',
                  backgroundColor: '#fef2f2',
                }}
              >
                <Ionicons name="log-out-outline" size={18} color="#dc2626" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Đăng xuất tài khoản
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
