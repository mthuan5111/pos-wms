import { Platform } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { isDemoUser } from "@/utils/roleUtils";
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from "@/utils/token";
import axios, { AxiosError } from "axios";

import { API_BASE_URL } from "@/config/apiConfig";
import { logger } from "@/utils/logger";

logger.info("apiClient", `Khởi tạo apiClient với baseURL: ${API_BASE_URL || '(chưa thiết lập)'}`);

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
    const isAuthEndpoint =
      config.url?.includes('/Auth/login') ||
      config.url?.includes('/Auth/refresh-token') ||
      config.url?.includes('/Auth/demo-login');
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

    const isAuthEndpoint =
      originalRequest.url?.includes('/Auth/login') ||
      originalRequest.url?.includes('/Auth/refresh-token') ||
      originalRequest.url?.includes('/Auth/demo-login');

    // 401 Refresh Token / Demo Token Logic (Single-flight)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
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

      const currentUser = useAuthStore.getState().user;
      const isDemo = isDemoUser(currentUser) || currentUser?.isDemo;

      if (isDemo) {
        try {
          logger.debug("Auth", "Phiên trải nghiệm hết hạn (401), đang tự động làm mới...");
          const demoResponse = await axios.post(`${API_BASE_URL}/Auth/demo-login`);
          const data = demoResponse.data?.data;
          const newAccessToken = data?.accessToken;

          if (!newAccessToken) {
            throw new Error("Không nhận được token từ /Auth/demo-login");
          }

          await saveTokens(newAccessToken, '');
          useAuthStore.getState().setToken(newAccessToken);

          processQueue(null, newAccessToken);
          originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;
          return apiClient(originalRequest);
        } catch (demoErr: any) {
          logger.warn("Auth", "Làm mới phiên trải nghiệm thất bại sau 401:", demoErr?.message);
          processQueue(demoErr, null);
          await clearTokens();
          useAuthStore.getState().setToken(null);
          return Promise.reject(demoErr);
        } finally {
          isRefreshing = false;
        }
      }

      // Regular user token refresh
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
