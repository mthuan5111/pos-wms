import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
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
import { useDemoSandboxStore } from "@/store/useDemoSandboxStore";
import DemoResetConfirmModal from "@/components/DemoResetConfirmModal";
import DemoExperienceGuideModal from "@/components/DemoExperienceGuideModal";
import { isDemoRole } from "@/utils/roleUtils";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  const user = useAuthStore(state => state.user);
  const role = user?.role || "";
  const isDesktop = useIsDesktop();

  useSyncCoordinator();

  const isDemo = isDemoRole(role);
  const canViewDashboard = role === "Admin" || role === "Manager" || isDemo;
  const canViewPOS = role === "Admin" || role === "Manager" || role === "Cashier" || isDemo;
  const canViewInventory = role === "Admin" || role === "Manager" || role === "WarehouseStaff" || isDemo;
  const canViewInvoice = role === "Admin" || role === "Manager" || role === "Cashier" || role === "WarehouseStaff" || isDemo;
  const canViewStatistics = role === "Admin" || role === "Manager" || role === "Cashier" || isDemo;
  const canViewUserManagement = role === "Admin";
  const canViewSystemLog = role === "Admin";

  const setGuideModalVisible = useDemoSandboxStore(state => state.setGuideModalVisible);
  const setResetModalVisible = useDemoSandboxStore(state => state.setResetModalVisible);
  const isGuideModalVisible = useDemoSandboxStore(state => state.isGuideModalVisible);
  const isResetModalVisible = useDemoSandboxStore(state => state.isResetModalVisible);
  const initDemoSession = useDemoSandboxStore(state => state.initSession);

  React.useEffect(() => {
    if (isDemo) {
      initDemoSession();
    }
  }, [isDemo]);

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      {isDemo && (
        <View
          style={{
            backgroundColor: "#0f172a",
            paddingVertical: 8,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 2,
            borderBottomColor: "#38bdf8",
            zIndex: 9999,
            marginLeft: isDesktop ? 240 : 0,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 220 }}>
            <Ionicons name="information-circle" size={18} color="#38bdf8" style={{ marginRight: 8 }} />
            <Text style={{ color: "#f8fafc", fontSize: 11, fontWeight: "700", flex: 1 }}>
              Bạn đang sử dụng chế độ trải nghiệm. Các thao tác thử nghiệm không ảnh hưởng dữ liệu chính.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              testID="demo-banner-guide-btn"
              onPress={() => setGuideModalVisible(true)}
              style={{
                backgroundColor: '#38bdf8',
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 2,
              }}
            >
              <Text style={{ color: '#0f172a', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                Hướng dẫn
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="demo-banner-reset-btn"
              onPress={() => setResetModalVisible(true)}
              style={{
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: '#94a3b8',
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 2,
              }}
            >
              <Text style={{ color: '#f8fafc', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                Làm mới
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
      {isDemo && (
        <>
          <DemoResetConfirmModal
            visible={isResetModalVisible}
            onClose={() => setResetModalVisible(false)}
          />
          <DemoExperienceGuideModal
            visible={isGuideModalVisible}
            onClose={() => setGuideModalVisible(false)}
          />
        </>
      )}
    </View>
  );
}
