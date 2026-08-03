import {View, ActivityIndicator} from 'react-native';

export default function LoadingSpinner() {
    return (
        <View className='flex-1 justify-center items-center'>
            <ActivityIndicator size = "large" color="#2563eb"/>
        </View>
    )
}