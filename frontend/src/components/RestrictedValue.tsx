import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null || isNaN(amount)) return "0 đ";
  return amount.toLocaleString("vi-VN") + " đ";
};

interface RestrictedValueProps {
  hasPermission: boolean;
  value?: number | null;
  isDemo?: boolean;
  demoLabel?: string;
  fallbackText?: string;
  size?: 'sm' | 'base' | 'lg' | 'xl';
  align?: 'left' | 'right' | 'center';
  showLockIcon?: boolean;
  testID?: string;
}

export const RESTRICTED_VIEW_TEXT = "Không có quyền xem";

export const RestrictedValue: React.FC<RestrictedValueProps> = ({
  hasPermission,
  value,
  isDemo = false,
  demoLabel,
  fallbackText = RESTRICTED_VIEW_TEXT,
  size = 'lg',
  align = 'right',
  showLockIcon = false,
  testID,
}) => {
  // If demo mode item with simulated value
  if (isDemo && value != null) {
    const formatted = formatCurrency(value);
    const label = demoLabel ?? '(Mô phỏng)';
    return (
      <View
        testID={testID}
        style={[
          styles.container,
          align === 'right' ? styles.alignRight : align === 'center' ? styles.alignCenter : styles.alignLeft
        ]}
      >
        <Text style={[styles.demoValueText, size === 'xl' ? styles.textXl : size === 'sm' ? styles.textSm : styles.textLg]}>
          {formatted}{' '}
          <Text style={styles.demoSubText}>{label}</Text>
        </Text>
      </View>
    );
  }

  // If user has permission to view the amount
  if (hasPermission && value != null) {
    return (
      <View
        testID={testID}
        style={[
          styles.container,
          align === 'right' ? styles.alignRight : align === 'center' ? styles.alignCenter : styles.alignLeft
        ]}
      >
        <Text style={[styles.allowedValueText, size === 'xl' ? styles.textXl : size === 'sm' ? styles.textSm : styles.textLg]}>
          {formatCurrency(value)}
        </Text>
      </View>
    );
  }

  // Restricted value display: clean sans-serif typography, no faux-bold tearing, flex-shrink safe
  return (
    <View
      testID={testID}
      style={[
        styles.restrictedBadge,
        align === 'right' ? styles.badgeAlignRight : align === 'center' ? styles.badgeAlignCenter : styles.badgeAlignLeft
      ]}
    >
      {showLockIcon && (
        <Ionicons name="lock-closed-outline" size={12} color="#4b5563" style={{ marginRight: 4 }} />
      )}
      <Text
        style={[
          styles.restrictedText,
          size === 'sm' ? styles.restrictedTextSm : size === 'xl' ? styles.restrictedTextXl : styles.restrictedTextBase
        ]}
        numberOfLines={1}
      >
        {fallbackText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  alignCenter: {
    alignItems: 'center',
  },
  allowedValueText: {
    fontFamily: 'System',
    fontWeight: '800',
    color: '#000000',
    textAlign: 'right',
  },
  demoValueText: {
    fontFamily: 'System',
    fontWeight: '800',
    color: '#000000',
    textAlign: 'right',
  },
  demoSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
  },
  textSm: {
    fontSize: 13,
  },
  textLg: {
    fontSize: 16,
  },
  textXl: {
    fontSize: 20,
  },
  restrictedBadge: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeAlignRight: {
    alignSelf: 'flex-end',
  },
  badgeAlignLeft: {
    alignSelf: 'flex-start',
  },
  badgeAlignCenter: {
    alignSelf: 'center',
  },
  restrictedText: {
    fontFamily: 'System',
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.3,
  },
  restrictedTextSm: {
    fontSize: 10,
  },
  restrictedTextBase: {
    fontSize: 12,
  },
  restrictedTextXl: {
    fontSize: 13,
  },
});

export default RestrictedValue;
