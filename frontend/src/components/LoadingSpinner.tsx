import { View, ActivityIndicator, Text } from 'react-native';

export default function LoadingSpinner() {
    return (
        <View className='flex-1 justify-center items-center bg-white'>
            <ActivityIndicator size="large" color="#000000" />
            <View style={{ width: 40, height: 2, backgroundColor: '#000', marginTop: 16 }} />
        </View>
    )
}