import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_PROFILE_KEY = 'user_profile';

export const saveTokens = async (accessToken: string, refreshToken: string) => {
    if (Platform.OS === 'web') {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    }
};

export const getAccessToken = async () => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
};

export const getRefreshToken = async () => {
    if (Platform.OS === 'web') {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

export const clearTokens = async () => {
    if (Platform.OS === 'web') {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_PROFILE_KEY);
    } else {
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
    }
};

export const saveUserProfile = async (user: any) => {
    if (Platform.OS === 'web') {
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
    } else {
        await SecureStore.setItemAsync(USER_PROFILE_KEY, JSON.stringify(user));
    }
};

export const getUserProfile = async () => {
    try {
        if (Platform.OS === 'web') {
            const item = localStorage.getItem(USER_PROFILE_KEY);
            return item ? JSON.parse(item) : null;
        }
        const item = await SecureStore.getItemAsync(USER_PROFILE_KEY);
        return item ? JSON.parse(item) : null;
    } catch {
        return null;
    }
};

export const decodeJwtPayload = (token: string): any => {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(base64);
        return JSON.parse(json);
    } catch {
        return null;
    }
};
