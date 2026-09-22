import { useModalStore } from "@/store/useModalStore";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  getLocalCategories,
  LocalCategoryRow,
  insertLocalCategory,
  deleteLocalCategory,
  getDBConnection,
} from "@/database/db";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import apiClient from "@/services/apiClient";
import { useAuthStore } from "@/store/authStore";
import { parseApiError } from "@/utils/errorParser";
import { useCacheInvalidationStore } from "@/store/useCacheInvalidationStore";

interface Category extends LocalCategoryRow {}

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ id: 0, name: "", description: "" });
  const [categoryErrors, setCategoryErrors] = useState<{ name?: string }>({});
  const isSavingRef = React.useRef(false);

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

  const openAddModal = () => {
    setIsEditing(false);
    setFormData({ id: 0, name: "", description: "" });
    setCategoryErrors({});
    setIsModalVisible(true);
  };

  const openEditModal = (cat: Category) => {
    setIsEditing(true);
    setFormData({ id: cat.Id, name: cat.Name, description: cat.Description || "" });
    setCategoryErrors({});
    setIsModalVisible(true);
  };

  const handleSaveCategory = async () => {
    if (isSavingRef.current || isLoading) return;

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setCategoryErrors({ name: "Vui lòng nhập tên danh mục." });
      return;
    }

    const normName = trimmedName.toLowerCase();
    const isDuplicate = categories.some(c => c.Name.toLowerCase() === normName && (!isEditing || c.Id !== formData.id));
    if (isDuplicate) {
      setCategoryErrors({ name: "Tên danh mục đã tồn tại." });
      return;
    }

    isSavingRef.current = true;
    setIsLoading(true);
    try {
      const payload = {
        name: trimmedName,
        description: formData.description.trim(),
      };

      if (isEditing) {
        // Call PUT /api/Categories/{id} (BUG-CAT-002)
        await apiClient.put(`/Categories/${formData.id}`, payload);
        const db = await getDBConnection();
        await db.runAsync(
          "UPDATE LocalCategories SET Name = ?, Description = ? WHERE Id = ?",
          [payload.name, payload.description, formData.id]
        );
      } else {
        // Call POST /api/Categories
        const createRes = await apiClient.post("/Categories", payload);
        const serverId = createRes.data?.data?.id ?? createRes.data?.data;
        const resolvedId = typeof serverId === "number" ? serverId : Number(serverId);
        await insertLocalCategory(resolvedId, payload.name, payload.description);
      }

      setIsModalVisible(false);
      setFormData({ id: 0, name: "", description: "" });
      setCategoryErrors({});

      useModalStore.getState().showModal({
        title: "Thành công",
        message: isEditing ? "Đã cập nhật danh mục thành công!" : "Đã thêm danh mục thành công!",
        type: "success",
      });

      useCacheInvalidationStore.getState().invalidateCategory();
      await loadData();
    } catch (e: any) {
      const errMsg = (e.response?.data?.message || e.message || '').toString();
      if (errMsg.toLowerCase().includes('tồn tại') || e.response?.status === 409) {
        setCategoryErrors({ name: "Tên danh mục đã tồn tại." });
      } else {
        const apiError = parseApiError(e);
        useModalStore.getState().showModal({
          title: apiError.title,
          message: apiError.message,
          type: "error",
        });
      }
    } finally {
      setIsLoading(false);
      isSavingRef.current = false;
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    // Guard against deleting system category (BUG-CAT-004)
    if (cat.IsSystem || cat.Code === "UNCATEGORIZED") {
      useModalStore.getState().showModal({
        title: "Không thể xóa",
        message: "Đây là danh mục mặc định của hệ thống và không thể xóa.",
        type: "error",
      });
      return;
    }

    useModalStore.getState().showModal({
      title: "Xác nhận xóa",
      message: `Bạn có chắc chắn muốn xóa danh mục ${cat.Name}?`,
      type: "confirm",
      destructive: true,
      onConfirm: async () => {
        try {
          useModalStore.getState().setLoading(true);
          await apiClient.delete(`/Categories/${cat.Id}`);
          await deleteLocalCategory(cat.Id);
          useCacheInvalidationStore.getState().invalidateCategory();
          useCacheInvalidationStore.getState().invalidateProduct();
          await loadData();
          useModalStore.getState().showModal({
            title: "Thành công",
            message: "Đã xóa danh mục thành công",
            type: "success",
          });
        } catch (e) {
          const apiError = parseApiError(e);
          useModalStore.getState().showModal({
            title: "Ngừng sử dụng",
            message: "Danh mục đang có sản phẩm liên kết nên không thể xóa vĩnh viễn. Bạn có muốn chuyển sang trạng thái Ngừng sử dụng?",
            type: "confirm",
            destructive: true,
            confirmText: "Ngừng sử dụng",
            onConfirm: async () => {
              try {
                await apiClient.put(`/Categories/${cat.Id}/deactivate`, { reason: "Ngừng sử dụng theo yêu cầu quản trị" });
                useCacheInvalidationStore.getState().invalidateCategory();
                await loadData();
                useModalStore.getState().showModal({
                  title: "Thành công",
                  message: `Đã ngừng sử dụng danh mục "${cat.Name}".`,
                  type: "success"
                });
              } catch (deactErr: any) {
                useModalStore.getState().showModal({
                  title: "Lỗi",
                  message: deactErr.response?.data?.message || "Không thể ngừng sử dụng danh mục.",
                  type: "error"
                });
              }
            }
          });
        }
      },
    });
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
        <Text className="text-black font-bold" style={{ fontSize: 12 }}>
          Tổng: {categories.length}
        </Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.Id.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshing={isLoading}
        onRefresh={loadData}
        renderItem={({ item }) => {
          const isSystemCategory = item.IsSystem || item.Code === "UNCATEGORIZED";
          return (
            <View className="flex-row border-2 border-black p-4 mb-4 items-center bg-white justify-between">
              <View className="flex-1 pr-2">
                <View className="flex-row items-center flex-wrap">
                  <Text className="font-bold text-lg text-black mr-2">{item.Name}</Text>
                  {isSystemCategory && (
                    <View className="bg-gray-200 px-2 py-0.5 border border-black mr-2">
                      <Text className="text-xs font-bold text-black">HỆ THỐNG</Text>
                    </View>
                  )}
                </View>
                <Text className="text-gray-600" style={{ fontSize: 12 }}>
                  Mã ID: {item.Id}
                </Text>
                {item.Description ? (
                  <Text className="text-black mt-2 italic">{item.Description}</Text>
                ) : null}
              </View>

              {canManageCategories && (
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => openEditModal(item)}
                    className="border-2 border-black h-10 w-10 items-center justify-center mr-2 bg-white"
                  >
                    <Ionicons name="create-outline" size={18} color="#000" />
                  </TouchableOpacity>
                  {!isSystemCategory ? (
                    <TouchableOpacity
                      onPress={() => handleDeleteCategory(item)}
                      className="bg-black h-10 w-10 items-center justify-center"
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <View className="bg-gray-100 border border-gray-300 h-10 w-10 items-center justify-center opacity-40">
                      <Ionicons name="lock-closed-outline" size={18} color="#666" />
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="folder-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: "#000", marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black">Chưa có danh mục nào</Text>
          </View>
        }
      />

      {canManageCategories && (
        <TouchableOpacity
          testID="add-category-fab"
          accessibilityLabel="Thêm danh mục"
          onPress={openAddModal}
          className="absolute right-6 w-14 h-14 bg-black border-2 border-black items-center justify-center"
          style={{
            bottom: 85,
            shadowColor: "#000",
            shadowOffset: { width: 4, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 5,
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={isModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-black/70 justify-end sm:justify-center items-center"
        >
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-6">
              <Text
                className="font-black text-black"
                style={{ fontSize: 16, letterSpacing: 1, textTransform: "uppercase" }}
              >
                {isEditing ? "Chỉnh Sửa Danh Mục" : "Thêm Danh Mục"}
              </Text>
              <TouchableOpacity
                testID="close-category-modal"
                accessibilityLabel="close-category-modal"
                onPress={() => setIsModalVisible(false)}
                className="w-8 h-8 border-2 border-black items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <View className="mb-4">
              <CustomInput
                label="Tên danh mục *"
                testID="category-name-input"
                value={formData.name}
                error={categoryErrors.name}
                onChangeText={(t) => {
                  setFormData({ ...formData, name: t });
                  if (categoryErrors.name) setCategoryErrors({});
                }}
              />
            </View>
            <View className="mb-6">
              <CustomInput
                label="Mô tả"
                testID="category-desc-input"
                value={formData.description}
                onChangeText={(t) => setFormData({ ...formData, description: t })}
              />
            </View>

            <CustomButton
              testID="submit-category-btn"
              accessibilityLabel="submit-category-btn"
              title={isEditing ? "Lưu thay đổi →" : "Thêm danh mục →"}
              onPress={handleSaveCategory}
              loading={isLoading}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
