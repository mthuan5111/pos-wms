import { create } from 'zustand';
import { AppModalType } from '@/components/AppModal';

interface ModalState {
  modalId: number;
  visible: boolean;
  title: string;
  message: string;
  type: AppModalType;
  confirmText: string;
  cancelText: string;
  loading: boolean;
  destructive: boolean;
  onConfirm: (() => void) | undefined;
  onCancel: (() => void) | undefined;
  fieldErrors?: Record<string, string[]>;
  showModal: (options: {
    title: string;
    message: string;
    type?: AppModalType;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    fieldErrors?: Record<string, string[]>;
  }) => void;
  hideModal: (id?: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  modalId: 0,
  visible: false,
  title: '',
  message: '',
  type: 'info',
  confirmText: 'OK',
  cancelText: 'Hủy',
  loading: false,
  destructive: false,
  onConfirm: undefined,
  onCancel: undefined,
  fieldErrors: undefined,
  showModal: (options) =>
    set((state) => ({
      modalId: state.modalId + 1,
      visible: true,
      title: options.title,
      message: options.message,
      type: options.type || 'info',
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Hủy',
      destructive: options.destructive || false,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
      fieldErrors: options.fieldErrors,
      loading: false,
    })),
  hideModal: (id?: number) => set((state) => {
    if (id !== undefined && state.modalId !== id) {
      return state;
    }
    return { visible: false, onConfirm: undefined, onCancel: undefined, fieldErrors: undefined };
  }),
  setLoading: (loading) => set({ loading }),
}));

if (__DEV__ && typeof window !== 'undefined') {
  (window as any).__MODAL_STORE__ = useModalStore;
}
