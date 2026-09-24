import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDemoSandboxStore } from '@/store/useDemoSandboxStore';
import { useModalStore } from '@/store/useModalStore';

interface DemoResetConfirmModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function DemoResetConfirmModal({ visible, onClose }: DemoResetConfirmModalProps) {
  const [isResetting, setIsResetting] = useState(false);
  const resetSandbox = useDemoSandboxStore(state => state.resetSandbox);
  const demoSessionId = useDemoSandboxStore(state => state.demoSessionId);
  const showModal = useModalStore(state => state.showModal);

  const handleConfirm = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await resetSandbox();
      onClose();
      showModal({
        title: 'Làm mới thành công',
        message: 'Dữ liệu sandbox của phiên trải nghiệm hiện tại đã được dọn sạch. Toàn bộ master data và dữ liệu showcase chính vẫn được giữ nguyên an toàn.',
        type: 'success',
      });
    } catch (e: any) {
      showModal({
        title: 'Lỗi',
        message: 'Không thể làm mới phiên trải nghiệm: ' + (e?.message || 'Lỗi không xác định'),
        type: 'error',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isResetting) onClose();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 3,
            borderColor: '#000000',
            width: '100%',
            maxWidth: 480,
            padding: 24,
            shadowColor: '#000',
            shadowOffset: { width: 4, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 8,
          }}
        >
          {/* Header */}
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-full bg-amber-100 border border-amber-600 items-center justify-center mr-3">
              <Ionicons name="refresh" size={22} color="#b45309" />
            </View>
            <View className="flex-1">
              <Text className="font-serif text-lg font-black text-black uppercase">
                Làm mới phiên trải nghiệm
              </Text>
              <Text className="text-[11px] font-mono text-gray-500">
                Session: {demoSessionId.substring(0, 16)}...
              </Text>
            </View>
          </View>

          <View style={{ width: '100%', height: 2, backgroundColor: '#000', marginBottom: 14 }} />

          {/* Description */}
          <Text className="text-xs text-gray-800 leading-5 mb-3 font-medium">
            Hành động này sẽ <Text className="font-bold text-red-600">xóa toàn bộ dữ liệu thử nghiệm</Text> do chính phiên trình duyệt hiện tại tạo ra, bao gồm:
          </Text>

          <View className="bg-gray-50 border border-gray-300 p-3 mb-4 space-y-1.5">
            <Text className="text-[11px] text-gray-700">• Các hóa đơn bán hàng thử (DEMO-ORDER-...)</Text>
            <Text className="text-[11px] text-gray-700">• Các ca làm việc thử nghiệm (DEMO-SHIFT-...)</Text>
            <Text className="text-[11px] text-gray-700">• Các phiếu nhập kho thử (DEMO-GR-...)</Text>
            <Text className="text-[11px] text-gray-700">• Các điều chỉnh tồn kho thử trong sandbox</Text>
          </View>

          <View className="bg-green-50 border border-green-300 p-3 mb-5">
            <Text className="text-[11px] text-green-900 font-bold">
              ✓ CAM KẾT AN TOÀN:
            </Text>
            <Text className="text-[11px] text-green-800 mt-1">
              Không xóa database SQL Server chính, không thay đổi số liệu doanh thu thực tế, không ảnh hưởng đến các phiên trải nghiệm khác.
            </Text>
          </View>

          {/* Buttons */}
          <View className="flex-row justify-end space-x-3 gap-2">
            <TouchableOpacity
              testID="demo-reset-cancel-btn"
              disabled={isResetting}
              onPress={onClose}
              className="px-4 py-2.5 border border-black bg-white"
            >
              <Text className="text-xs font-bold uppercase tracking-wider text-black">
                Hủy bỏ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="demo-reset-confirm-btn"
              disabled={isResetting}
              onPress={handleConfirm}
              className="px-5 py-2.5 bg-black border border-black flex-row items-center"
            >
              {isResetting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-bold uppercase tracking-wider text-white">
                    Xác nhận làm mới
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
