import { create } from "zustand";
import { saveTokens, clearTokens } from "@/utils/token";
import * as SecureStore from 'expo-secure-store';

interface User {
    username: string;
    name: string;
    role: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    setAuthAsync: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
    setToken: (token: string | null) => void;
    logoutAsync: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    setAuthAsync: async (user, accessToken, refreshToken) => {
        await saveTokens(accessToken, refreshToken);
        set({ user, token: accessToken, isAuthenticated: true });
    },
    setToken: (token) => {
        set({ token, isAuthenticated: !!token });
    },
    logoutAsync: async () => {
        try{
            await clearTokens();
        } catch(error){
            console.error('Error occurred while clearing tokens:', error);
        } finally {
            set({ user: null, token: null, isAuthenticated: false });
        }
    }
}));