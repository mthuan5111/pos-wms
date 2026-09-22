import React, { forwardRef } from "react";
import { TextInput, View, Text, TextInputProps } from "react-native";

interface CustomInputProps extends TextInputProps {
    label: string;
    error?: string;
    helperText?: string;
}

const CustomInput = forwardRef<TextInput, CustomInputProps>(({ label, error, helperText, placeholder, ...props }, ref) => {
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
            <TextInput
                ref={ref}
                className={`w-full bg-white px-0 py-2.5 text-base text-black border-b-2 ${error ? 'border-red-500' : 'border-black'}`}
                placeholder=""
                placeholderTextColor="transparent"
                accessibilityLabel={props.accessibilityLabel || cleanLabel}
                {...props}
            />
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