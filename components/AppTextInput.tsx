import React from 'react';
import { TextInput, TextInputProps } from 'react-native';

const AppTextInput = React.forwardRef<TextInput, TextInputProps>(
  ({ allowFontScaling = true, maxFontSizeMultiplier = 1.3, ...props }, ref) => (
    <TextInput
      ref={ref}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
    />
  )
);

AppTextInput.displayName = 'AppTextInput';

export default AppTextInput;
