import React, { useEffect } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { MainTabParamList } from "@/types/navigation";
import PosScreen from "@/screens/main/PosScreen";
import InventoryScreen from "@/screens/main/InventoryScreen";
import InvoiceScreen from "@/screens/main/InvoiceScreen";
import SettingsScreen from "@/screens/main/SettingsScreen";
import DashboardScreen from "@/screens/main/DashboardScreen";
import CashierSettingsScreen from "@/screens/main/CashierSettingsScreen";
import WarehouseSettingsScreen from "@/screens/main/WarehouseSettingsScreen";
import UserManagementScreen from "@/screens/main/UserManagementScreen";
import SystemLogScreen from "@/screens/main/SystemLogScreen";
import { useAuthStore } from "@/store/authStore";
import NetInfo from "@react-native-community/netinfo";
import { useSync } from "@/hooks/useSync";
import { useSyncReceipts } from "@/hooks/useSyncReceipts";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { Platform, Alert, AppState } from "react-native";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  const user = useAuthStore(state => state.user);
  const role = user?.role || "";
  const { syncOrders } = useSync();
  const { syncReceipts } = useSyncReceipts();
  const { rerunRequested, clearRerunRequested } = useGlobalSyncStore();

  // Trigger sync if requested
  useEffect(() => {
    if (rerunRequested) {
        clearRerunRequested();
        if (role === "Cashier" || role === "Manager") {
            syncOrders();
        }
        if (role === "WarehouseStaff" || role === "Manager") {
            syncReceipts();
        }
    }
  }, [rerunRequested, role, syncOrders, syncReceipts, clearRerunRequested]);

  // Sync on network connection
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
          useGlobalSyncStore.getState().requestSync();
      }
    });

    return () => {
        unsubscribe();
    };
  }, []);

  // Sync on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", nextAppState => {
      if (nextAppState === "active") {
        useGlobalSyncStore.getState().requestSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const canViewDashboard = role === "Admin" || role === "Manager";
  const canViewPOS = role === "Admin" || role === "Manager" || role === "Cashier";
  const canViewInventory = role === "Admin" || role === "Manager" || role === "WarehouseStaff";
  const canViewInvoice = role === "Admin" || role === "Manager" || role === "Cashier" || role === "WarehouseStaff";
  
  const canViewAdminSettings = role === "Admin" || role === "Manager";
  const canViewCashierSettings = role === "Cashier";
  const canViewWarehouseSettings = role === "WarehouseStaff";

  const canViewUserManagement = role === "Admin";
  const canViewSystemLog = role === "Admin";

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        headerTitleStyle: { fontWeight: "bold" },
        tabBarActiveTintColor: "#000000",
        tabBarInactiveTintColor: "#525252",
        tabBarStyle: {
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
      {canViewAdminSettings && (
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarLabel: "Cài đặt" }}
        />
      )}
      {canViewCashierSettings && (
        <Tab.Screen
          name="CashierSettings"
          component={CashierSettingsScreen}
          options={{ tabBarLabel: "Cài đặt" }}
        />
      )}
      {canViewWarehouseSettings && (
        <Tab.Screen
          name="WarehouseSettings"
          component={WarehouseSettingsScreen}
          options={{ tabBarLabel: "Cài đặt" }}
        />
      )}
    </Tab.Navigator>
  );
}
