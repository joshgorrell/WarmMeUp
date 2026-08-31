import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  size?: number;
  style?: ViewStyle;
}

export default function IconButton({ icon, onPress, size = 46, style }: IconButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.btn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'rgba(255,255,255,0.07)',
          borderColor: colors.borderSubtle,
        },
        style,
      ]}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
