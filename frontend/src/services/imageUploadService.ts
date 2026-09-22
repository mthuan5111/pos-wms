import { Platform } from 'react-native';

export interface ImageUploadResult {
  isSuccess: boolean;
  url?: string;
  errorMessage?: string;
}

export const uploadImageToCloudinary = async (
  fileUri: string,
  fileName: string = "image.jpg",
  mimeType: string = "image/jpeg"
): Promise<ImageUploadResult> => {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    return {
      isSuccess: false,
      errorMessage: 'Thiếu cấu hình Cloudinary. Vui lòng liên hệ Admin.',
    };
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();
  formData.append('upload_preset', uploadPreset);

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

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      // Do not set Content-Type header manually when sending FormData
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        isSuccess: false,
        errorMessage: data?.error?.message || 'Lỗi từ Cloudinary',
      };
    }

    return {
      isSuccess: true,
      url: data.secure_url,
    };
  } catch (e: any) {
    return {
      isSuccess: false,
      errorMessage: e.message || 'Không thể kết nối đến Cloudinary',
    };
  }
};
