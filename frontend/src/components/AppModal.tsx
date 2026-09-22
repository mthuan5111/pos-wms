import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type AppModalType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface AppModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: AppModalType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  loading?: boolean;
  destructive?: boolean;
  fieldErrors?: Record<string, string[]>;
}

export default function AppModal({
  visible,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Hủy',
  onConfirm,
  onCancel,
  loading = false,
  destructive = false,
  fieldErrors,
}: AppModalProps) {
  const getIcon = () => {
    switch (type) {
      case 'success': return <Ionicons name="checkmark-circle-outline" size={32} color="#000" />;
      case 'warning': return <Ionicons name="warning-outline" size={32} color="#000" />;
      case 'error': return <Ionicons name="close-circle-outline" size={32} color="#000" />;
      case 'confirm': return <Ionicons name="help-circle-outline" size={32} color="#000" />;
      default: return <Ionicons name="information-circle-outline" size={32} color="#000" />;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={destructive ? undefined : (onCancel || onConfirm)}>
      <View
        testID="app-modal-overlay"
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999999,
          elevation: 999999,
          ...(Platform.OS === 'web' ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999 } : {})
        } as any}
      >
        <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 2, borderWidth: 2, borderColor: '#000', width: '90%', maxWidth: 400, zIndex: 1000000, elevation: 1000000 } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            {getIcon()}
            <Text style={{ fontSize: 18, fontFamily: 'serif', fontWeight: 'bold', letterSpacing: 1, marginLeft: 12, color: '#000', flex: 1, textTransform: 'uppercase' }}>{title}</Text>
          </View>
          <Text style={{ fontSize: 14, color: '#000', marginBottom: fieldErrors ? 12 : 24, lineHeight: 20 }}>{message}</Text>

          {fieldErrors && Object.keys(fieldErrors).length > 0 && (
            <View style={{ marginBottom: 24, backgroundColor: '#f5f5f5', padding: 12, borderWidth: 1, borderColor: '#ccc' }}>
              {Object.entries(fieldErrors).map(([field, errors]) => (
                <View key={field} style={{ marginBottom: 8 }}>
                  <Text style={{ fontWeight: 'bold', color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>{field}:</Text>
                  {errors.map((err, idx) => (
                    <Text key={idx} style={{ fontSize: 12, color: '#000', marginLeft: 8 }}>- {err}</Text>
                  ))}
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            {type === 'confirm' && onCancel && (
              <TouchableOpacity
                testID="app-modal-cancel-btn"
                onPress={onCancel}
                disabled={loading}
                style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 2, backgroundColor: '#fff', borderWidth: 2, borderColor: '#000' }}
              >
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="app-modal-confirm-btn"
              onPress={onConfirm}
              disabled={loading}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 2,
                backgroundColor: destructive ? '#b91c1c' : '#000',
                borderWidth: 2,
                borderColor: destructive ? '#b91c1c' : '#000',
                flexDirection: 'row',
                alignItems: 'center'
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
              ) : null}
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
