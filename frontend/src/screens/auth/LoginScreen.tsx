import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { useAuthStore } from '@/store/authStore';
import apiClient from '@/services/apiClient';
import { pullMasterData } from '@/database/db';

const loginSchema = z.object({
    username: z.string().min(1, 'Tên đăng nhập không được để trống'),
    password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
    const { setAuthAsync } = useAuthStore();
    const [apiError, setApiError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: '',
            password: '',
        },
    });
    
    const onSubmit = async (data: LoginFormData) => {
        setIsLoading(true);
        setApiError(null);
        try {
            console.log("[Auth] Đang gửi Request đăng nhập...");
            const response = await apiClient.post('/Auth/login', {
                username: data.username,
                password: data.password,
            });
            const result = response.data;
            if (result.isSuccess) {
                const { accessToken, refreshToken, ...userInfo } = result.data;
                console.log("[Auth] Đăng nhập thành công, lưu Token vào Store...");
                await setAuthAsync( userInfo, accessToken, refreshToken);
                console.log("[DB] Lưu Store thành công! Đang tiến hành đồng bộ dữ liệu...");
                try {
                    await pullMasterData();
                    console.log("[DB] Đồng bộ dữ liệu thành công! Đang chờ Navigation tự chuyển...");
                } catch (e) {
                    console.error("Lỗi đồng bộ dữ liệu ban đầu:", e);
                    // Vẫn cho đăng nhập nhưng báo lỗi
                    Alert.alert("Cảnh báo", "Không thể tải dữ liệu mới nhất. Ứng dụng sẽ dùng dữ liệu cũ.");
                }
            } else {
                setApiError(result.message || 'Đăng nhập thất bại');
            }
        } catch (error: any) {
            console.error("[Auth] Lỗi Catch:", error.message, error.response?.status ?? "No response");
            if (error.isAxiosError) {
                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    setApiError('Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
                } else if (!error.response) {
                    // This catches Network Error or ERR_CONNECTION_REFUSED
                    setApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra backend và địa chỉ API.');
                } else if (error.response.status === 401) {
                    setApiError('Tên đăng nhập hoặc mật khẩu không đúng.');
                } else {
                    setApiError(error.response?.data?.message || 'Lỗi mạng: Không thể kết nối máy chủ');
                }
            } else {
                // Nếu không phải lỗi API, đây chính là lỗi Code/Thư viện!
                setApiError('Lỗi hệ thống: ' + error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return(
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-white justify-center px-8"
        >
            {/* Editorial Logo & Title */}
            <View className='items-center mb-12'>
                {/* Oversized Masthead */}
                <Text style={{ fontFamily: 'serif', fontSize: 72, fontWeight: '900', color: '#000', letterSpacing: -3 }}>
                    POS
                </Text>
                {/* Decorative Rule */}
                <View className="flex-row items-center mt-2 mb-4">
                    <View style={{ width: 60, height: 4, backgroundColor: '#000' }} />
                    <View style={{ width: 10, height: 10, borderWidth: 2, borderColor: '#000', marginHorizontal: 8 }} />
                    <View style={{ width: 60, height: 4, backgroundColor: '#000' }} />
                </View>
                {/* Subtitle */}
                <Text style={{ fontSize: 11, letterSpacing: 6, color: '#525252', textTransform: 'uppercase' }}>
                    Warehouse Management
                </Text>
            </View>

            {/* Thick separator */}
            <View style={{ width: '100%', height: 4, backgroundColor: '#000', marginBottom: 32 }} />

            {/* Error Banner — inverted */}
            {apiError && (
                <View className='bg-black p-4 mb-6'>
                    <Text className='text-white text-center font-medium' style={{ fontSize: 13, letterSpacing: 1 }}>
                        {apiError}
                    </Text>
                </View>
            )}

            {/* Form */}
            <View>
                <Controller
                    control={control}
                    name="username"
                    render={({ field: { onChange, onBlur, value}}) => (
                        <CustomInput
                            label='Tên đăng nhập'
                            placeholder='Nhập tên đăng nhập'
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            error={errors.username?.message}
                            autoCapitalize='none'
                        />
                    )}
                />

                <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, onBlur, value}}) => (
                        <CustomInput
                            label='Mật khẩu'
                            placeholder='Nhập mật khẩu'
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            error={errors.password?.message}
                            autoCapitalize='none'
                            secureTextEntry
                        />
                    )}
                />
            </View>

            {/* Login Button */}
            <View className='mt-6'>
                <CustomButton
                    title={isLoading ? 'Đang đăng nhập...' : 'Đăng nhập →'}
                    onPress={handleSubmit(onSubmit)}
                    disabled={isLoading}
                    loading={isLoading}
                />
            </View>

            {/* Bottom decorative element */}
            <View className="items-center mt-10">
                <View style={{ width: 24, height: 2, backgroundColor: '#E5E5E5' }} />
            </View>
        </KeyboardAvoidingView>
    )
}