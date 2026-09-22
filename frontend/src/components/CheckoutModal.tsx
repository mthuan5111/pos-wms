import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomButton from './CustomButton';

interface CheckoutModalProps {
    visible: boolean;
    onClose: () => void;
    totalAmount: number;
    onConfirm: (paymentMethod: 'CASH' | 'QR', customerGivenAmount: number) => void;
    isSubmitting?: boolean;
}

export default function CheckoutModal({ visible, onClose, totalAmount, onConfirm, isSubmitting = false }: CheckoutModalProps) {
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QR'>('CASH');
    const [customerGivenStr, setCustomerGivenStr] = useState('');
    const [cashError, setCashError] = useState<string | null>(null);
    const isSubmittingRef = useRef(false);

    useEffect(() => {
        if (!visible) {
            isSubmittingRef.current = false;
            setCashError(null);
            setCustomerGivenStr('');
        }
    }, [visible]);

    const customerGiven = parseInt(customerGivenStr.replace(/\D/g, ''), 10) || 0;
    const changeAmount = customerGiven - totalAmount;

    // Dummy QR Code generator from vietqr.io (using predefined template)
    const qrUrl = `https://img.vietqr.io/image/970422-0987654321-compact2.png?amount=${totalAmount}&addInfo=ThanhToanPOS&accountName=POS STORE`;

    const handleConfirm = () => {
        if (isSubmitting || isSubmittingRef.current) return;
        if (paymentMethod === 'CASH') {
            if (!customerGivenStr.trim()) {
                setCashError("Vui lòng nhập số tiền khách đưa.");
                return;
            }
            if (changeAmount < 0) {
                setCashError(`Khách đưa chưa đủ tiền. Còn thiếu ${Math.abs(changeAmount).toLocaleString("vi-VN")} đ.`);
                return;
            }
        }
        setCashError(null);
        isSubmittingRef.current = true;
        onConfirm(paymentMethod, paymentMethod === 'CASH' ? customerGiven : totalAmount);
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View className="flex-1 bg-black/70 justify-center items-center">
                <View className="bg-white w-11/12 max-w-lg overflow-hidden border-2 border-black">
                    {/* Header */}
                    <View className="bg-black p-5 flex-row justify-between items-center">
                        <Text className="text-white font-bold" style={{ fontSize: 13, letterSpacing: 4, textTransform: 'uppercase' }}>
                            Thanh Toán
                        </Text>
                        <TouchableOpacity onPress={onClose} className="p-1">
                            <Ionicons name="close" size={24} color="white" />
                        </TouchableOpacity>
                    </View>

                    <View className="p-6">
                        {/* Total */}
                        <View className="flex-row justify-between items-end mb-6 pb-6 border-b-4 border-black">
                            <Text className="text-black" style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' }}>
                                Tổng cộng
                            </Text>
                            <Text className="text-black font-black" style={{ fontFamily: 'serif', fontSize: 32 }}>
                                {totalAmount.toLocaleString()} đ
                            </Text>
                        </View>

                        {/* Payment Method */}
                        <Text className="font-bold text-black mb-3" style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' }}>
                            Phương thức
                        </Text>
                        <View className="flex-row gap-3 mb-6">
                            <TouchableOpacity
                                onPress={() => setPaymentMethod('CASH')}
                                className={`flex-1 py-3 items-center border-2 ${paymentMethod === 'CASH' ? 'border-black bg-black' : 'border-black bg-white'}`}
                            >
                                <Ionicons name="cash-outline" size={24} color={paymentMethod === 'CASH' ? '#fff' : '#000'} />
                                <Text className={`mt-1 font-medium ${paymentMethod === 'CASH' ? 'text-white' : 'text-black'}`} style={{ fontSize: 12, letterSpacing: 2 }}>
                                    TIỀN MẶT
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setPaymentMethod('QR')}
                                className={`flex-1 py-3 items-center border-2 ${paymentMethod === 'QR' ? 'border-black bg-black' : 'border-black bg-white'}`}
                            >
                                <Ionicons name="qr-code-outline" size={24} color={paymentMethod === 'QR' ? '#fff' : '#000'} />
                                <Text className={`mt-1 font-medium ${paymentMethod === 'QR' ? 'text-white' : 'text-black'}`} style={{ fontSize: 12, letterSpacing: 2 }}>
                                    MÃ QR
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Cash Payment */}
                        {paymentMethod === 'CASH' && (
                            <View className="mb-4">
                                <Text className="text-black font-bold mb-1.5" style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                    Tiền khách đưa <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>*</Text>
                                </Text>
                                <TextInput
                                    testID="checkout-cash-input"
                                    className={`bg-white border-b-2 ${cashError ? 'border-red-500' : 'border-black'} px-0 h-14 text-xl font-bold text-black`}
                                    keyboardType="number-pad"
                                    inputMode="numeric"
                                    placeholder=""
                                    placeholderTextColor="transparent"
                                    value={customerGivenStr}
                                    onChangeText={(t) => {
                                        setCustomerGivenStr(t);
                                        if (cashError) setCashError(null);
                                    }}
                                />
                                {cashError && (
                                    <Text className="text-red-500 text-xs mt-1.5 font-semibold" testID="checkout-cash-error">
                                        {cashError}
                                    </Text>
                                )}
                                {customerGiven > 0 && !cashError && (
                                    <View className={`flex-row justify-between items-center p-4 mt-4 border-2 ${changeAmount >= 0 ? 'border-black bg-black' : 'border-red-500 bg-white'}`}>
                                        <Text className={`font-medium text-base ${changeAmount >= 0 ? 'text-white' : 'text-red-500'}`} style={{ letterSpacing: 2, textTransform: 'uppercase', fontSize: 11 }}>
                                            {changeAmount >= 0 ? 'Tiền thối lại' : 'Còn thiếu'}
                                        </Text>
                                        <Text className={`font-black ${changeAmount >= 0 ? 'text-white' : 'text-red-500'}`} style={{ fontFamily: 'serif', fontSize: 24 }}>
                                            {Math.abs(changeAmount).toLocaleString("vi-VN")} đ
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* QR Payment */}
                        {paymentMethod === 'QR' && (
                            <View className="items-center justify-center border-2 border-black p-4 mb-4">
                                <Image source={{uri: qrUrl}} className="w-48 h-48" resizeMode="contain" />
                                <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
                                <Text className="text-black font-medium text-center" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
                                    Quét bằng ứng dụng ngân hàng
                                </Text>
                            </View>
                        )}

                        <CustomButton
                            testID="confirm-checkout-btn"
                            accessibilityLabel="confirm-checkout-btn"
                            title={isSubmitting ? "Đang xử lý..." : "Hoàn Tất Giao Dịch →"}
                            onPress={handleConfirm}
                            loading={isSubmitting}
                            disabled={isSubmitting}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
}
