import { Platform } from 'react-native';
import { Share } from 'react-native';

const DEEP_LINK_SCHEME = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME ?? 'warmup';

/**
 * Open the system share sheet with the app's invite deep link.
 */
export async function shareApp(inviteCode?: string): Promise<void> {
  const deepLink = inviteCode
    ? `${DEEP_LINK_SCHEME}://invite/${inviteCode}`
    : `${DEEP_LINK_SCHEME}://`;

  const shareText = inviteCode
    ? `Join me on Warm Me Up!\n\nTap to connect: ${deepLink}\n\nOr enter code: ${inviteCode}`
    : `Check out Warm Me Up! ${deepLink}`;

  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(deepLink);
    } catch {
      // ignore
    }
    return;
  }

  try {
    await Share.share({ message: shareText, url: deepLink });
  } catch {
    // ignore
  }
}
