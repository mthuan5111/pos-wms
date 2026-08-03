import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { useAuthStore } from '@/store/authStore';
import apiClient from '@/services/apiClient';

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
            console.log("1. Đang gửi Request đăng nhập...");
            const response = await apiClient.post('/Auth/login', {
                username: data.username,
                password: data.password,
            });
            const result = response.data;
            console.log("2. Nhận kết quả từ Backend:", result);
            if (result.isSuccess) {
                const { accessToken, refreshToken, ...userInfo } = result.data;
                console.log("3. Thông tin User bóc tách được:", userInfo);
                await setAuthAsync( userInfo, accessToken, refreshToken);
                console.log("4. Lưu Store thành công! Đang chờ Navigation tự chuyển...");
            } else {
                setApiError(result.message || 'Đăng nhập thất bại');
            }
        } catch (error: any) {
            console.log("🚨 Lỗi Catch:", error);
            if (error.isAxiosError) {
                setApiError(error.response?.data?.message || 'Lỗi mạng: Không thể kết nối máy chủ');
            } else {
                // Nếu không phải lỗi API, đây chính là lỗi Code/Thư viện!
                setApiError('Lỗi hệ thống (Code/Store): ' + error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return(
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-white justify-center px-6"
        >
            <View className='items-center mb-10'>
                <View className='w-24 h-24 bg-blue-100 rounded-full items-center justify-center mb-4'>
                    <Text className='text-3xl text-blue-600 font-bold'>POS</Text>
                </View>
                <Text className='text-2xl font-bold text-gray-800'>Chào mừng trở lại</Text>
                <Text className='text-gray-500 mt-2'>Đăng nhập để quản lý hệ thống</Text>
            </View>
            {apiError && (
                <View className='bg-red-50 p-3 rounded-lg mb-4'>
                    <Text className='text-red-600 text-center font-medium'>{apiError}</Text>
                </View>
            )}

            <View className='space-y-4'>
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

            <View className='mt-8'>
                <CustomButton
                    title={isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    onPress={handleSubmit(onSubmit)}
                    disabled={isLoading}
                    loading={isLoading}
                />
            </View>
        </KeyboardAvoidingView>
    )
}