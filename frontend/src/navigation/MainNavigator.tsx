import React from "react";
import { createBottomTabNavigator, BottomTabBar } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { MainTabParamList } from "@/types/navigation";
import PosScreen from "@/screens/main/PosScreen";
import InventoryScreen from "@/screens/main/InventoryScreen";
import InvoiceScreen from "@/screens/main/InvoiceScreen";
import SettingsScreen from "@/screens/main/SettingsScreen";
import DashboardScreen from "@/screens/main/DashboardScreen";
import StatisticsScreen from "@/screens/main/StatisticsScreen";
import UserManagementScreen from "@/screens/main/UserManagementScreen";
import SystemLogScreen from "@/screens/main/SystemLogScreen";
import DesktopSidebar from "@/components/DesktopSidebar";
import MobileBottomTabBar from "@/components/MobileBottomTabBar";
import { useAuthStore } from "@/store/authStore";
import { useSyncCoordinator } from "@/hooks/useSyncCoordinator";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  const user = useAuthStore(state => state.user);
  const role = user?.role || "";
  const isDesktop = useIsDesktop();

  useSyncCoordinator();

  const canViewDashboard = role === "Admin" || role === "Manager";
  const canViewPOS = role === "Admin" || role === "Manager" || role === "Cashier";
  const canViewInventory = role === "Admin" || role === "Manager" || role === "WarehouseStaff";
  const canViewInvoice = role === "Admin" || role === "Manager" || role === "Cashier" || role === "WarehouseStaff";
  const canViewStatistics = true; // All authenticated roles have role-scoped Statistics
  const canViewUserManagement = role === "Admin";
  const canViewSystemLog = role === "Admin";

  return (
    <Tab.Navigator
      tabBar={props => isDesktop ? <DesktopSidebar {...props} /> : <MobileBottomTabBar {...props} />}
      screenOptions={({ route }) => ({
        sceneStyle: isDesktop ? { marginLeft: 240 } : { marginLeft: 0 },
        headerShown: false,
        headerTitleStyle: { fontWeight: "bold" },
        tabBarActiveTintColor: "#000000",
        tabBarInactiveTintColor: "#525252",
        tabBarStyle: isDesktop ? { display: 'none' } : {
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 2,
          borderTopColor: '#000000',
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: 'uppercase' as any,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "menu";

          if (route.name === "Dashboard") {
            iconName = focused ? "pie-chart" : "pie-chart-outline";
          } else if (route.name === "POS") {
            iconName = focused ? "cart" : "cart-outline";
          } else if (route.name === "Inventory") {
            iconName = focused ? "cube" : "cube-outline";
          } else if (route.name === "Invoice" || route.name === "WarehouseInvoice") {
            iconName = focused ? "receipt" : "receipt-outline";
          } else if (route.name === "Statistics") {
            iconName = focused ? "stats-chart" : "stats-chart-outline";
          } else if (route.name === "Settings" || route.name === "CashierSettings" || route.name === "WarehouseSettings") {
            iconName = focused ? "settings" : "settings-outline";
          } else if (route.name === "UserManagement") {
            iconName = focused ? "people" : "people-outline";
          } else if (route.name === "SystemLog") {
            iconName = focused ? "list" : "list-outline";
          }
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      {canViewUserManagement && (
        <Tab.Screen
          name="UserManagement"
          component={UserManagementScreen}
          options={{ tabBarLabel: "Tài khoản" }}
        />
      )}
      {canViewSystemLog && (
        <Tab.Screen
          name="SystemLog"
          component={SystemLogScreen}
          options={{ tabBarLabel: "Nhật ký" }}
        />
      )}
      {canViewDashboard && (
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ tabBarLabel: "Tổng quan" }}
        />
      )}
      {canViewPOS && (
        <Tab.Screen
          name="POS"
          component={PosScreen}
          options={{ tabBarLabel: "Bán hàng" }}
        />
      )}
      {canViewInventory && (
        <Tab.Screen
          name="Inventory"
          component={InventoryScreen}
          options={{ tabBarLabel: "Kho hàng" }}
        />
      )}
      {canViewInvoice && (
        <Tab.Screen
          name="Invoice"
          component={InvoiceScreen}
          options={{ tabBarLabel: "Hóa đơn" }}
        />
      )}
      {canViewStatistics && (
        <Tab.Screen
          name="Statistics"
          component={StatisticsScreen}
          options={{ tabBarLabel: "Thống kê" }}
        />
      )}
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: "Cài đặt" }}
      />
    </Tab.Navigator>
  );
}
