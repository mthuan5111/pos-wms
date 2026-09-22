import React from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  ViewStyle,
  StyleProp
} from 'react-native';

interface ResponsiveFormWrapperProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  scrollable?: boolean;
}

export const ResponsiveFormWrapper: React.FC<ResponsiveFormWrapperProps> = ({
  children,
  contentContainerStyle,
  style,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 64 : 0,
  scrollable = true,
}) => {
  const isWeb = Platform.OS === 'web';

  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentContainerStyle]}>{children}</View>
  );

  if (isWeb) {
    return (
      <View style={[{ flex: 1, width: '100%' }, style]}>
        {content}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[{ flex: 1 }, style]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>{content}</View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};
export default ResponsiveFormWrapper;
