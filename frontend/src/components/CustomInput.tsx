import React, { forwardRef } from "react";
import { TextInput, View, Text, TextInputProps } from "react-native";

export interface CustomInputProps extends TextInputProps {
    label: string;
    error?: string;
    helperText?: string;
    rightElement?: React.ReactNode;
}

const CustomInput = forwardRef<TextInput, CustomInputProps>(({ label, error, helperText, rightElement, placeholder, ...props }, ref) => {
    const isRequired = label.includes("*");
    const cleanLabel = label.replace(/\s*\*\s*/g, "").trim();

    return (
        <View className="mb-4">
            <Text
                className="text-black font-bold mb-1.5"
                style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}
            >
                {cleanLabel} {isRequired && <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>*</Text>}
            </Text>
            <View className={`w-full flex-row items-center bg-white border-b-2 ${error ? 'border-red-500' : 'border-black'}`}>
                <TextInput
                    ref={ref}
                    className="flex-1 bg-white px-0 py-2.5 text-base text-black"
                    placeholder=""
                    placeholderTextColor="transparent"
                    accessibilityLabel={props.accessibilityLabel || cleanLabel}
                    {...props}
                />
                {rightElement && (
                    <View className="pl-2 pr-1 justify-center items-center">
                        {rightElement}
                    </View>
                )}
            </View>
            {helperText && !error ? (
                <Text className="text-gray-500 text-xs mt-1">
                    {helperText}
                </Text>
            ) : null}
            {error ? (
                <Text className="text-red-500 text-xs mt-1" style={{ letterSpacing: 0.5 }}>
                    {error}
                </Text>
            ) : null}
        </View>
    );
});

export default CustomInput;