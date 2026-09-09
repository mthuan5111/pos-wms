import React from "react";
import { TextInput, View, Text, TextInputProps } from "react-native";

interface CustomInputProps extends TextInputProps {
    label: string;
    error?: string;
}

export default function CustomInput({ label, error, ...props }: CustomInputProps) {
    return (
        <View className="mb-5">
            <Text
                className="text-black font-medium mb-2"
                style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' }}
            >
                {label}
            </Text>
            <TextInput
                className={`w-full bg-white px-0 py-3 text-base text-black border-b-2 ${error ? 'border-red-500' : 'border-black'}`}
                placeholderTextColor="#525252"
                style={{ fontStyle: 'italic' }}
                {...props}
            />
            {error && (
                <Text className="text-red-500 text-xs mt-2" style={{ letterSpacing: 1 }}>
                    {error}
                </Text>
            )}
        </View>
    );
}