import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  color?: string;
  size?: number;
}

export default function AppleIcon({ color = '#fff', size = 18 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.32.07 2.24.73 3.01.76.97-.16 1.9-.88 3.17-.96 1.55-.1 2.7.6 3.45 1.76-3.13 1.86-2.38 5.95.5 7.1-.57 1.62-1.35 3.26-2.13 4.22zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}
