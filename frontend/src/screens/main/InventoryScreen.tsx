import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";

import ProductsTab from "./inventory_tabs/ProductsTab";
import CategoriesTab from "./inventory_tabs/CategoriesTab";

type TabType = "products" | "categories";

export default function InventoryScreen() {
  const [activeTab, setActiveTab] = useState<TabType>("products");
  const { user } = useAuthStore();
  const role = user?.role || "";

  const renderTabContent = () => {
    switch (activeTab) {
      case "products":
        return <ProductsTab />;
      case "categories":
        return <CategoriesTab />;
      default:
        return <ProductsTab />;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header Section */}
      <View className="px-6 pt-5 pb-4 bg-white border-b-4 border-black">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text style={{ fontFamily: 'serif', fontSize: 36, fontWeight: '900', color: '#000', letterSpacing: -1, textTransform: 'uppercase' }}>
              Quản lý kho
            </Text>
            <Text className="mt-1" style={{ fontSize: 11, letterSpacing: 4, color: '#525252', textTransform: 'uppercase' }}>
              Phân hệ WMS
            </Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View className="flex-row border-b-2 border-black mt-2">
          <TouchableOpacity 
            onPress={() => setActiveTab("products")}
            className={`flex-1 items-center pb-2 ${activeTab === "products" ? "border-b-4 border-black" : ""}`}
          >
            <Text className={`font-bold uppercase tracking-widest text-xs ${activeTab === "products" ? "text-black" : "text-gray-400"}`}>
              Sản phẩm
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab("categories")}
            className={`flex-1 items-center pb-2 ${activeTab === "categories" ? "border-b-4 border-black" : ""}`}
          >
            <Text className={`font-bold uppercase tracking-widest text-xs ${activeTab === "categories" ? "text-black" : "text-gray-400"}`}>
              Danh mục
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      <View className="flex-1 bg-white">
        {renderTabContent()}
      </View>
    </SafeAreaView>
  );
}
