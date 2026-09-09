import React, {useState, useEffect, useRef} from 'react';
import { Text, View, StyleSheet, TouchableOpacity} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';

interface BarcodeScannerProps {
    onScanSuccess: (data: string) => void;
    onClose?: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const lastScannedTime = useRef<number>(0);
    const lastScannedData = useRef<string>('');

    useEffect(() => {
        const getCameraPermissions = async() => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted')
        };
        getCameraPermissions();
    }, []);

    const playBeep = async () => {
        try {
            const { Platform, Vibration } = require('react-native');
            Vibration.vibrate(50);
        } catch (error) {
            console.log(error);
        }
    }

    const handleBarcodeScanned = ({ data }: { type: string; data: string }) => {
        const now = Date.now();
        // Prevent scanning the exact same barcode within 2 seconds
        if (data === lastScannedData.current && now - lastScannedTime.current < 2000) {
            return;
        }
        // Prevent scanning different barcodes within 0.5 second (throttle)
        if (now - lastScannedTime.current < 500) {
            return;
        }
        
        lastScannedTime.current = now;
        lastScannedData.current = data;
        
        playBeep();
        onScanSuccess(data);
    };

    if(hasPermission === null) {
        return (
            <View className='flex-1 justify-center items-center bg-black'>
                <Text className='text-white' style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' }}>
                    Đang yêu cầu cấp quyền Camera...
                </Text>
            </View>
        );
    }
    if (hasPermission === false){
        return (
            <View className='flex-1 justify-center items-center bg-black p-6'>
                <Ionicons name="camera-outline" size={48} color="#ffffff" />
                <View style={{ width: 40, height: 2, backgroundColor: '#fff', marginVertical: 16 }} />
                <Text className='text-white text-center mb-6' style={{ fontSize: 14, letterSpacing: 1 }}>
                    Không có quyền truy cập Camera. Vui lòng cấp quyền trong cài đặt thiết bị.
                </Text>
                {onClose && (
                    <TouchableOpacity
                        onPress={onClose}
                        className="bg-white px-8 py-4"
                    >
                        <Text className="text-black font-bold" style={{ fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' }}>
                            Đóng
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    }
    return (
    <View className='flex-1 bg-black'>
        <CameraView
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "code128"],
            }}
            style = {StyleSheet.absoluteFillObject}
        >
            <SafeAreaView className='flex-1'>
                {/* Header with close button */}
                {onClose && (
                    <View className="flex-row justify-end p-4 z-10">
                        <TouchableOpacity
                            onPress={onClose}
                            className="bg-black/70 p-2">
                                <Ionicons name="close" size={28} color="white" />
                            </TouchableOpacity>
                    </View>
                )}
                <View className="flex-1 justify-center items-center">
                    <View className="bg-black/60 px-6 py-3 mb-8">
                        <Text className="text-white font-medium" style={{ fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' }}>
                            Đưa mã vạch vào khung hình
                        </Text>
                    </View>
                    {/* Scanner Frame — sharp corners, white borders */}
                    <View className="w-72 h-48 relative justify-center items-center">
                        <View className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white"/>
                        <View className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white"/>
                        <View className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white"/>
                        <View className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white"/>
                        {/* Scanning Line */}
                        <View className="w-full h-0.5 bg-white/60 absolute top-1/2"/>
                    </View>
                    <View className="mt-8 bg-black/60 px-4 py-2">
                        <Text className="text-white/80" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
                            Quét liên tục — Không cần bấm nút
                        </Text>
                    </View>
                </View>
            </SafeAreaView>
        </CameraView>
    </View>
);
}
