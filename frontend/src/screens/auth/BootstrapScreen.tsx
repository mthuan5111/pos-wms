import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useBootstrapStore } from "@/store/useBootstrapStore";
import CustomButton from "@/components/CustomButton";

export default function BootstrapScreen() {
    const { status, failedModules, startBootstrap, retryBootstrap, continueOffline } = useBootstrapStore();

    useEffect(() => {
        if (status === "idle") {
            startBootstrap(false);
        }
    }, [status, startBootstrap]);

    const isLoading = [
        "idle",
        "initializingDatabase",
        "loadingSession",
        "pullingMasterData",
        "reconciling",
        "syncing"
    ].includes(status);

    const getStatusMessage = () => {
        switch (status) {
            case "initializingDatabase": return "Khởi tạo cơ sở dữ liệu...";
            case "loadingSession": return "Đang tải phiên đăng nhập...";
            case "pullingMasterData": return "Đang tải dữ liệu...";
            case "syncing": return "Đang đồng bộ thay đổi...";
            default: return "Đang thiết lập...";
        }
    };

    return (
        <View className="flex-1 bg-white justify-center items-center px-8">
            <View className="items-center mb-12">
                <Text style={{ fontFamily: 'serif', fontSize: 72, fontWeight: '900', color: '#000', letterSpacing: -3 }}>
                    POS
                </Text>
                <View className="flex-row items-center mt-2 mb-4">
                    <View style={{ width: 60, height: 4, backgroundColor: '#000' }} />
                    <View style={{ width: 10, height: 10, borderWidth: 2, borderColor: '#000', marginHorizontal: 8 }} />
                    <View style={{ width: 60, height: 4, backgroundColor: '#000' }} />
                </View>
                <Text style={{ fontSize: 11, letterSpacing: 6, color: '#525252', textTransform: 'uppercase' }}>
                    Warehouse Management
                </Text>
            </View>

            {isLoading && (
                <View className="items-center w-full max-w-sm mt-8 p-6 border-2 border-black">
                    <ActivityIndicator size="large" color="#000" />
                    <Text className="mt-4 font-bold text-black" style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                        {getStatusMessage()}
                    </Text>
                </View>
            )}

            {status === "failed" && (
                <View className="w-full max-w-sm border-2 border-black p-6 bg-white">
                    <Text className="font-black text-black mb-4 text-center" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Lỗi Tải Dữ Liệu
                    </Text>
                    <Text className="text-black text-center mb-6" style={{ fontSize: 14 }}>
                        Không thể tải: {failedModules.join(", ")}
                    </Text>
                    <CustomButton title="THỬ LẠI" onPress={retryBootstrap} />
                </View>
            )}

            {status === "partial" && (
                <View className="w-full max-w-sm border-2 border-black p-6 bg-white">
                    <Text className="font-black text-black mb-4 text-center" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Đang Sử Dụng Dữ Liệu Đã Lưu
                    </Text>
                    <Text className="text-black text-center mb-6" style={{ fontSize: 14 }}>
                        Không thể cập nhật: {failedModules.join(", ")}
                    </Text>
                    <CustomButton title="THỬ LẠI" onPress={retryBootstrap} />
                    <View className="mt-3">
                        <CustomButton title="TIẾP TỤC NGOẠI TUYẾN" onPress={continueOffline} />
                    </View>
                </View>
            )}
        </View>
    );
}
