import React, { useState, useRef } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Ionicons } from '@expo/vector-icons';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { useAuthStore } from '@/store/authStore';
import { useBootstrapStore } from '@/store/useBootstrapStore';
import apiClient from '@/services/apiClient';
import { clearTokens } from '@/utils/token';
import { parseApiError } from '@/utils/errorParser';
import { logger } from '@/utils/logger';
import { BUILD_INFO } from '@/config/buildInfo';

const loginSchema = z.object({
    username: z.string().min(1, 'Tên đăng nhập không được để trống'),
    password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
    const { setAuthAsync } = useAuthStore();
    const [apiError, setApiError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const passwordInputRef = useRef<TextInput>(null);

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
        if (isLoading) return;
        setIsLoading(true);
        setApiError(null);
        try {
            await clearTokens();
            logger.debug("Auth", "Đang gửi yêu cầu đăng nhập...");
            const response = await apiClient.post('/Auth/login', {
                username: data.username.trim(),
                password: data.password,
            });

            if (response.data?.isSuccess && response.data?.data) {
                const loginResult = response.data.data;
                const { accessToken, refreshToken, ...userInfo } = loginResult;
                logger.info("Auth", "Đăng nhập thành công, khởi tạo phiên người dùng", { role: userInfo.role });
                useBootstrapStore.getState().reset();
                await setAuthAsync(userInfo, accessToken, refreshToken);
            } else {
                setApiError(response.data?.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
            }
        } catch (error: any) {
            const parsed = parseApiError(error);
            logger.warn("Auth", "Đăng nhập thất bại:", { title: parsed.title, message: parsed.message, status: parsed.statusCode });
            setApiError(parsed.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDemoLogin = async () => {
        if (isLoading) return;
        setIsLoading(true);
        setApiError(null);
        try {
            await clearTokens();
            logger.debug("Auth", "Bắt đầu đăng nhập trải nghiệm...");
            const response = await apiClient.post('/Auth/demo-login');
            const data = response.data?.data;
            if (data?.accessToken) {
                logger.info("Auth", "Đăng nhập trải nghiệm thành công");
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
                setApiError(response.data?.message || 'Không thể bắt đầu phiên trải nghiệm. Vui lòng thử lại sau.');
            }
        } catch (error: any) {
            const parsed = parseApiError(error);
            logger.warn("Auth", "Đăng nhập trải nghiệm thất bại:", { title: parsed.title, message: parsed.message, status: parsed.statusCode });
            setApiError(parsed.message);
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

                    {/* Error Banner */}
                    {apiError && (
                        <View className='bg-black p-3.5 mb-5 flex-row items-center justify-between'>
                            <Text className='text-white font-medium flex-1 mr-2' style={{ fontSize: 13, letterSpacing: 0.3 }}>
                                {apiError}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setApiError(null)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons name="close" size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Form */}
                    <View>
                        <Controller
                            control={control}
                            name="username"
                            render={({ field: { onChange, onBlur, value } }) => (
                                <CustomInput
                                    label='Tên đăng nhập *'
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    error={errors.username?.message}
                                    autoCapitalize='none'
                                    autoComplete="username"
                                    returnKeyType="next"
                                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                                />
                            )}
                        />

                        <Controller
                            control={control}
                            name="password"
                            render={({ field: { onChange, onBlur, value } }) => (
                                <CustomInput
                                    ref={passwordInputRef}
                                    label='Mật khẩu *'
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    error={errors.password?.message}
                                    autoCapitalize='none'
                                    autoComplete="current-password"
                                    secureTextEntry={!showPassword}
                                    returnKeyType="go"
                                    onSubmitEditing={handleSubmit(onSubmit)}
                                    rightElement={
                                        <TouchableOpacity
                                            onPress={() => setShowPassword(!showPassword)}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            accessibilityLabel={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                        >
                                            <Ionicons
                                                name={showPassword ? "eye-off-outline" : "eye-outline"}
                                                size={20}
                                                color="#6b7280"
                                            />
                                        </TouchableOpacity>
                                    }
                                />
                            )}
                        />
                    </View>

                    {/* Login Button */}
                    <View className='mt-6'>
                        <CustomButton
                            testID="login-submit-button"
                            title={isLoading ? 'Đang đăng nhập...' : 'Đăng nhập →'}
                            onPress={handleSubmit(onSubmit)}
                            disabled={isLoading}
                            loading={isLoading}
                        />
                    </View>

                    {/* Quick Demo Access Button */}
                    <View className='mt-3'>
                        <TouchableOpacity
                            testID="quick-demo-login-button"
                            accessibilityRole="button"
                            accessibilityLabel="Đăng nhập trải nghiệm"
                            onPress={handleDemoLogin}
                            disabled={isLoading}
                            className='py-2.5 px-3 border border-dashed border-neutral-300 rounded items-center bg-neutral-50 active:bg-neutral-100'
                        >
                            <Text className='text-xs font-semibold text-neutral-700'>
                                👤 Đăng nhập trải nghiệm
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Build / Version Metadata */}
                    <View className="items-center mt-6">
                        <Text className="text-[11px] text-neutral-600 font-mono">
                            v{BUILD_INFO.version}
                        </Text>
                    </View>

                    {/* Bottom decorative element */}
                    <View className="items-center mt-4">
                        <View style={{ width: 24, height: 2, backgroundColor: '#E5E5E5' }} />
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
