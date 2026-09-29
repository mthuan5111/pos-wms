import { Platform } from "react-native";

/**
 * Module cấu hình API và Môi trường tập trung
 * - Đọc URL từ biến môi trường public (EXPO_PUBLIC_API_URL)
 * - Chuẩn hóa trailing slash
 * - Kiểm tra tính hợp lệ của scheme và host
 * - Cảnh báo trong development và bảo vệ môi trường production
 * - Fail sớm (throw Error) ở cả development và production nếu thiếu hoặc sai định dạng
 */
function resolveAndValidateApiUrl(): string {
  let url = (process.env.EXPO_PUBLIC_API_URL || '').trim();

  if (!url) {
    const errorMsg =
      "[Cấu hình API] LỖI: Biến môi trường EXPO_PUBLIC_API_URL chưa được thiết lập! " +
      "Vui lòng thiết lập biến này trong file .env hoặc cấu hình build (ví dụ: EXPO_PUBLIC_API_URL=https://api.yourdomain.com/api).";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Loại bỏ trailing slash
  url = url.replace(/\/+$/, '');

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch (error: any) {
    const invalidUrlMsg = `[Cấu hình API] Địa chỉ EXPO_PUBLIC_API_URL không hợp lệ ("${url}"): ${error?.message || error}`;
    console.error(invalidUrlMsg);
    throw new Error(invalidUrlMsg);
  }

  // Đảm bảo scheme là http hoặc https
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw new Error(`[Cấu hình API] Giao thức URL không hợp lệ: ${urlObj.protocol}. Phải là http: hoặc https:`);
  }

  if (!__DEV__) {
    // Trong production: Bắt buộc giao thức HTTPS và không dùng localhost / loopback
    if (urlObj.protocol !== 'https:') {
      throw new Error('[Cấu hình API] EXPO_PUBLIC_API_URL phải sử dụng giao thức HTTPS trong môi trường production');
    }
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '::1') {
      throw new Error('[Cấu hình API] Không được sử dụng localhost hoặc 127.0.0.1 làm API_URL trong môi trường production');
    }
  } else {
    // Trong development: Cảnh báo phù hợp với từng nền tảng
    const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '::1';
    if (isLocalhost) {
      if (Platform.OS === 'android') {
        console.warn(
          '[Cấu hình API] Cảnh báo: Đang trỏ tới localhost trên Android. ' +
          'Trình giả lập Android Emulator cần dùng http://10.0.2.2:<port>/api hoặc IP mạng LAN cho thiết bị thật.'
        );
      } else if (Platform.OS === 'ios') {
        console.warn(
          '[Cấu hình API] Cảnh báo: Đang trỏ tới localhost trên iOS. ' +
          'Thiết bị thật cần sử dụng địa chỉ IP mạng nội bộ (LAN) thay vì localhost.'
        );
      }
    }
  }

  return url;
}

export const API_BASE_URL: string = resolveAndValidateApiUrl();

export const CLOUDINARY_CONFIG = {
  cloudName: (process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim(),
  uploadPreset: (process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '').trim(),
};
