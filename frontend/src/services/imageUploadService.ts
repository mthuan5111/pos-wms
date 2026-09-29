import { Platform } from 'react-native';
import apiClient from './apiClient';
import { useAuthStore } from '@/store/authStore';
import { isDemoUser } from '@/utils/roleUtils';

export interface ImageUploadResult {
  isSuccess: boolean;
  url?: string;
  publicId?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  errorMessage?: string;
  error?: string;
}

export const uploadImageToCloudinary = async (
  fileUri: string,
  fileName: string = "image.jpg",
  mimeType: string = "image/jpeg"
): Promise<ImageUploadResult> => {
  const currentUser = useAuthStore.getState().user;
  if (isDemoUser(currentUser)) {
    return {
      isSuccess: false,
      errorMessage: 'Tài khoản Demo không được phép tải ảnh lên máy chủ hoặc thay đổi tài nguyên Cloudinary.',
      error: 'Tài khoản Demo không được phép tải ảnh lên máy chủ.'
    };
  }
  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      try {
        const res = await fetch(fileUri);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: mimeType });
        formData.append('file', file);
      } catch (e) {
        return { isSuccess: false, errorMessage: 'Không thể đọc file ảnh trên Web.' };
      }
    } else {
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: mimeType,
      } as any);
    }

    // Try backend upload endpoint first (authenticated, server-side validated, magic-byte checked)
    try {
      const backendRes = await apiClient.post('/Products/upload-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 25000,
      });

      if (backendRes.data?.isSuccess && backendRes.data.data) {
        const data = backendRes.data.data;
        return {
          isSuccess: true,
          url: data.secureUrl,
          publicId: data.publicId,
          width: data.width,
          height: data.height,
          format: data.format,
          bytes: data.bytes,
        };
      }
    } catch (backendErr: any) {
      console.warn('[ImageUpload] Backend upload endpoint error, trying direct Cloudinary fallback:', backendErr?.response?.data?.message || backendErr.message);
    }

    // Direct Cloudinary upload fallback with preset
    const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      return {
        isSuccess: false,
        errorMessage: 'Thiếu cấu hình Cloudinary. Vui lòng liên hệ Admin.',
      };
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    formData.append('upload_preset', uploadPreset);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || 'Lỗi từ Cloudinary';
      return {
        isSuccess: false,
        errorMessage: msg,
        error: msg,
      };
    }

    return {
      isSuccess: true,
      url: data.secure_url,
      publicId: data.public_id,
      width: data.width,
      height: data.height,
      format: data.format,
      bytes: data.bytes,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      const msg = 'Quá thời gian tải ảnh lên máy chủ (Timeout). Vui lòng kiểm tra lại kết nối mạng.';
      return {
        isSuccess: false,
        errorMessage: msg,
        error: msg,
      };
    }
    const msg = e.message || 'Không thể kết nối đến máy chủ lưu trữ ảnh';
    return {
      isSuccess: false,
      errorMessage: msg,
      error: msg,
    };
  }
};

export const cleanupOrphanImage = async (publicId: string): Promise<boolean> => {
  if (!publicId) return false;
  const currentUser = useAuthStore.getState().user;
  if (isDemoUser(currentUser)) return false;
  try {
    const res = await apiClient.post('/Products/cleanup-orphan-image', { publicId }, { timeout: 10000 });
    return !!res.data?.isSuccess;
  } catch {
    return false;
  }
};
