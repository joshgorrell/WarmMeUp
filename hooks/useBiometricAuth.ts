import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

type AuthResult = { success: boolean; error?: string };

interface BiometricAuth {
  available: boolean;
  biometricLabel: string;
  authenticate: (reason?: string) => Promise<AuthResult>;
}

export function useBiometricAuth(): BiometricAuth {
  const [available, setAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');

  useEffect(() => {
    if (Platform.OS === 'web') {
      setAvailable(false);
      return;
    }
    (async () => {
      try {
        const LA = await import('expo-local-authentication');
        const isAvail = await LA.hasHardwareAsync();
        const isEnrolled = await LA.isEnrolledAsync();
        if (isAvail && isEnrolled) {
          setAvailable(true);
          // Detect whether device has facial recognition or fingerprint
          const types = await LA.supportedAuthenticationTypesAsync();
          const AuthType = LA.AuthenticationType;
          if (types.includes(AuthType.FACIAL_RECOGNITION)) {
            setBiometricLabel('Face ID');
          } else if (types.includes(AuthType.FINGERPRINT)) {
            setBiometricLabel('Touch ID');
          } else {
            setBiometricLabel('Biometrics');
          }
        } else {
          setAvailable(false);
        }
      } catch {
        setAvailable(false);
      }
    })();
  }, []);

  const authenticate = useCallback(async (reason = 'Verify your identity'): Promise<AuthResult> => {
    if (Platform.OS === 'web' || !available) {
      return { success: false, error: 'Biometrics not available on this device.' };
    }
    try {
      const LA = await import('expo-local-authentication');
      const result = await LA.authenticateAsync({
        promptMessage: reason,
        fallbackLabel: 'Use PIN',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) return { success: true };
      return { success: false, error: result.error ?? 'Authentication cancelled.' };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Authentication failed.' };
    }
  }, [available]);

  return { available, biometricLabel, authenticate };
}
