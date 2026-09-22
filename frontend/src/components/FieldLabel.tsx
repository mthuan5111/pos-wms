import React from 'react';
import { View, Text } from 'react-native';

interface FieldLabelProps {
  label: string;
  required?: boolean;
  className?: string;
  testID?: string;
}

export default function FieldLabel({ label, required = false, className = '', testID }: FieldLabelProps) {
  return (
    <View testID={testID} className={`flex-row items-center mb-1 ${className}`}>
      <Text className="text-xs font-bold uppercase text-black tracking-wider">{label}</Text>
      {required && <Text className="text-xs font-bold text-red-600 ml-1">*</Text>}
    </View>
  );
}

export function FieldError({ error, testID }: { error?: string | null; testID?: string }) {
  if (!error) return null;
  return (
    <Text testID={testID} className="text-xs text-red-600 font-semibold mt-1">
      {error}
    </Text>
  );
}

export { FieldLabel as RequiredLabel };
