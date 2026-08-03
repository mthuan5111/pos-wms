import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from '@/types/navigation';
import PosScreen from '@/screens/main/PosScreen';
import InventoryScreen from '@/screens/main/InventoryScreen';
import SettingsScreen from '@/screens/main/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
    return (
        <Tab.Navigator screenOptions={({ route }) => ({
            headerShown: true,
            headerTitleStyle: { fontWeight: 'bold' },
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: '#6b7280',
            tabBarStyle: {
                height: 60,
                paddingBottom: 8,
                paddingTop: 6,
            },
            tabBarIcon: ({ focused, color, size }) => {
                let iconName: keyof typeof Ionicons.glyphMap = 'cart';

                if (route.name === 'POS') {
                    iconName = focused ? 'cart' : 'cart-outline';
                } else if (route.name === 'Inventory') {
                    iconName = focused ? 'cube' : 'cube-outline';
                } else if (route.name === 'Settings') {
                    iconName = focused ? 'settings' : 'settings-outline';
                }
            }
        })}>
            <Tab.Screen name="POS" component={PosScreen} options={{ tabBarLabel: "Bán hàng" }} />
            <Tab.Screen name="Inventory" component={InventoryScreen} options={{ tabBarLabel: "Kho hàng" }} />
            <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: "Cài đặt" }} />
        </Tab.Navigator>
    );
}