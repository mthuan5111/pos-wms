import React from "react";
import { TextInput, View, Text, TextInputProps } from "react-native";

interface CustomInputProps extends TextInputProps {
    label: string;
    error?: string;
}

export default function CustomInput({ label, error, ...props}: CustomInputProps) {
    return (
        <View className="mb-4">
            <Text className="text-gray-700 font-semibold mb-1">{label}</Text>
            <TextInput
                className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-base text-gray-800 focus:bg-white
                    ${error ? 'border-red-500' : 'border-gray-200'}`}
                placeholderTextColor="#9CA3AF"
                {...props}
            />
            {error && <Text className="text-red-500 text-sm mt-1 ml-1">{error}</Text>}
        </View>  
    );
}