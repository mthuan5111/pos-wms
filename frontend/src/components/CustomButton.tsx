import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

interface CustomButtonProps {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    className?: string;
}

export default function CustomButton({ title, onPress, loading, disabled, className}: CustomButtonProps){
    return(
        <TouchableOpacity
            onPress = {onPress}
            disabled = {disabled || loading}
            className= {`bg-blue-600 py-3 rounded-lg flex-row justify-center items-center my-2 ${disabled || loading ? 'opacity-50': ''} ${className}`}>
                {loading && <ActivityIndicator color="white" className="mr-2"/>}
                <Text className="text-white font-bold text-base">{title}</Text>
        </TouchableOpacity>
    );
}