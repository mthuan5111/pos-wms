import { useModalStore } from '@/store/useModalStore';
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  getDBConnection,
  LocalSupplierRow,
} from "@/database/db";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import apiClient from "@/services/apiClient";
import { useAuthStore } from "@/store/authStore";
import { parseApiError } from "@/utils/errorParser";
import { useCacheInvalidationStore } from "@/store/useCacheInvalidationStore";
import { createSupplier, updateSupplier, deleteSupplier, parseEntityId } from "@/services/supplierApi";

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<LocalSupplierRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    phone: "",
    contactPerson: "",
    address: ""
  });
  const [supplierErrors, setSupplierErrors] = useState<{ name?: string; phone?: string }>({});
  const isSubmittingRef = React.useRef(false);

  const { user } = useAuthStore();
  const role = user?.role || "";
  const canManageSuppliers = ["Admin", "Manager"].includes(role);

  const invalidateSupplier = useCacheInvalidationStore(s => s.invalidateSupplier);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const db = await getDBConnection();
      const rows = await db.getAllAsync<LocalSupplierRow>("SELECT * FROM LocalSuppliers");
      setSuppliers(rows || []);
    } catch (error) {
      console.warn("[Inventory] Lỗi tải dữ liệu nhà cung cấp:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery) return suppliers;
    const lowerQuery = searchQuery.toLowerCase();
    return suppliers.filter(s =>
      (s.Name && s.Name.toLowerCase().includes(lowerQuery)) ||
      (s.Phone && s.Phone.includes(searchQuery)) ||
      (s.ContactPerson && s.ContactPerson.toLowerCase().includes(lowerQuery))
    );
  }, [suppliers, searchQuery]);

  const handleOpenAdd = () => {
    setFormData({ id: "", name: "", phone: "", contactPerson: "", address: "" });
    setSupplierErrors({});
    setIsEditing(false);
    setIsModalVisible(true);
  };

  const handleOpenEdit = (sup: LocalSupplierRow) => {
    setFormData({
      id: sup.Id.toString(),
      name: sup.Name,
      phone: sup.Phone || "",
      contactPerson: sup.ContactPerson || "",
      address: sup.Address || ""
    });
    setSupplierErrors({});
    setIsEditing(true);
    setIsModalVisible(true);
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current || isLoading) return;

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setSupplierErrors({ name: "Vui lòng nhập tên nhà cung cấp." });
      return;
    }

    const normName = trimmedName.toLowerCase();
    const isDuplicate = suppliers.some(s => s.Name.toLowerCase() === normName && (!isEditing || s.Id.toString() !== formData.id));
    if (isDuplicate) {
      setSupplierErrors({ name: "Tên nhà cung cấp đã tồn tại." });
      return;
    }

    if (formData.phone && formData.phone.trim().length > 0) {
      const phoneClean = formData.phone.trim();
      const phoneRegex = /^(0|\+84)[0-9]{9,10}$/;
      if (!phoneRegex.test(phoneClean)) {
        setSupplierErrors({ phone: "Số điện thoại không đúng định dạng (10 số bắt đầu bằng 0)." });
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsLoading(true);
    try {
      const payload = {
        name: trimmedName,
        phone: formData.phone ? formData.phone.trim() : "",
        contactPerson: formData.contactPerson ? formData.contactPerson.trim() : "",
        address: formData.address ? formData.address.trim() : ""
      };

      let resolvedId: number;

      if (isEditing) {
        resolvedId = parseInt(formData.id, 10);
        await updateSupplier(resolvedId, payload);
      } else {
        const res = await createSupplier(payload);
        const parsed = parseEntityId(res);
        if (parsed === null || parsed === undefined) {
          throw new Error("Máy chủ phản hồi nhưng không thể phân tích mã nhà cung cấp mới.");
        }
        resolvedId = parsed;
      }

      const db = await getDBConnection();
      if (isEditing) {
        await db.runAsync(
          "UPDATE LocalSuppliers SET Name = ?, Phone = ?, ContactPerson = ?, Address = ? WHERE Id = ?",
          [payload.name, payload.phone, payload.contactPerson, payload.address, resolvedId]
        );
      } else {
        await db.runAsync(
          "INSERT OR REPLACE INTO LocalSuppliers (Id, Name, Phone, ContactPerson, Address) VALUES (?, ?, ?, ?, ?)",
          [resolvedId, payload.name, payload.phone, payload.contactPerson, payload.address]
        );
      }

      invalidateSupplier();
      setIsModalVisible(false);
      setFormData({ id: "", name: "", phone: "", contactPerson: "", address: "" });
      setSupplierErrors({});

      useModalStore.getState().showModal({
        title: "Thành công",
        message: isEditing ? "Đã cập nhật nhà cung cấp!" : "Đã thêm nhà cung cấp!",
        type: "success"
      });

      await loadData();
    } catch (e: any) {
      const errMsg = (e.response?.data?.message || e.message || '').toString();
      if (errMsg.toLowerCase().includes('tên') || errMsg.toLowerCase().includes('tồn tại') || e.response?.status === 409) {
        setSupplierErrors({ name: "Tên nhà cung cấp đã tồn tại." });
      } else {
        const apiError = parseApiError(e);
        useModalStore.getState().showModal({
          title: apiError.title || "Lỗi",
          message: apiError.message || "Không thể lưu nhà cung cấp",
          type: "error"
        });
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleDeleteSupplier = (sup: LocalSupplierRow) => {
    useModalStore.getState().showModal({
      title: "Xác nhận xóa",
      message: `Bạn có chắc chắn muốn xóa nhà cung cấp ${sup.Name}?`,
      type: "confirm",
      destructive: true,
      onConfirm: async () => {
        try {
          useModalStore.getState().setLoading(true);
          await deleteSupplier(sup.Id);
          const db = await getDBConnection();
          await db.runAsync("DELETE FROM LocalSuppliers WHERE Id = ?", [sup.Id]);
          invalidateSupplier();
          await loadData();
          useModalStore.getState().showModal({ title: "Thành công", message: "Đã xóa nhà cung cấp", type: "success" });
        } catch (e: any) {
          const apiError = parseApiError(e);
          useModalStore.getState().showModal({
            title: "Ngừng sử dụng",
            message: "Nhà cung cấp đã phát sinh phiếu nhập hoặc chứng từ liên kết nên không thể xóa vĩnh viễn. Bạn có muốn chuyển sang trạng thái Ngừng sử dụng?",
            type: "confirm",
            destructive: true,
            confirmText: "Ngừng sử dụng",
            onConfirm: async () => {
              try {
                await apiClient.put(`/Suppliers/${sup.Id}/deactivate`, { reason: "Ngừng sử dụng theo yêu cầu quản trị" });
                invalidateSupplier();
                await loadData();
                useModalStore.getState().showModal({
                  title: "Thành công",
                  message: `Đã ngừng sử dụng nhà cung cấp "${sup.Name}".`,
                  type: "success"
                });
              } catch (deactErr: any) {
                useModalStore.getState().showModal({
                  title: "Lỗi",
                  message: deactErr.response?.data?.message || "Không thể ngừng sử dụng nhà cung cấp.",
                  type: "error"
                });
              }
            }
          });
        }
      }
    });
  };

  return (
    <View className="flex-1 bg-white relative">
      <View className="flex-col border-b-2 border-black p-4">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
              <Ionicons name="business-outline" size={24} color="#000" />
              <Text className="font-bold text-black ml-2 uppercase tracking-widest" style={{ fontSize: 16 }}>
                  Quản lý Nhà Cung Cấp
              </Text>
          </View>
          <Text className="text-black font-bold" style={{ fontSize: 12 }}>Tổng: {filteredSuppliers.length}</Text>
        </View>
        <CustomInput
          label="Tìm kiếm"
          accessibilityLabel="Tìm kiếm nhà cung cấp"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredSuppliers}
        keyExtractor={(item) => item.Id.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshing={isLoading}
        onRefresh={loadData}
        renderItem={({ item }) => (
          <View className="border-2 border-black p-4 mb-4 bg-white">
            <View className="flex-row justify-between items-start mb-2">
              <Text className="font-bold text-lg text-black flex-1 mr-2">{item.Name}</Text>
              <View className="flex-row">
                {canManageSuppliers && (
                  <>
                    <TouchableOpacity onPress={() => handleOpenEdit(item)} className="bg-white border-2 border-black h-8 w-8 items-center justify-center mr-2">
                      <Ionicons name="pencil" size={14} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteSupplier(item)} className="bg-black h-8 w-8 items-center justify-center">
                      <Ionicons name="trash-outline" size={14} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            <View className="flex-row items-center mb-1">
              <Ionicons name="person" size={14} color="#525252" style={{ width: 20 }} />
              <Text className="text-gray-700">{item.ContactPerson || "-"}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="call" size={14} color="#525252" style={{ width: 20 }} />
              <Text className="text-gray-700">{item.Phone || "-"}</Text>
            </View>
            <View className="flex-row items-start">
              <Ionicons name="location" size={14} color="#525252" style={{ width: 20, marginTop: 2 }} />
              <Text className="text-gray-700 flex-1">{item.Address || "-"}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="business-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black mb-4">Chưa có nhà cung cấp.</Text>
            {canManageSuppliers && (
              <CustomButton title="THÊM NHÀ CUNG CẤP" onPress={handleOpenAdd} />
            )}
          </View>
        }
      />

      {canManageSuppliers && (
        <TouchableOpacity
          testID="add-supplier-fab"
          accessibilityLabel="Thêm nhà cung cấp"
          onPress={handleOpenAdd}
          className="absolute right-6 w-14 h-14 bg-black border-2 border-black items-center justify-center"
          style={{
            bottom: 85,
            shadowColor: "#000",
            shadowOffset: { width: 4, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 5
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={isModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2 flex-col" style={{ maxHeight: '90%' }}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-black text-black" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>
                {isEditing ? "Chỉnh Sửa Nhà Cung Cấp" : "Thêm Nhà Cung Cấp"}
              </Text>
              <TouchableOpacity testID="close-supplier-modal" accessibilityLabel="close-supplier-modal" onPress={() => setIsModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center">
                  <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 10 }}>
              <View className="mb-3">
                  <CustomInput
                    label="Tên nhà cung cấp *"
                    testID="supplier-name-input"
                    value={formData.name}
                    error={supplierErrors.name}
                    onChangeText={(t) => {
                      setFormData({...formData, name: t});
                      if (supplierErrors.name) setSupplierErrors({...supplierErrors, name: undefined});
                    }}
                  />
              </View>
              <View className="mb-3">
                  <CustomInput
                    label="Người liên hệ"
                    testID="supplier-contact-input"
                    value={formData.contactPerson}
                    onChangeText={(t) => setFormData({...formData, contactPerson: t})}
                  />
              </View>
              <View className="mb-3">
                  <CustomInput
                    label="Số điện thoại"
                    testID="supplier-phone-input"
                    keyboardType="phone-pad"
                    value={formData.phone}
                    error={supplierErrors.phone}
                    onChangeText={(t) => {
                      setFormData({...formData, phone: t});
                      if (supplierErrors.phone) setSupplierErrors({...supplierErrors, phone: undefined});
                    }}
                  />
              </View>
              <View className="mb-3">
                  <CustomInput
                    label="Địa chỉ"
                    testID="supplier-address-input"
                    value={formData.address}
                    onChangeText={(t) => setFormData({...formData, address: t})}
                  />
              </View>
            </ScrollView>

            <View className="flex-row mt-4 pt-2 border-t border-gray-200">
              <View className="flex-1 mr-2">
                  <TouchableOpacity onPress={() => setIsModalVisible(false)} className="h-12 border-2 border-black items-center justify-center bg-white" disabled={isLoading}>
                      <Text className="font-bold text-black uppercase">Hủy</Text>
                  </TouchableOpacity>
              </View>
              <View className="flex-1 ml-2">
                  <CustomButton testID="submit-supplier-btn" accessibilityLabel="submit-supplier-btn" title={isEditing ? "LƯU THAY ĐỔI" : "THÊM NHÀ CUNG CẤP"} onPress={handleSubmit} loading={isLoading} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
