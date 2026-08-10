import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { logDebugEvent } from '@/lib/debugLog';

type AuthResult = { success: boolean; error?: string };

interface BiometricAuth {
  available: boolean;
  hasHardware: boolean;
  biometricLabel: string;
  authenticate: (reason?: string) => Promise<AuthResult>;
}

export function useBiometricAuth(): BiometricAuth {
  const [available, setAvailable] = useState(false);
  const [hasHardware, setHasHardware] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');
  const inProgressRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setAvailable(false);
      setHasHardware(false);
      return;
    }
    (async () => {
      try {
        const LA = await import('expo-local-authentication');
        const isAvail = await LA.hasHardwareAsync();
        const isEnrolled = await LA.isEnrolledAsync();
        logDebugEvent('BIOMETRIC_PROBE', {
          platform: Platform.OS,
          hasHardware: isAvail,
          isEnrolled,
        });
        setHasHardware(isAvail);
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
      } catch (e: any) {
        logDebugEvent('BIOMETRIC_PROBE_ERROR', { message: e?.message ?? String(e) });
        setAvailable(false);
        setHasHardware(false);
      }
    })();
  }, []);

  const authenticate = useCallback(async (reason = 'Verify your identity'): Promise<AuthResult> => {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Biometrics not available on this device.' };
    }
    if (inProgressRef.current) {
      return { success: false, error: 'Authentication already in progress.' };
    }
    inProgressRef.current = true;
    try {
      const LA = await import('expo-local-authentication');
      const result = await LA.authenticateAsync({
        promptMessage: reason,
        fallbackLabel: 'Use Password',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setAvailable(true);
        return { success: true };
      }
      return { success: false, error: result.error ?? 'Authentication cancelled.' };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Authentication failed.' };
    } finally {
      inProgressRef.current = false;
    }
  }, []);

  return { available, hasHardware, biometricLabel, authenticate };
}
