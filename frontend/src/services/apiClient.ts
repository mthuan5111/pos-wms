import { Platform } from "react-native";
import { useAuthStore } from "@/store/authStore";
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from "@/utils/token";
import axios, { AxiosError } from "axios";

function resolveAndValidateApiUrl(): string {
  let url = (process.env.EXPO_PUBLIC_API_URL || '').trim();

  if (!url) {
    const errorMsg = "[API Config] LỖI CẤU HÌNH: EXPO_PUBLIC_API_URL chưa được thiết lập trong biến môi trường (.env)!";
    console.error(errorMsg);
    if (!__DEV__) {
      throw new Error(errorMsg);
    }
    return '';
  }

  try {
    const urlObj = new URL(url);

    // Normalize trailing slash
    url = url.replace(/\/+$/, '');

    if (!__DEV__) {
      // In production, enforce HTTPS and disallow localhost / loopback
      if (urlObj.protocol !== 'https:') {
        throw new Error('[API Config] EXPO_PUBLIC_API_URL phải sử dụng giao thức HTTPS trong môi trường production');
      }
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        throw new Error('[API Config] Không được sử dụng localhost làm API_URL trong môi trường production');
      }
    } else {
      // In development, validate platform-specific network constraints
      const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
      const isLanIp = /^192\.168\.\d+\.\d+$/.test(urlObj.hostname) || /^10\.\d+\.\d+\.\d+$/.test(urlObj.hostname);

      if (urlObj.protocol === 'http:' && !isLocalhost && !isLanIp) {
        console.warn(`[API] Cảnh báo: HTTP đang được sử dụng cho địa chỉ non-local (${urlObj.hostname}).`);
      }

      if (isLocalhost) {
        if (Platform.OS === 'android') {
          console.warn('[API Config Warning] Đang trỏ tới localhost trên Android. Trình giả lập Android cần dùng 10.0.2.2 hoặc IP mạng nội bộ của máy tính.');
        } else if (Platform.OS === 'ios' && !Platform.isPad && !Platform.isTV) {
          console.warn('[API Config Warning] Đang trỏ tới localhost trên thiết bị iOS. Thiết bị thật cần dùng IP mạng nội bộ của máy tính.');
        }
      }
    }
  } catch (error: any) {
    console.error("[API Config] Cấu hình API_URL không hợp lệ:", error.message || error);
  }

  return url;
}

const API_BASE_URL = resolveAndValidateApiUrl();

if (__DEV__) {
  console.log(`[API] Khởi tạo apiClient với baseURL: ${API_BASE_URL || '(chưa thiết lập)'}`);
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

let isRefreshing = false;
let failedQueue: { resolve: (value?: unknown) => void; reject: (reason?: any) => void }[] = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  async (config) => {
    if (!config.baseURL && !config.url?.startsWith('http')) {
      const configError = new Error('LỖI CẤU HÌNH HỆ THỐNG: Địa chỉ máy chủ (EXPO_PUBLIC_API_URL) chưa được thiết lập. Vui lòng kiểm tra file .env');
      return Promise.reject(configError);
    }
    const isAuthEndpoint = config.url?.includes('/Auth/login') || config.url?.includes('/Auth/refresh-token');
    if (!isAuthEndpoint) {
      const token = await getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } else {
      delete config.headers.Authorization;
    }
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (!originalRequest) return Promise.reject(error);

    // 401 Refresh Token Logic (Single-flight)
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/Auth/login')) {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return apiClient(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const accessToken = await getAccessToken();
        const refreshToken = await getRefreshToken();

        if (!refreshToken) throw new Error("Không có Refresh Token");

        const refreshResponse = await axios.post(
          `${API_BASE_URL}/Auth/refresh-token`,
          {
            accessToken: accessToken,
            refreshToken: refreshToken,
          },
        );

        const newAccessToken =
          refreshResponse.data.data?.accessToken ||
          refreshResponse.data.accessToken;
        const newRefreshToken =
          refreshResponse.data.data?.refreshToken ||
          refreshResponse.data.refreshToken;

        await saveTokens(newAccessToken, newRefreshToken);
        useAuthStore.getState().setToken(newAccessToken);

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        processQueue(refreshError, null);
        await clearTokens();
        useAuthStore.getState().setToken(null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 429 and 503 Retry Logic
    if (error.response?.status === 429 || error.response?.status === 503) {
      originalRequest._retryCount = originalRequest._retryCount || 0;
      const maxRetries = 3;

      if (originalRequest._retryCount < maxRetries) {
        originalRequest._retryCount += 1;
        
        let delay = 1000 * Math.pow(2, originalRequest._retryCount); // Exponential backoff

        // Respect Retry-After header if present
        if (error.response.headers['retry-after']) {
           const retryAfter = parseInt(error.response.headers['retry-after'], 10);
           if (!isNaN(retryAfter)) {
             delay = retryAfter * 1000;
           }
        }

        console.log(`[apiClient] Retrying request (attempt ${originalRequest._retryCount}) after ${delay}ms...`);
        return new Promise(resolve => setTimeout(resolve, delay)).then(() => apiClient(originalRequest));
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
