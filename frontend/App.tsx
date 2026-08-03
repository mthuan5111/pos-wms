import './global.css';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { initLocalDatabase } from '@/database/db';
import RootNavigator from '@/navigation/RootNavigator';

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
      <View className='flex-1 justify-center items-center bg-white'>
        <ActivityIndicator size = 'large' color='#2563eb'/>
        <Text className='mt-4 text-gray-500 font-medium'>Đang thiết lập dữ liệu Offline...</Text>
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style='auto'/>
      <RootNavigator/>
    </SafeAreaProvider>
  );
}