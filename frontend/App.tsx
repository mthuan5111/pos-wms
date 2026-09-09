import "./global.css";
import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initLocalDatabase } from "@/database/db";
import RootNavigator from "@/navigation/RootNavigator";

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    async function setupDatabase() {
      try {
        await initLocalDatabase();
      } catch (e) {
        console.error("Lỗi khởi tạo DB: ", e);
      } finally {
        setIsDbReady(true);
      }
    }
    setupDatabase();
  }, []);
  if (!isDbReady) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#000000" />
        <View className="mt-6 items-center">
          <Text style={{ fontFamily: 'serif', fontSize: 14, letterSpacing: 4, color: '#000', textTransform: 'uppercase' }}>
            Đang thiết lập
          </Text>
          <View style={{ width: 40, height: 2, backgroundColor: '#000', marginTop: 12 }} />
        </View>
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
