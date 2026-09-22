import React from 'react';
import AppModal from './AppModal';
import { useModalStore } from '@/store/useModalStore';

export default function GlobalModal() {
  const {
    modalId,
    visible,
    title,
    message,
    type,
    confirmText,
    cancelText,
    loading,
    destructive,
    onConfirm,
    onCancel,
    hideModal,
    fieldErrors,
  } = useModalStore();

  const handleConfirm = async () => {
    if (onConfirm) {
      const { setLoading } = useModalStore.getState();
      setLoading(true);
      try {
        await onConfirm();
      } finally {
        setLoading(false);
        useModalStore.getState().hideModal(modalId);
      }
    } else {
      hideModal(modalId);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    hideModal(modalId);
  };

  return (
    <AppModal
      visible={visible}
      title={title}
      message={message}
      type={type}
      confirmText={confirmText}
      cancelText={cancelText}
      loading={loading}
      destructive={destructive}
      fieldErrors={fieldErrors}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
