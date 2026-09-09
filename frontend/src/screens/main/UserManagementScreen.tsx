import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getUsers, toggleUserStatus, createUser, updateUser, deleteUser, resetUserPassword } from "@/services/userApi";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";

export default function UserManagementScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Add Modal State
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    name: "",
    password: "",
    role: "Cashier",
    phone: ""
  });

  // Edit Modal State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number; name: string; role: string; phone?: string; newPassword?: string } | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await getUsers();
      if (res.isSuccess) {
        setUsers(res.data);
      }
    } catch (error) {
      console.error("[Admin] Lỗi lấy danh sách tài khoản:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [])
  );

  const handleToggleStatus = async (userItem: any) => {
    const action = userItem.isActive ? "khóa" : "mở khóa";
    if (Platform.OS === 'web') {
      if (window.confirm(`Bạn có chắc muốn ${action} tài khoản ${userItem.username}?`)) {
        executeToggle(userItem);
      }
    } else {
      Alert.alert("Xác nhận", `Bạn có chắc muốn ${action} tài khoản ${userItem.username}?`, [
        { text: "Hủy", style: "cancel" },
        { text: "Đồng ý", onPress: () => executeToggle(userItem) }
      ]);
    }
  };

  const executeToggle = async (userItem: any) => {
    try {
      setIsLoading(true);
      await toggleUserStatus(userItem.id);
      await loadUsers();
    } catch (e) {
      if (Platform.OS === 'web') window.alert("Không thể thay đổi trạng thái.");
      else Alert.alert("Lỗi", "Không thể thay đổi trạng thái.");
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userItem: any) => {
    if (userItem.username.toLowerCase() === 'admin') {
      if (Platform.OS === 'web') window.alert("Không thể xóa tài khoản admin hệ thống.");
      else Alert.alert("Lỗi", "Không thể xóa tài khoản admin hệ thống.");
      return;
    }
    
    const confirmMsg = `Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản ${userItem.username}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        executeDelete(userItem.id);
      }
    } else {
      Alert.alert("Cảnh báo", confirmMsg, [
        { text: "Hủy", style: "cancel" },
        { text: "Xóa", style: "destructive", onPress: () => executeDelete(userItem.id) }
      ]);
    }
  };

  const executeDelete = async (id: number) => {
    try {
      setIsLoading(true);
      await deleteUser(id);
      await loadUsers();
    } catch (e) {
      if (Platform.OS === 'web') window.alert("Không thể xóa tài khoản.");
      else Alert.alert("Lỗi", "Không thể xóa tài khoản.");
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.name || !newUser.password) {
      if (Platform.OS === 'web') window.alert("Vui lòng nhập đủ thông tin bắt buộc.");
      else Alert.alert("Lỗi", "Vui lòng nhập đủ thông tin bắt buộc.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await createUser({
        username: newUser.username,
        name: newUser.name,
        password: newUser.password,
        role: newUser.role,
        phone: newUser.phone
      });
      if (res.isSuccess) {
        setIsAddModalVisible(false);
        setNewUser({ username: "", name: "", password: "", role: "Cashier", phone: "" });
        await loadUsers();
      } else {
        if (Platform.OS === 'web') window.alert(res.message || "Không thể tạo tài khoản.");
        else Alert.alert("Lỗi", res.message || "Không thể tạo tài khoản.");
      }
    } catch (error) {
      if (Platform.OS === 'web') window.alert("Đã có lỗi xảy ra khi tạo tài khoản.");
      else Alert.alert("Lỗi", "Đã có lỗi xảy ra khi tạo tài khoản.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEdit = (userItem: any) => {
    setEditingUser({
      id: userItem.id,
      name: userItem.name,
      role: userItem.role,
      phone: userItem.phone || "",
      newPassword: ""
    });
    setIsEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editingUser.name) {
      if (Platform.OS === 'web') window.alert("Vui lòng điền tên hiển thị.");
      else Alert.alert("Lỗi", "Vui lòng điền tên hiển thị.");
      return;
    }
    setIsLoading(true);
    try {
      await updateUser(editingUser.id, {
        name: editingUser.name,
        role: editingUser.role,
        phone: editingUser.phone
      });

      if (editingUser.newPassword && editingUser.newPassword.trim().length > 0) {
        await resetUserPassword(editingUser.id, editingUser.newPassword.trim());
      }

      setIsEditModalVisible(false);
      setEditingUser(null);
      await loadUsers();
      if (Platform.OS === 'web') window.alert("Cập nhật tài khoản thành công!");
      else Alert.alert("Thành công", "Cập nhật tài khoản thành công!");
    } catch (e) {
      if (Platform.OS === 'web') window.alert("Lỗi khi cập nhật tài khoản.");
      else Alert.alert("Lỗi", "Không thể cập nhật tài khoản.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-5 pb-4 bg-white border-b-4 border-black mb-4">
        <View className="flex-row justify-between items-center mb-1">
          <View>
            <Text style={{ fontFamily: 'serif', fontSize: 32, fontWeight: '900', color: '#000', letterSpacing: -1, textTransform: 'uppercase' }}>
              Tài khoản
            </Text>
            <Text className="mt-1" style={{ fontSize: 11, letterSpacing: 4, color: '#525252', textTransform: 'uppercase' }}>
              Quản trị người dùng
            </Text>
          </View>
          <TouchableOpacity onPress={() => setIsAddModalVisible(true)} className="w-12 h-12 bg-black items-center justify-center">
            <Ionicons name="person-add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadUsers} />}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View className={`bg-white p-4 mb-4 border-2 border-black ${!item.isActive ? 'opacity-60 bg-gray-50' : ''}`}>
            <View className="flex-row justify-between items-center mb-2 pb-2 border-b-2 border-black">
              <View className="flex-row items-center flex-1 mr-2">
                <Ionicons name="person-circle" size={28} color="#000" />
                <View className="ml-2 flex-1">
                  <Text className="font-bold text-base text-black" numberOfLines={1}>{item.name}</Text>
                  <Text className="text-xs text-gray-500 font-mono">@{item.username}</Text>
                </View>
              </View>
              <View className="bg-black px-2.5 py-1">
                <Text className="text-white font-bold text-xs uppercase tracking-wider">{item.role}</Text>
              </View>
            </View>
            
            <View className="flex-row justify-between items-center mt-2">
              <View>
                <Text className="text-xs text-gray-600">SĐT: {item.phone || "Chưa cập nhật"}</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs font-bold uppercase mr-2 text-black">{item.isActive ? 'Hoạt động' : 'Đã khóa'}</Text>
                <Switch 
                  value={item.isActive} 
                  onValueChange={() => handleToggleStatus(item)}
                  trackColor={{ false: "#e5e7eb", true: "#000" }} 
                  thumbColor={"#fff"}
                />
              </View>
            </View>

            <View className="flex-row justify-end mt-3 pt-3 border-t border-dashed border-gray-300 gap-2">
              <TouchableOpacity className="flex-row items-center border border-black px-3 py-1.5 bg-white" onPress={() => handleOpenEdit(item)}>
                <Ionicons name="create-outline" size={14} color="#000" />
                <Text className="text-xs font-bold uppercase text-black ml-1">Sửa</Text>
              </TouchableOpacity>

              {item.username.toLowerCase() !== 'admin' && (
                <TouchableOpacity className="flex-row items-center border border-red-600 bg-red-50 px-3 py-1.5" onPress={() => handleDeleteUser(item)}>
                  <Ionicons name="trash-outline" size={14} color="#dc2626" />
                  <Text className="text-xs font-bold uppercase text-red-600 ml-1">Xóa</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center mt-20">
              <Ionicons name="people-outline" size={48} color="#525252" />
              <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
              <Text className="font-bold text-lg text-black">Không có dữ liệu tài khoản</Text>
            </View>
          ) : <ActivityIndicator size="large" color="#000" className="mt-20" />
        }
      />

      {/* Add User Modal */}
      <Modal visible={isAddModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-black text-black text-base uppercase tracking-wider">Thêm tài khoản mới</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center">
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            
            <CustomInput label="Tên đăng nhập" placeholder="VD: nguyenvan_a" value={newUser.username} onChangeText={(t) => setNewUser({...newUser, username: t})} />
            <CustomInput label="Họ và tên" placeholder="VD: Nguyễn Văn A" value={newUser.name} onChangeText={(t) => setNewUser({...newUser, name: t})} />
            <CustomInput label="Mật khẩu" placeholder="Nhập mật khẩu..." secureTextEntry value={newUser.password} onChangeText={(t) => setNewUser({...newUser, password: t})} />
            <CustomInput label="Số điện thoại" placeholder="VD: 0912345678" value={newUser.phone} onChangeText={(t) => setNewUser({...newUser, phone: t})} />
            
            <View className="mb-4">
              <Text className="text-xs font-bold text-black uppercase tracking-widest mb-2 border-b-2 border-black pb-1">Vai trò hệ thống</Text>
              <View className="flex-row flex-wrap">
                {["Manager", "Cashier", "WarehouseStaff", "Admin"].map(role => (
                  <TouchableOpacity 
                    key={role} 
                    onPress={() => setNewUser({...newUser, role})}
                    className={`border-2 border-black px-3 py-1.5 mr-2 mb-2 ${newUser.role === role ? 'bg-black' : 'bg-white'}`}
                  >
                    <Text className={`font-bold text-xs uppercase ${newUser.role === role ? 'text-white' : 'text-black'}`}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <CustomButton title="Tạo tài khoản mới →" onPress={handleAddUser} loading={isLoading} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={isEditModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-black text-black text-base uppercase tracking-wider">Cập nhật tài khoản</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center">
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            {editingUser && (
              <>
                <CustomInput label="Họ và tên" value={editingUser.name} onChangeText={(t) => setEditingUser({...editingUser, name: t})} />
                <CustomInput label="Số điện thoại" value={editingUser.phone || ""} onChangeText={(t) => setEditingUser({...editingUser, phone: t})} />
                <CustomInput label="Mật khẩu mới (Bỏ trống nếu không đổi)" placeholder="Nhập mật khẩu mới..." secureTextEntry value={editingUser.newPassword || ""} onChangeText={(t) => setEditingUser({...editingUser, newPassword: t})} />

                <View className="mb-4">
                  <Text className="text-xs font-bold text-black uppercase tracking-widest mb-2 border-b-2 border-black pb-1">Vai trò hệ thống</Text>
                  <View className="flex-row flex-wrap">
                    {["Manager", "Cashier", "WarehouseStaff", "Admin"].map(role => (
                      <TouchableOpacity 
                        key={role} 
                        onPress={() => setEditingUser({...editingUser, role})}
                        className={`border-2 border-black px-3 py-1.5 mr-2 mb-2 ${editingUser.role === role ? 'bg-black' : 'bg-white'}`}
                      >
                        <Text className={`font-bold text-xs uppercase ${editingUser.role === role ? 'text-white' : 'text-black'}`}>{role}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <CustomButton title="Lưu thông tin →" onPress={handleSaveEdit} loading={isLoading} />
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
