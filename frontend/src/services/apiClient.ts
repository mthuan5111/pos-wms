import { useAuthStore } from "@/store/authStore";
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from "@/utils/token";
import axios, { AxiosError } from "axios";

let API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_BASE_URL) {
  console.error("Critical Error: API_BASE_URL is undefined or empty!");
} else {
  try {
    const urlObj = new URL(API_BASE_URL);
    if (__DEV__) {
      // In development, allow HTTP for localhost and LAN IPs
      const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
      const isLanIp = /^192\.168\.\d+\.\d+$/.test(urlObj.hostname) || /^10\.\d+\.\d+\.\d+$/.test(urlObj.hostname);
      
      if (urlObj.protocol === 'http:' && !isLocalhost && !isLanIp) {
         console.warn(`[API] Warning: HTTP is used for a non-local address (${urlObj.hostname}). This is not recommended.`);
      }
    } else {
      // In production, enforce HTTPS
      if (urlObj.protocol !== 'https:') {
        throw new Error('API_URL must use HTTPS in production');
      }
    }
    
    // Normalize trailing slash
    if (API_BASE_URL.endsWith('/')) {
      API_BASE_URL = API_BASE_URL.slice(0, -1);
    }
  } catch (error) {
    console.error("Invalid API_URL configuration:", error);
  }
}

if (__DEV__) {
  console.log(`[API] Configuring apiClient with baseURL: ${API_BASE_URL}`);
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
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
