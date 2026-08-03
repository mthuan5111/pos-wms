import React, {useState, useEffect} from 'react';
import { Text, View, StyleSheet, Button, Dimensions} from 'react-native';
import { CameraView, Camera } from 'expo-camera';

interface BarcodeScannerProps {
    onScanSuccess: (data: string) => void;
    onClose?: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);

    useEffect(() => {
        const getCameraPermissions = async() => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted')
        };

        getCameraPermissions();
    }, []);

    const handleBarcodeScanned = ({ data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);
        onScanSuccess(data);
    };
    if(hasPermission === null) {
        return (
            <View className='flex-1 justify-center items-center bg-black'>
                <Text className='text-white'>Đang yêu cầu cấp quyền Camera...</Text>
            </View>
        );
    }
    if (hasPermission === false){
        return (
            <View className='flex-1 justify-center items-center bg-black p-4'>
                <Text className='text-white text-center mb-4'>Không có quyền truy cập Camera. Vui lòng cấp quyền trong cài đặt thiết bị.</Text>
                {onClose && <Button title='Đóng' onPress={onClose}/>}
            </View>
        );
    }
    return (
    <View className='flex-1 bg-black'>
        <CameraView
            onBarcodeScanned={scanned ? undefined: handleBarcodeScanned}
            barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "code128"],
            }}
            style = {StyleSheet.absoluteFillObject}
        >
            <View className='flex-1 justify-center items-center bg-black/40'>
                <Text className='text-white text-lg font-semibold mb-8'>Đưa mã vạch vào trong khung hình</Text>
                <View className='w-72 h-48 border-2 border-blue-500 rounded-2xl bg-transparent relative overflow-hidden'>
                    <View className='absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white'/>
                    <View className='absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white'/>
                    <View className='absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white'/>
                    <View className='absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white'/>
                </View>

                {scanned && (
                    <View className='mt-8'>
                        <Button title='Quét lại' onPress={() => setScanned(false)}/>
                    </View>
                )}
                {onClose && !scanned && (
                    <View className='mt-12'>
                        <Button title='Hủy / Đóng' color='red' onPress={onClose}/>
                    </View>
                )}
            </View>
        </CameraView>
    </View>
);
}
