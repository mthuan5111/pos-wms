import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { useRoute } from "@react-navigation/native";

import ProductsTab from "./inventory_tabs/ProductsTab";
import CategoriesTab from "./inventory_tabs/CategoriesTab";
import SuppliersTab from "./inventory_tabs/SuppliersTab";


type TabType = "products" | "categories" | "suppliers";

export default function InventoryScreen() {
  const route = useRoute<any>();
  const [activeTab, setActiveTab] = useState<TabType>(route?.params?.tab || "products");
  const { user } = useAuthStore();
  const role = user?.role || "";

  React.useEffect(() => {
    if (route?.params?.tab) {
      setActiveTab(route.params.tab);
    }
  }, [route?.params?.tab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "products":
        return (
          <ProductsTab
            initialSearch={route?.params?.search}
            targetProductId={route?.params?.targetProductId}
            targetBarcode={route?.params?.targetBarcode}
            focusField={route?.params?.focusField}
          />
        );
      case "categories":
        return <CategoriesTab />;
      case "suppliers":
        return <SuppliersTab />;
      default:
        return (
          <ProductsTab
            initialSearch={route?.params?.search}
            targetProductId={route?.params?.targetProductId}
            targetBarcode={route?.params?.targetBarcode}
            focusField={route?.params?.focusField}
          />
        );
    }
  };

  return (
    <SafeAreaView testID="inventory-screen" className="flex-1 bg-white">
      {/* Header Section */}
      <View className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 bg-white border-b-4 border-black">
        <View className="flex-row justify-between items-center mb-2">
          <View>
            <Text className="font-serif text-2xl sm:text-3xl font-black text-black tracking-tight uppercase">
              Quản lý kho
            </Text>
            <Text className="mt-0.5 text-[10px] sm:text-[11px] tracking-widest text-neutral-600 uppercase">
              Phân hệ WMS
            </Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View className="flex-row border-b-2 border-black mt-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, flexDirection: 'row' }}>
            <TouchableOpacity
              testID="tab-products"
              onPress={() => setActiveTab("products")}
              className={`flex-1 min-w-[90px] items-center pb-2.5 ${activeTab === "products" ? "border-b-4 border-black" : ""}`}
            >
              <Text className={`font-black uppercase tracking-wider text-xs ${activeTab === "products" ? "text-black" : "text-gray-400"}`}>
                Sản phẩm
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tab-categories"
              onPress={() => setActiveTab("categories")}
              className={`flex-1 min-w-[90px] items-center pb-2.5 ${activeTab === "categories" ? "border-b-4 border-black" : ""}`}
            >
              <Text className={`font-black uppercase tracking-wider text-xs ${activeTab === "categories" ? "text-black" : "text-gray-400"}`}>
                Danh mục
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tab-suppliers"
              onPress={() => setActiveTab("suppliers")}
              className={`flex-1 min-w-[110px] items-center pb-2.5 ${activeTab === "suppliers" ? "border-b-4 border-black" : ""}`}
            >
              <Text className={`font-black uppercase tracking-wider text-xs ${activeTab === "suppliers" ? "text-black" : "text-gray-400"}`}>
                Nhà cung cấp
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="flex-1 bg-white">
        {renderTabContent()}
      </View>
    </SafeAreaView>
  );
}
