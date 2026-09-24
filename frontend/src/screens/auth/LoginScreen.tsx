import { useModalStore } from '@/store/useModalStore';
import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { useAuthStore } from '@/store/authStore';
import { useBootstrapStore } from '@/store/useBootstrapStore';
import apiClient from '@/services/apiClient';
import { clearTokens } from '@/utils/token';

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
        setValue,
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
            // Đảm bảo xóa token cũ để tránh xung đột phiên hoặc đính kèm Authorization header rác
            await clearTokens();

            console.log("[Auth] Đang gửi Request đăng nhập...");
            const response = await apiClient.post('/Auth/login', {
                username: data.username.trim(),
                password: data.password,
            });

            if (response.data?.isSuccess && response.data?.data) {
                const loginResult = response.data.data;
                const { accessToken, refreshToken, ...userInfo } = loginResult;
                console.log("[Auth] Đăng nhập thành công, lưu Token vào Store...", userInfo.role);
                useBootstrapStore.getState().reset();
                await setAuthAsync(userInfo, accessToken, refreshToken);
                // Sau khi lưu token, RootNavigator sẽ tự động switch sang BootstrapScreen
            } else {
                setApiError(response.data?.message || 'Đăng nhập thất bại');
            }
        } catch (error: any) {
            if (__DEV__) {
                console.log("[Auth Debug]", {
                    endpoint: error.config?.url,
                    status: error.response?.status,
                    errorCode: error.response?.data?.errorCode,
                    message: error.response?.data?.message,
                    code: error.code
                });
            }

            if (error.isAxiosError) {
                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    setApiError('Máy chủ phản hồi quá lâu (Timeout). Vui lòng thử lại.');
                } else if (!error.response) {
                    setApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng hoặc địa chỉ máy chủ backend.');
                } else {
                    const status = error.response.status;
                    if (status === 400) {
                        setApiError('Dữ liệu đăng nhập không hợp lệ. Vui lòng kiểm tra lại.');
                    } else if (status === 401) {
                        setApiError('Tài khoản hoặc mật khẩu không đúng.');
                    } else if (status === 403) {
                        setApiError('Tài khoản không có quyền đăng nhập hoặc đã bị hạn chế truy cập.');
                    } else if (status === 404) {
                        setApiError('Không tìm thấy dịch vụ đăng nhập máy chủ (404 Not Found). Vui lòng kiểm tra lại cấu hình API.');
                    } else if (status === 429) {
                        setApiError('Hệ thống ghi nhận quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ít phút.');
                    } else if (status >= 500) {
                        setApiError(`Hệ thống máy chủ đang gặp sự cố (HTTP ${status}). Vui lòng thử lại sau.`);
                    } else {
                        setApiError(error.response?.data?.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
                    }
                }
            } else {
                setApiError('Lỗi hệ thống: ' + error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDemoLogin = async () => {
        setIsLoading(true);
        setApiError(null);
        try {
            await clearTokens();
            const response = await apiClient.post('/Auth/demo-login');
            const data = response.data?.data;
            if (data?.accessToken) {
                await setAuthAsync(
                    {
                        id: data.id,
                        username: data.username,
                        name: data.name,
                        role: data.role,
                    },
                    data.accessToken,
                    data.refreshToken || ''
                );
            } else {
                setApiError(response.data?.message || 'Đăng nhập Demo không thành công');
            }
        } catch (error: any) {
            if (error.response?.status === 429) {
                setApiError('Hệ thống ghi nhận quá nhiều yêu cầu Demo. Vui lòng thử lại sau ít phút.');
            } else {
                setApiError(error.response?.data?.message || 'Không thể kết nối máy chủ Demo. Vui lòng thử lại.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1 bg-white"
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-md self-center">
                    {/* Editorial Logo & Title */}
                    <View className='items-center mb-8'>
                        {/* Oversized Masthead */}
                        <Text style={{ fontFamily: 'serif', fontSize: 56, fontWeight: '900', color: '#000', letterSpacing: -2 }}>
                            POS
                        </Text>
                        {/* Decorative Rule */}
                        <View className="flex-row items-center mt-1 mb-3">
                            <View style={{ width: 48, height: 3, backgroundColor: '#000' }} />
                            <View style={{ width: 8, height: 8, borderWidth: 2, borderColor: '#000', marginHorizontal: 6 }} />
                            <View style={{ width: 48, height: 3, backgroundColor: '#000' }} />
                        </View>
                        {/* Subtitle */}
                        <Text style={{ fontSize: 10, letterSpacing: 4, color: '#525252', textTransform: 'uppercase' }}>
                            Warehouse Management
                        </Text>
                    </View>

                    {/* Thick separator */}
                    <View style={{ width: '100%', height: 3, backgroundColor: '#000', marginBottom: 24 }} />

                    {/* Error Banner — inverted */}
                    {apiError && (
                        <View className='bg-black p-3.5 mb-5'>
                            <Text className='text-white text-center font-medium' style={{ fontSize: 13, letterSpacing: 0.5 }}>
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
                                    label='Tên đăng nhập *'
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    error={errors.username?.message}
                                    autoCapitalize='none'
                                    autoComplete="username"
                                />
                            )}
                        />

                        <Controller
                            control={control}
                            name="password"
                            render={({ field: { onChange, onBlur, value}}) => (
                                <CustomInput
                                    label='Mật khẩu *'
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    error={errors.password?.message}
                                    autoCapitalize='none'
                                    autoComplete="current-password"
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

                    {/* Quick Demo Access Button */}
                    <View className='mt-3'>
                        <TouchableOpacity
                            onPress={handleDemoLogin}
                            disabled={isLoading}
                            className='py-2.5 px-3 border border-dashed border-neutral-300 rounded items-center bg-neutral-50 active:bg-neutral-100'
                        >
                            <Text className='text-xs font-semibold text-neutral-600'>
                                👤 Trải nghiệm Demo ngay (@demo_viewer)
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Bottom decorative element */}
                    <View className="items-center mt-8">
                        <View style={{ width: 24, height: 2, backgroundColor: '#E5E5E5' }} />
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
