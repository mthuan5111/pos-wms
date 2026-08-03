import { NavigationContainer } from "@react-navigation/native";
import { useAuthStore } from "@/store/authStore";
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import LoginScreen from "@/screens/auth/LoginScreen";
import {View, Text} from "react-native";

export default function RootNavigator() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    return(
        <NavigationContainer>
            {isAuthenticated ? (
                <MainNavigator/>
            ) : (
                <LoginScreen/>
            )} 
        </NavigationContainer>
    )
}