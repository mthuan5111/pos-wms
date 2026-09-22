import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FieldLabel, { FieldError } from './FieldLabel';

interface DeactivateModalProps {
  visible: boolean;
  title: string;
  itemName: string;
  entityType?: 'product' | 'category' | 'supplier';
  isLoading?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function DeactivateModal({
  visible,
  title,
  itemName,
  entityType = 'product',
  isLoading = false,
  onConfirm,
  onCancel
}: DeactivateModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(null);
    }
  }, [visible]);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(
        entityType === 'product'
          ? 'Vui lòng nhập lý do ngừng kinh doanh.'
          : 'Vui lòng nhập lý do ngừng sử dụng.'
      );
      return;
    }
    setError(null);
    onConfirm(trimmed);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        testID="deactivate-modal-backdrop"
        className="flex-1 bg-black/70 justify-center items-center p-4"
        style={Platform.OS === 'web' ? ({ zIndex: 999999, position: 'fixed', inset: 0 } as any) : {}}
      >
        <View className="bg-white w-full max-w-md p-6 border-4 border-black">
          {/* Header */}
          <View className="flex-row justify-between items-center pb-3 border-b-2 border-black mb-4">
            <View>
              <Text className="text-lg font-black uppercase text-black">
                {title || (entityType === 'product' ? 'Ngừng kinh doanh' : 'Ngừng sử dụng')}
              </Text>
              <Text className="text-xs text-gray-600 mt-0.5" numberOfLines={1}>
                {itemName}
              </Text>
            </View>
            <TouchableOpacity testID="deactivate-modal-close" onPress={onCancel} className="p-1">
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View className="bg-amber-50 border border-amber-300 p-3 mb-4">
            <Text className="text-xs text-amber-900 leading-relaxed">
              {entityType === 'product'
                ? 'Sản phẩm sẽ được ẩn khỏi màn hình bán hàng (POS) và form chứng từ mới. Toàn bộ hóa đơn, phiếu nhập và báo cáo lịch sử vẫn được bảo toàn nguyên vẹn.'
                : 'Mục này sẽ không còn xuất hiện trong bộ chọn tạo mới. Toàn bộ chứng từ và báo cáo liên quan trong quá khứ vẫn được bảo toàn.'}
            </Text>
          </View>

          {/* Reason input */}
          <View className="mb-4">
            <FieldLabel
              label={entityType === 'product' ? 'Lý do ngừng kinh doanh' : 'Lý do ngừng sử dụng'}
              required
            />
            <TextInput
              testID="deactivate-reason-input"
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                if (error) setError(null);
              }}
              multiline
              numberOfLines={3}
              accessibilityLabel={entityType === 'product' ? 'Lý do ngừng kinh doanh' : 'Lý do ngừng sử dụng'}
              className="border-2 border-black p-2.5 text-xs text-black min-h-[70px]"
            />
            <FieldError error={error} testID="deactivate-reason-error" />
          </View>

          {/* Actions */}
          <View className="flex-row gap-2">
            <TouchableOpacity
              testID="btn-cancel-deactivate"
              disabled={isLoading}
              onPress={onCancel}
              className="flex-1 py-2.5 px-4 border-2 border-gray-400 items-center justify-center bg-gray-100"
            >
              <Text className="text-xs font-bold text-gray-700 uppercase tracking-wider">Hủy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="btn-confirm-deactivate"
              disabled={isLoading}
              onPress={handleConfirm}
              className="flex-1 bg-red-600 py-2.5 px-4 border-2 border-red-700 items-center justify-center flex-row"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-xs font-black text-white uppercase tracking-wider">
                  Xác nhận
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
