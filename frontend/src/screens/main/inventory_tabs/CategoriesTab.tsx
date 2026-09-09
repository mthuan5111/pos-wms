import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  getLocalCategories,
  LocalCategoryRow,
  insertLocalCategory,
  deleteLocalCategory,
} from "@/database/db";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import apiClient from "@/services/apiClient";
import { useAuthStore } from "@/store/authStore";

interface Category extends LocalCategoryRow {}

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });

  const { user } = useAuthStore();
  const role = user?.role || "";
  const canManageCategories = ["Admin", "Manager"].includes(role);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const categoriesData = await getLocalCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error("[Inventory] Lỗi tải dữ liệu danh mục:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleAddCategory = async () => {
    if (!newCategory.name) {
      if (Platform.OS !== "web") Alert.alert("Lỗi", "Vui lòng nhập tên danh mục");
      else window.alert("Lỗi: Vui lòng nhập tên danh mục");
      return;
    }
    
    setIsLoading(true);
    try {
      const payload = {
        name: newCategory.name,
        description: newCategory.description || "",
      };
      // Send to server
      const createRes = await apiClient.post("/Categories", payload);
      const serverId = createRes.data.data;
      
      // Save locally
      await insertLocalCategory(serverId, payload.name, payload.description);
      
      setIsAddModalVisible(false);
      setNewCategory({ name: "", description: "" });
      
      if (Platform.OS === "web") window.alert("Đã thêm danh mục thành công!");
      else Alert.alert("Thành công", "Đã thêm danh mục thành công!");
      
      await loadData();
    } catch (e) {
      if (Platform.OS !== "web") Alert.alert("Lỗi", "Không thể tạo danh mục mới. Vui lòng kiểm tra kết nối mạng.");
      else window.alert("Không thể tạo danh mục mới. Vui lòng kiểm tra kết nối mạng.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const confirmDelete = async () => {
      setIsLoading(true);
      try {
        await apiClient.delete(`/Categories/${cat.Id}`);
        await deleteLocalCategory(cat.Id);
        await loadData();
      } catch (e) {
        if (Platform.OS === 'web') window.alert("Lỗi xóa danh mục (có thể do danh mục đang chứa sản phẩm)");
        else Alert.alert("Lỗi", "Không thể xóa danh mục");
      } finally {
        setIsLoading(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Bạn có chắc chắn muốn xóa danh mục ${cat.Name}?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Xác nhận xóa",
        `Bạn có chắc chắn muốn xóa danh mục ${cat.Name}?`,
        [
          { text: "Hủy", style: "cancel" },
          { text: "Xóa", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  return (
    <View className="flex-1 bg-white relative">
      <View className="flex-row items-center p-4 border-b-2 border-black justify-between">
        <View className="flex-row items-center">
            <Ionicons name="folder-open-outline" size={24} color="#000" />
            <Text className="font-bold text-black ml-2 uppercase tracking-widest" style={{ fontSize: 16 }}>
                Quản lý Danh mục
            </Text>
        </View>
        <Text className="text-black font-bold" style={{ fontSize: 12 }}>Tổng: {categories.length}</Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.Id.toString()}
        contentContainerStyle={{ padding: 16 }}
        refreshing={isLoading}
        onRefresh={loadData}
        renderItem={({ item }) => (
          <View className="flex-row border-2 border-black p-4 mb-4 items-center bg-white">
            <View className="flex-1">
              <Text className="font-bold text-lg text-black mb-1">{item.Name}</Text>
              <Text className="text-gray-600" style={{ fontSize: 12 }}>Mã ID: {item.Id}</Text>
              {item.Description ? (
                  <Text className="text-black mt-2 italic">{item.Description}</Text>
              ) : null}
            </View>
            
            {canManageCategories && (
              <TouchableOpacity onPress={() => handleDeleteCategory(item)} className="bg-black h-10 w-10 items-center justify-center ml-4">
                <Ionicons name="trash-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="folder-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black">Chưa có danh mục nào</Text>
          </View>
        }
      />

      {canManageCategories && (
        <TouchableOpacity 
          onPress={() => setIsAddModalVisible(true)}
          className="absolute bottom-6 right-6 w-16 h-16 bg-black border-2 border-black items-center justify-center"
          style={{
            shadowColor: "#000", shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 5
          }}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add Modal */}
      <Modal visible={isAddModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-black text-black" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>Thêm Danh Mục</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center">
                  <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            
            <View className="mb-4">
                <CustomInput label="Tên danh mục *" placeholder="VD: Nước giải khát" value={newCategory.name} onChangeText={(t) => setNewCategory({...newCategory, name: t})} />
            </View>
            <View className="mb-6">
                <CustomInput label="Mô tả (Tùy chọn)" placeholder="Mô tả danh mục..." value={newCategory.description} onChangeText={(t) => setNewCategory({...newCategory, description: t})} />
            </View>

            <CustomButton title="Thêm danh mục →" onPress={handleAddCategory} loading={isLoading} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
