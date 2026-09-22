import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import CustomButton from '@/components/CustomButton';
import RecoveryModal from '@/components/RecoveryModal';
import { useModalStore } from '@/store/useModalStore';
import { getUnsyncedCounts } from '@/database/db';
import { useSafeLogout } from '@/hooks/useSafeLogout';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import FieldLabel, { FieldError } from '@/components/FieldLabel';
import { changeUserPassword } from '@/services/userApi';
import ResponsiveFormWrapper from '@/components/ResponsiveFormWrapper';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [unownedCount, setUnownedCount] = useState(0);
  const [isRecoveryVisible, setIsRecoveryVisible] = useState(false);
  const { isSyncing } = useGlobalSyncStore();
  const user = useAuthStore((state) => state.user);
  const { handleLogout } = useSafeLogout();
  const { showModal } = useModalStore();
  const isDesktop = useIsDesktop();

  // Password change modal state
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const resetPasswordState = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);
    setIsChangingPassword(false);
    isSubmittingRef.current = false;
  };

  const checkUnsyncedData = async () => {
    if (!user) return;
    const counts = await getUnsyncedCounts(user.id);
    setUnsyncedCount(counts.ownedCount);
    setUnownedCount(counts.unownedCount);
  };

  useFocusEffect(
    React.useCallback(() => {
      checkUnsyncedData();
      return () => {
        resetPasswordState();
        setIsPasswordModalVisible(false);
      };
    }, [user])
  );

  const handleChangePassword = async () => {
    if (isSubmittingRef.current || isChangingPassword) return;

    let hasError = false;
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);

    if (!currentPassword || currentPassword.trim().length === 0) {
      setCurrentPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      hasError = true;
    }

    if (!newPassword || newPassword.trim().length === 0) {
      setNewPasswordError('Vui lòng nhập mật khẩu mới.');
      hasError = true;
    } else if (newPassword.length < 6) {
      setNewPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      hasError = true;
    } else if (currentPassword && newPassword === currentPassword) {
      setNewPasswordError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      hasError = true;
    }

    if (!confirmPassword || confirmPassword.trim().length === 0) {
      setConfirmPasswordError('Vui lòng xác nhận mật khẩu mới.');
      hasError = true;
    } else if (newPassword && confirmPassword !== newPassword) {
      setConfirmPasswordError('Mật khẩu xác nhận không khớp.');
      hasError = true;
    }

    if (hasError) return;
    if (!user?.id) return;

    isSubmittingRef.current = true;
    setIsChangingPassword(true);

    try {
      await changeUserPassword(user.id, currentPassword, newPassword.trim());
      resetPasswordState();
      setIsPasswordModalVisible(false);
      showModal({
        title: 'Thành công',
        message: 'Đổi mật khẩu thành công.',
        type: 'success'
      });
    } catch (e: any) {
      const errCode = e.response?.data?.code;
      const errMsg = e.response?.data?.message || 'Không thể đổi mật khẩu.';

      if (errCode === 'INVALID_CURRENT_PASSWORD' || errMsg.toLowerCase().includes('hiện tại không chính xác')) {
        setCurrentPasswordError('Mật khẩu hiện tại không chính xác.');
      } else if (errCode === 'NEW_PASSWORD_SAME_AS_CURRENT' || errMsg.toLowerCase().includes('trùng với mật khẩu')) {
        setNewPasswordError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
      } else if (errCode === 'PASSWORD_TOO_SHORT') {
        setNewPasswordError('Mật khẩu phải có ít nhất 6 ký tự.');
      } else {
        setNewPasswordError(errMsg);
      }
    } finally {
      setIsChangingPassword(false);
      isSubmittingRef.current = false;
    }
  };

  const roleDisplay = user?.role === 'Admin'
    ? 'Quản trị viên hệ thống'
    : user?.role === 'Manager'
    ? 'Quản lý cửa hàng'
    : user?.role === 'Cashier'
    ? 'Nhân viên thu ngân'
    : user?.role === 'WarehouseStaff'
    ? 'Nhân viên thủ kho'
    : user?.role || 'Chưa xác định';

  return (
    <SafeAreaView testID="settings-screen" className="flex-1 bg-white">
      {/* Header - Unified for all roles */}
      <View className="px-5 sm:px-6 pt-5 pb-4 bg-white border-b-4 border-black">
        <Text className="font-serif text-2xl sm:text-3xl font-black text-black uppercase tracking-tight">
          CÀI ĐẶT
        </Text>
        <Text className="mt-1 text-[11px] tracking-widest text-gray-600 uppercase">
          Thông tin tài khoản & thiết lập
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: isDesktop ? 24 : 16,
          paddingBottom: isDesktop ? 32 : Math.max(110, insets.bottom + 80),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: Account info */}
        <View className="border-2 border-black p-4 sm:p-5 mb-4 sm:mb-6 bg-white">
          <Text className="font-black text-black mb-3 uppercase tracking-widest text-xs">
            Thông tin tài khoản
          </Text>
          <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

          <View className="mb-3 flex-row justify-between items-center">
            <View className="flex-row items-center">
              <Ionicons name="person-outline" size={16} color="#000" />
              <Text className="ml-2 text-xs font-bold text-gray-700">Họ tên</Text>
            </View>
            <Text className="text-black font-bold text-xs sm:text-sm">{user?.name || 'N/A'}</Text>
          </View>

          <View className="mb-3 flex-row justify-between items-center">
            <View className="flex-row items-center">
              <Ionicons name="key-outline" size={16} color="#000" />
              <Text className="ml-2 text-xs font-bold text-gray-700">Tên đăng nhập</Text>
            </View>
            <Text className="text-black font-bold font-mono text-xs sm:text-sm">{user?.username}</Text>
          </View>

          <View className="flex-row justify-between items-start sm:items-center flex-wrap gap-2">
            <View className="flex-row items-center">
              <Ionicons name="shield-outline" size={16} color="#000" />
              <Text className="ml-2 text-xs font-bold text-gray-700">Vai trò</Text>
            </View>
            <View className="border border-black px-2.5 py-1 bg-gray-50 max-w-[70%]">
              <Text className="text-black font-bold uppercase text-[10px] sm:text-[11px] tracking-wider text-right" numberOfLines={2}>
                {roleDisplay}
              </Text>
            </View>
          </View>
        </View>

        {/* Section: Security & Password */}
        <View className="border-2 border-black p-4 sm:p-5 mb-4 sm:mb-6 bg-white">
          <Text className="font-black text-black mb-3 uppercase tracking-widest text-xs">
            Bảo mật tài khoản
          </Text>
          <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

          <View className="flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-bold text-black uppercase tracking-wide">Mật khẩu đăng nhập</Text>
              <Text className="text-[11px] text-gray-500 mt-0.5">Thay đổi mật khẩu tài khoản của bạn</Text>
            </View>
            <TouchableOpacity
              testID="settings-btn-open-change-password"
              onPress={() => {
                resetPasswordState();
                setIsPasswordModalVisible(true);
              }}
              className="bg-black py-2.5 px-4 border border-black flex-row items-center justify-center self-stretch sm:self-auto"
            >
              <Ionicons name="key-outline" size={14} color="#fff" />
              <Text className="text-white font-bold text-xs uppercase tracking-wider ml-1.5">
                Đổi mật khẩu
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Application info */}
        <View className="border-2 border-black p-4 sm:p-5 mb-4 sm:mb-6 bg-white">
          <Text className="font-black text-black mb-3 uppercase tracking-widest text-xs">
            Thông tin ứng dụng
          </Text>
          <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

          <View className="flex-col sm:flex-row justify-between items-start sm:items-center gap-1 mb-2">
            <Text className="text-xs font-bold text-gray-700">Hệ thống</Text>
            <Text className="text-xs font-bold text-black sm:text-right flex-1">POS & WMS Quản lý bán hàng và kho</Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-xs font-bold text-gray-700">Phiên bản</Text>
            <Text className="text-xs font-bold text-black font-mono">1.0.0 (Acceptance Build)</Text>
          </View>
        </View>

        {/* Data Recovery notice (Admin only) */}
        {user?.role === "Admin" && unownedCount > 0 && (
          <View className="border-2 border-red-600 bg-red-50 p-4 mb-4 sm:mb-6">
            <View className="flex-row items-center mb-2">
              <Ionicons name="warning" size={20} color="#dc2626" />
              <Text className="ml-2 font-bold text-red-600 uppercase text-xs sm:text-sm">Cần phục hồi dữ liệu</Text>
            </View>
            <Text className="text-red-700 text-xs sm:text-sm mb-3">
              Hệ thống phát hiện {unownedCount} bản ghi cũ (không xác định tài khoản).
            </Text>
            <TouchableOpacity onPress={() => setIsRecoveryVisible(true)} className="bg-red-600 p-2.5 items-center">
              <Text className="text-white font-bold uppercase text-xs">Xem dữ liệu cần phục hồi</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Unsynced queue status indicator */}
        {unsyncedCount > 0 && (
          <View className="flex-row items-center justify-center p-3 mb-4 border border-black bg-gray-100">
            <Ionicons name="cloud-offline-outline" size={20} color="#000" />
            <Text className="ml-2 font-bold text-black uppercase text-xs tracking-wider">
              Chờ đồng bộ: {unsyncedCount}
            </Text>
          </View>
        )}

        {/* LOGOUT BUTTON: Only visible on Mobile (when DesktopSidebar is NOT present) */}
        {!isDesktop && (
          <View className="mt-4 mb-8">
            <CustomButton
              testID="settings-mobile-logout-btn"
              title={isSyncing ? "ĐANG ĐỒNG BỘ..." : "ĐĂNG XUẤT"}
              onPress={handleLogout}
              disabled={isSyncing}
              variant="outline"
            />
          </View>
        )}
      </ScrollView>

      <RecoveryModal visible={isRecoveryVisible} onClose={() => { setIsRecoveryVisible(false); checkUnsyncedData(); }} />

      {/* Change Password Modal */}
      <Modal
        visible={isPasswordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          resetPasswordState();
          setIsPasswordModalVisible(false);
        }}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="w-full max-w-md bg-white border-4 border-black p-5 sm:p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-4 border-b-2 border-black pb-3">
              <Text className="text-xl font-black text-black uppercase tracking-tight">
                Đổi mật khẩu
              </Text>
              <TouchableOpacity
                onPress={() => {
                  resetPasswordState();
                  setIsPasswordModalVisible(false);
                }}
                className="p-1"
                accessibilityLabel="Đóng modal đổi mật khẩu"
              >
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Field: Current Password */}
            <View className="mb-4">
              <FieldLabel label="Mật khẩu hiện tại" required />
              <View className={`flex-row items-center border-2 ${currentPasswordError ? 'border-red-600 bg-red-50/20' : 'border-black'} px-3`}>
                <TextInput
                  testID="settings-current-password-input"
                  secureTextEntry={!showCurrentPassword}
                  value={currentPassword}
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    if (currentPasswordError) setCurrentPasswordError(null);
                  }}
                  className="flex-1 py-2 text-sm text-black"
                  autoComplete="current-password"
                  accessibilityLabel="Mật khẩu hiện tại"
                />
                <TouchableOpacity
                  testID="settings-toggle-current-password"
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="p-1"
                >
                  <Ionicons name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#000" />
                </TouchableOpacity>
              </View>
              <FieldError error={currentPasswordError} testID="settings-current-password-error" />
            </View>

            {/* Field: New Password */}
            <View className="mb-4">
              <FieldLabel label="Mật khẩu mới" required />
              <View className={`flex-row items-center border-2 ${newPasswordError ? 'border-red-600 bg-red-50/20' : 'border-black'} px-3`}>
                <TextInput
                  testID="settings-new-password-input"
                  secureTextEntry={!showNewPassword}
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    if (newPasswordError) setNewPasswordError(null);
                  }}
                  className="flex-1 py-2 text-sm text-black"
                  autoComplete="new-password"
                  accessibilityLabel="Mật khẩu mới"
                />
                <TouchableOpacity
                  testID="settings-toggle-new-password"
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  className="p-1"
                >
                  <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#000" />
                </TouchableOpacity>
              </View>
              <FieldError error={newPasswordError} testID="settings-new-password-error" />
            </View>

            {/* Field: Confirm Password */}
            <View className="mb-6">
              <FieldLabel label="Xác nhận mật khẩu" required />
              <View className={`flex-row items-center border-2 ${confirmPasswordError ? 'border-red-600 bg-red-50/20' : 'border-black'} px-3`}>
                <TextInput
                  testID="settings-confirm-password-input"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (confirmPasswordError) setConfirmPasswordError(null);
                  }}
                  className="flex-1 py-2 text-sm text-black"
                  autoComplete="new-password"
                  accessibilityLabel="Xác nhận mật khẩu"
                />
                <TouchableOpacity
                  testID="settings-toggle-confirm-password"
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="p-1"
                >
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#000" />
                </TouchableOpacity>
              </View>
              <FieldError error={confirmPasswordError} testID="settings-confirm-password-error" />
            </View>

            {/* Action Buttons */}
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                testID="settings-btn-cancel-password"
                disabled={isChangingPassword}
                onPress={() => {
                  resetPasswordState();
                  setIsPasswordModalVisible(false);
                }}
                className="py-2.5 px-4 border-2 border-black bg-white"
              >
                <Text className="text-black font-bold uppercase text-xs tracking-wider">
                  Hủy
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="settings-btn-change-password"
                disabled={isChangingPassword}
                onPress={handleChangePassword}
                className="py-2.5 px-5 bg-black flex-row items-center justify-center border-2 border-black"
              >
                {isChangingPassword ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-black uppercase text-xs tracking-wider">
                    Cập nhật
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
