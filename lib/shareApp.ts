import { Platform, Share, Alert } from 'react-native';

const SHARE_MESSAGE =
  "I just signed up for Warm Me Up — a private space for playful couples. Check it out!";

const SHARE_URL = process.env.EXPO_PUBLIC_SHARE_URL?.trim() || '';

function buildShareText(): string {
  return SHARE_URL ? `${SHARE_MESSAGE}\n${SHARE_URL}` : SHARE_MESSAGE;
}

export async function shareApp(): Promise<void> {
  const text = buildShareText();
  try {
    if (Platform.OS === 'web') {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        Alert.alert('Copied!', 'Share text copied — paste it anywhere.');
      } else {
        Alert.alert(SHARE_MESSAGE);
      }
      return;
    }
    await Share.share({ message: text });
  } catch {}
}
