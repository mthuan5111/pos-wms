import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { useAuthStore } from "@/store/authStore";
import { useBootstrapStore } from "@/store/useBootstrapStore";
import MainNavigator from "./MainNavigator";
import LoginScreen from "@/screens/auth/LoginScreen";
import BootstrapScreen from "@/screens/auth/BootstrapScreen";
import { View, ActivityIndicator } from "react-native";

export default function RootNavigator() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const isHydrating = useAuthStore((state) => state.isHydrating);
    const hydrateSessionAsync = useAuthStore((state) => state.hydrateSessionAsync);
    const bootstrapStatus = useBootstrapStore((state) => state.status);

    useEffect(() => {
        hydrateSessionAsync();
    }, [hydrateSessionAsync]);

    const renderContent = () => {
        if (isHydrating) {
            return (
                <View className="flex-1 justify-center items-center bg-white">
                    <ActivityIndicator size="large" color="#000000" />
                </View>
            );
        }

        if (!isAuthenticated) {
            return <LoginScreen />;
        }

        if (["ready", "readyWithCache"].includes(bootstrapStatus)) {
            return <MainNavigator />;
        }

        return <BootstrapScreen />;
    };

    return (
        <NavigationContainer>
            {renderContent()}
        </NavigationContainer>
    );
}
