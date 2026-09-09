import { TouchableOpacity, Text, ActivityIndicator, View } from "react-native";

interface CustomButtonProps {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    className?: string;
    variant?: 'primary' | 'outline' | 'ghost' | 'danger';
}

export default function CustomButton({ title, onPress, loading, disabled, className, variant = 'primary' }: CustomButtonProps) {
    const baseStyles = 'py-4 px-8 flex-row justify-center items-center my-2';
    const disabledStyle = disabled || loading ? 'opacity-50' : '';

    const variantStyles = {
        primary: 'bg-black',
        outline: 'bg-transparent border-2 border-black',
        ghost: 'bg-transparent',
        danger: 'bg-black',
    };

    const textVariantStyles = {
        primary: 'text-white',
        outline: 'text-black',
        ghost: 'text-black',
        danger: 'text-white',
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            className={`${baseStyles} ${variantStyles[variant]} ${disabledStyle} ${className || ''}`}
            activeOpacity={0.8}
        >
            {loading && <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? 'black' : 'white'} className="mr-2" />}
            <Text
                className={`${textVariantStyles[variant]} font-medium`}
                style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' }}
            >
                {title}
            </Text>
        </TouchableOpacity>
    );
}