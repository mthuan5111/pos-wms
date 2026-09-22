import { useModalStore } from '@/store/useModalStore';
import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getUsers, toggleUserStatus, createUser, updateUser, deleteUser, resetUserPassword } from "@/services/userApi";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";

export interface UserDto {
  id: number;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  phone?: string;
  createdAt: string;
}

export default function UserManagementScreen() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Add Modal State
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    name: "",
    password: "",
    confirmPassword: "",
    role: "Cashier",
    phone: ""
  });
  const [addUserErrors, setAddUserErrors] = useState<{
    username?: string;
    name?: string;
    password?: string;
    confirmPassword?: string;
    role?: string;
  }>({});
  const isAddingUserRef = React.useRef(false);

  // Edit Modal State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number; username: string; name: string; role: string; phone?: string } | null>(null);
  const [editUserErrors, setEditUserErrors] = useState<{ name?: string }>({});
  const isEditingUserRef = React.useRef(false);

  // Reset Password Modal State (Admin reset target user password)
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserDto | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetPasswordErrors, setResetPasswordErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const isResettingPasswordRef = React.useRef(false);

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
    useModalStore.getState().showModal({
      title: "Xác nhận",
      message: `Bạn có chắc muốn ${action} tài khoản ${userItem.username}?`,
      type: "confirm",
      onConfirm: () => executeToggle(userItem)
    });
  };

  const executeToggle = async (userItem: any) => {
    try {
      setIsLoading(true);
      await toggleUserStatus(userItem.id);
      await loadUsers();
    } catch (e: any) {
      useModalStore.getState().showModal({
        title: "Thông báo",
        message: e.response?.data?.message || "Không thể thay đổi trạng thái.",
        type: "info"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userItem: any) => {
    if (userItem.username === 'admin') {
      useModalStore.getState().showModal({ title: "Lỗi", message: "Không thể xóa tài khoản admin hệ thống.", type: "error" });
      return;
    }
    useModalStore.getState().showModal({
      title: "Cảnh báo",
      message: `Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản ${userItem.username}?`,
      type: "confirm",
      destructive: true,
      confirmText: "Xóa",
      onConfirm: () => executeDelete(userItem.id)
    });
  };

  const executeDelete = async (id: number) => {
    try {
      setIsLoading(true);
      await deleteUser(id);
      await loadUsers();
    } catch (e: any) {
      useModalStore.getState().showModal({
        title: "Thông báo",
        message: e.response?.data?.message || "Không thể xóa tài khoản.",
        type: "info"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (isAddingUserRef.current || isLoading) return;

    const errors: typeof addUserErrors = {};
    const normUsername = newUser.username.trim().toLowerCase();

    if (!newUser.username || newUser.username.trim().length === 0) {
      errors.username = "Tên đăng nhập không được để trống.";
    } else if (users.some(u => u.username.toLowerCase() === normUsername)) {
      errors.username = "Tên đăng nhập đã tồn tại.";
    }

    if (!newUser.name || newUser.name.trim().length === 0) {
      errors.name = "Họ và tên không được để trống.";
    }

    if (!newUser.password || newUser.password.length === 0) {
      errors.password = "Mật khẩu không được để trống.";
    } else if (newUser.password.length < 6) {
      errors.password = "Mật khẩu phải có ít nhất 6 ký tự.";
    }

    if (!newUser.confirmPassword || newUser.confirmPassword.length === 0) {
      errors.confirmPassword = "Vui lòng xác nhận mật khẩu.";
    } else if (newUser.password && newUser.confirmPassword !== newUser.password) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }

    if (!newUser.role) {
      errors.role = "Vui lòng chọn vai trò.";
    }

    setAddUserErrors(errors);
    if (Object.keys(errors).length > 0) return;

    isAddingUserRef.current = true;
    setIsLoading(true);
    try {
      const res = await createUser({
        username: newUser.username.trim(),
        name: newUser.name.trim(),
        password: newUser.password,
        role: newUser.role,
        phone: newUser.phone ? newUser.phone.trim() : ""
      });
      if (res.isSuccess) {
        setIsAddModalVisible(false);
        setNewUser({ username: "", name: "", password: "", confirmPassword: "", role: "Cashier", phone: "" });
        setAddUserErrors({});
        await loadUsers();
        useModalStore.getState().showModal({
          title: "Thành công",
          message: "Tạo tài khoản thành công!",
          type: "success"
        });
      } else {
        const msg = res.message || "Không thể tạo tài khoản.";
        if (res.code === "USERNAME_ALREADY_EXISTS" || msg.toLowerCase().includes("tồn tại")) {
          setAddUserErrors({ username: "Tên đăng nhập đã tồn tại." });
        } else {
          useModalStore.getState().showModal({ title: "Thông báo", message: msg, type: "info" });
        }
      }
    } catch (error: any) {
      const errCode = error.response?.data?.code;
      const errMsg = error.response?.data?.message || "Đã có lỗi xảy ra khi tạo tài khoản.";
      if (errCode === "USERNAME_ALREADY_EXISTS" || errMsg.toLowerCase().includes("tồn tại")) {
        setAddUserErrors({ username: "Tên đăng nhập đã tồn tại." });
      } else {
        useModalStore.getState().showModal({ title: "Thông báo", message: errMsg, type: "info" });
      }
    } finally {
      setIsLoading(false);
      isAddingUserRef.current = false;
    }
  };

  const handleOpenEdit = (userItem: any) => {
    setEditingUser({
      id: userItem.id,
      username: userItem.username,
      name: userItem.name,
      role: userItem.role,
      phone: userItem.phone || ""
    });
    setEditUserErrors({});
    setIsEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (isEditingUserRef.current || isLoading) return;
    if (!editingUser) return;

    const errors: typeof editUserErrors = {};
    if (!editingUser.name || editingUser.name.trim().length === 0) {
      errors.name = "Họ và tên không được để trống.";
    }

    setEditUserErrors(errors);
    if (Object.keys(errors).length > 0) return;

    isEditingUserRef.current = true;
    setIsLoading(true);
    try {
      await updateUser(editingUser.id, {
        name: editingUser.name.trim(),
        role: editingUser.role,
        phone: editingUser.phone ? editingUser.phone.trim() : ""
      });

      setIsEditModalVisible(false);
      setEditingUser(null);
      setEditUserErrors({});
      await loadUsers();
      useModalStore.getState().showModal({ title: "Thành công", message: "Cập nhật tài khoản thành công!", type: "success" });
    } catch (e: any) {
      const errMsg = e.response?.data?.message || "Lỗi khi cập nhật tài khoản.";
      useModalStore.getState().showModal({ title: "Thông báo", message: errMsg, type: "info" });
    } finally {
      setIsLoading(false);
      isEditingUserRef.current = false;
    }
  };

  const handleOpenResetPassword = (userItem: UserDto) => {
    setResetTargetUser(userItem);
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetPasswordErrors({});
    setIsResetModalVisible(true);
  };

  const handleExecuteResetPassword = async () => {
    if (isResettingPasswordRef.current || isLoading) return;
    if (!resetTargetUser) return;

    const errors: typeof resetPasswordErrors = {};
    if (!resetNewPassword || resetNewPassword.trim().length === 0) {
      errors.password = "Mật khẩu mới không được để trống.";
    } else if (resetNewPassword.length < 6) {
      errors.password = "Mật khẩu phải có ít nhất 6 ký tự.";
    }

    if (!resetConfirmPassword || resetConfirmPassword.trim().length === 0) {
      errors.confirmPassword = "Vui lòng xác nhận mật khẩu.";
    } else if (resetNewPassword && resetConfirmPassword !== resetNewPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }

    setResetPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    isResettingPasswordRef.current = true;
    setIsLoading(true);
    try {
      await resetUserPassword(resetTargetUser.id, resetNewPassword.trim());
      setIsResetModalVisible(false);
      setResetTargetUser(null);
      setResetNewPassword("");
      setResetConfirmPassword("");
      setResetPasswordErrors({});
      useModalStore.getState().showModal({
        title: "Thành công",
        message: `Đã đặt lại mật khẩu cho tài khoản ${resetTargetUser.username}.`,
        type: "success"
      });
    } catch (e: any) {
      const errMsg = e.response?.data?.message || "Không thể đặt lại mật khẩu.";
      setResetPasswordErrors({ password: errMsg });
    } finally {
      setIsLoading(false);
      isResettingPasswordRef.current = false;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 bg-white border-b-4 border-black mb-4">
        <View className="flex-row justify-between items-center mb-1">
          <View>
            <Text className="font-serif text-2xl sm:text-3xl font-black text-black tracking-tight uppercase">
              Tài khoản
            </Text>
            <Text className="mt-0.5 text-[10px] sm:text-[11px] tracking-widest text-neutral-600 uppercase">
              Quản trị người dùng
            </Text>
          </View>
          <TouchableOpacity
            testID="add-user-button"
            accessibilityLabel="Thêm người dùng"
            onPress={() => setIsAddModalVisible(true)}
            className="w-11 h-11 bg-black items-center justify-center"
          >
            <Ionicons name="person-add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadUsers} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
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

            <View className="flex-row justify-end mt-3 pt-3 border-t border-dashed border-gray-300 gap-2 flex-wrap">
              <TouchableOpacity
                testID={`btn-reset-password-${item.id}`}
                className="flex-row items-center border border-black px-3 py-1.5 bg-white"
                onPress={() => handleOpenResetPassword(item)}
              >
                <Ionicons name="key-outline" size={14} color="#000" />
                <Text className="text-xs font-bold uppercase text-black ml-1">Đổi Mật Khẩu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID={`btn-edit-user-${item.id}`}
                className="flex-row items-center border border-black px-3 py-1.5 bg-white"
                onPress={() => handleOpenEdit(item)}
              >
                <Ionicons name="create-outline" size={14} color="#000" />
                <Text className="text-xs font-bold uppercase text-black ml-1">Sửa</Text>
              </TouchableOpacity>

              {item.username.toLowerCase() !== 'admin' && (
                <TouchableOpacity
                  testID={`btn-delete-user-${item.id}`}
                  className="flex-row items-center border border-red-600 bg-red-50 px-3 py-1.5"
                  onPress={() => handleDeleteUser(item)}
                >
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
              <TouchableOpacity
                onPress={() => {
                  setIsAddModalVisible(false);
                  setAddUserErrors({});
                }}
                className="w-8 h-8 border-2 border-black items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <CustomInput
              label="Tên đăng nhập *"
              testID="add-user-username-input"
              value={newUser.username}
              error={addUserErrors.username}
              onChangeText={(t) => {
                setNewUser({ ...newUser, username: t });
                if (addUserErrors.username) setAddUserErrors({ ...addUserErrors, username: undefined });
              }}
              autoCapitalize="none"
              autoComplete="username"
            />
            <CustomInput
              label="Họ và tên *"
              testID="add-user-name-input"
              value={newUser.name}
              error={addUserErrors.name}
              onChangeText={(t) => {
                setNewUser({ ...newUser, name: t });
                if (addUserErrors.name) setAddUserErrors({ ...addUserErrors, name: undefined });
              }}
            />
            <CustomInput
              label="Mật khẩu *"
              testID="add-user-password-input"
              secureTextEntry
              value={newUser.password}
              error={addUserErrors.password}
              onChangeText={(t) => {
                setNewUser({ ...newUser, password: t });
                if (addUserErrors.password) setAddUserErrors({ ...addUserErrors, password: undefined });
              }}
              autoComplete="new-password"
            />
            <CustomInput
              label="Xác nhận mật khẩu *"
              testID="add-user-confirm-password-input"
              secureTextEntry
              value={newUser.confirmPassword}
              error={addUserErrors.confirmPassword}
              onChangeText={(t) => {
                setNewUser({ ...newUser, confirmPassword: t });
                if (addUserErrors.confirmPassword) setAddUserErrors({ ...addUserErrors, confirmPassword: undefined });
              }}
              autoComplete="new-password"
            />
            <CustomInput
              label="Số điện thoại"
              testID="add-user-phone-input"
              value={newUser.phone}
              onChangeText={(t) => setNewUser({ ...newUser, phone: t })}
              keyboardType="phone-pad"
            />

            <View className="mb-4">
              <Text className="text-xs font-bold text-black uppercase tracking-widest mb-2 border-b-2 border-black pb-1">Vai trò</Text>
              <View className="flex-row flex-wrap">
                {["Manager", "Cashier", "WarehouseStaff", "Admin"].map(role => (
                  <TouchableOpacity
                    key={role}
                    onPress={() => setNewUser({ ...newUser, role })}
                    className={`border-2 border-black px-3 py-1.5 mr-2 mb-2 ${newUser.role === role ? 'bg-black' : 'bg-white'}`}
                  >
                    <Text className={`font-bold text-xs uppercase ${newUser.role === role ? 'text-white' : 'text-black'}`}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <CustomButton
              testID="btn-submit-add-user"
              title="Tạo tài khoản mới →"
              onPress={handleAddUser}
              loading={isLoading}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={isEditModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-black text-black text-base uppercase tracking-wider">Cập nhật tài khoản</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsEditModalVisible(false);
                  setEditUserErrors({});
                }}
                className="w-8 h-8 border-2 border-black items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            {editingUser && (
              <>
                <CustomInput
                  label="Họ và tên *"
                  testID="edit-user-name-input"
                  value={editingUser.name}
                  error={editUserErrors.name}
                  onChangeText={(t) => {
                    setEditingUser({ ...editingUser, name: t });
                    if (editUserErrors.name) setEditUserErrors({ ...editUserErrors, name: undefined });
                  }}
                />
                <CustomInput
                  label="Số điện thoại"
                  testID="edit-user-phone-input"
                  value={editingUser.phone || ""}
                  onChangeText={(t) => setEditingUser({ ...editingUser, phone: t })}
                  keyboardType="phone-pad"
                />

                <View className="mb-4">
                  <Text className="text-xs font-bold text-black uppercase tracking-widest mb-2 border-b-2 border-black pb-1">Vai trò</Text>
                  <View className="flex-row flex-wrap">
                    {["Manager", "Cashier", "WarehouseStaff", "Admin"].map(role => (
                      <TouchableOpacity
                        key={role}
                        onPress={() => setEditingUser({ ...editingUser, role })}
                        className={`border-2 border-black px-3 py-1.5 mr-2 mb-2 ${editingUser.role === role ? 'bg-black' : 'bg-white'}`}
                      >
                        <Text className={`font-bold text-xs uppercase ${editingUser.role === role ? 'text-white' : 'text-black'}`}>{role}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <CustomButton
                  testID="btn-submit-edit-user"
                  title="Lưu thông tin →"
                  onPress={handleSaveEdit}
                  loading={isLoading}
                />
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Admin Reset Password Modal */}
      <Modal visible={isResetModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-4">
              <View>
                <Text className="font-black text-black text-base uppercase tracking-wider">Đặt lại mật khẩu</Text>
                {resetTargetUser && (
                  <Text className="text-xs text-gray-600 font-mono mt-0.5">@{resetTargetUser.username} ({resetTargetUser.name})</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  setIsResetModalVisible(false);
                  setResetTargetUser(null);
                  setResetPasswordErrors({});
                }}
                className="w-8 h-8 border-2 border-black items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <CustomInput
              label="Mật khẩu mới *"
              testID="reset-new-password-input"
              secureTextEntry
              value={resetNewPassword}
              error={resetPasswordErrors.password}
              onChangeText={(t) => {
                setResetNewPassword(t);
                if (resetPasswordErrors.password) setResetPasswordErrors({ ...resetPasswordErrors, password: undefined });
              }}
              autoComplete="new-password"
            />
            <CustomInput
              label="Xác nhận mật khẩu *"
              testID="reset-confirm-password-input"
              secureTextEntry
              value={resetConfirmPassword}
              error={resetPasswordErrors.confirmPassword}
              onChangeText={(t) => {
                setResetConfirmPassword(t);
                if (resetPasswordErrors.confirmPassword) setResetPasswordErrors({ ...resetPasswordErrors, confirmPassword: undefined });
              }}
              autoComplete="new-password"
            />

            <View className="flex-row justify-end gap-2 mt-4">
              <TouchableOpacity
                testID="btn-cancel-reset-password"
                disabled={isLoading}
                onPress={() => {
                  setIsResetModalVisible(false);
                  setResetTargetUser(null);
                  setResetPasswordErrors({});
                }}
                className="py-2.5 px-4 border-2 border-black bg-white"
              >
                <Text className="text-black font-bold uppercase text-xs">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="btn-submit-reset-password"
                onPress={handleExecuteResetPassword}
                disabled={isLoading}
                className="py-2.5 px-5 bg-black flex-row items-center justify-center border-2 border-black"
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold uppercase text-xs tracking-wider">
                    Xác nhận đặt lại
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
