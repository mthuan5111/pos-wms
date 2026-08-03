import { useAuthStore } from '@/store/authStore';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from '@/utils/token';
import axios from 'axios';

const API_BASE_URL = "http://localhost:5050/api";
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

apiClient.interceptors.request.use(
    async (config) => {
        const token = await getAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config;
    },
    (error) => Promise.reject(error)
)

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const accessToken = await getAccessToken();
                const refreshToken = await getRefreshToken();

                if (!refreshToken) throw new Error("Không có Refresh Token");

                const refreshResponse = await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/Auth/refresh-token`, {
                    accessToken: accessToken,
                    refreshToken: refreshToken
                });

                const newAccessToken = refreshResponse.data.data?.accessToken || refreshResponse.data.accessToken;
                const newRefreshToken = refreshResponse.data.data?.refreshToken || refreshResponse.data.refreshToken;

                await saveTokens(newAccessToken, newRefreshToken);

                useAuthStore.getState().setToken(newAccessToken);

                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                await clearTokens();
                useAuthStore.getState().setToken(null);

                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
)

export default apiClient;