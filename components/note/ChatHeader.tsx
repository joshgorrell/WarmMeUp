import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '@/components/AppText';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useWeather } from '@/hooks/useWeather';

const chatHeaderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    position: 'relative',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  centerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#33D17A',
    borderWidth: 1.5,
    borderColor: '#050408',
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: -0.2,
  },
  status: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  tempBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

export function ChatHeader({
  partnerName,
  partnerAvatarUri,
  hasPartner,
  partnerIsOnline,
  onBack,
}: {
  partnerName: string;
  partnerAvatarUri: string | null;
  hasPartner: boolean;
  partnerIsOnline: boolean;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, settings } = useAuth();
  const privacyMode = settings?.stealth_mode_enabled ?? false;
  const temp = useWeather(
    privacyMode ? settings?.weather_lat : null,
    privacyMode ? settings?.weather_lon : null,
    privacyMode ? profile?.id : undefined,
  );
  return (
    <View style={[chatHeaderStyles.container, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity onPress={onBack} style={chatHeaderStyles.backBtn} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <ChevronLeft color="#fff" size={26} strokeWidth={2} />
      </TouchableOpacity>

      <View style={chatHeaderStyles.centerRow}>
        <View style={chatHeaderStyles.avatarWrap}>
          <Avatar name={partnerName} uri={partnerAvatarUri} size="sm" bgColor="rgba(255,46,138,0.20)" />
          {partnerIsOnline && <View style={chatHeaderStyles.onlineDot} />}
        </View>
        <View style={chatHeaderStyles.nameWrap}>
          <AppText style={chatHeaderStyles.name} numberOfLines={1} ellipsizeMode="tail">{partnerName}</AppText>
          {partnerIsOnline && <AppText style={chatHeaderStyles.status}>Active now</AppText>}
        </View>
      </View>

      <View style={chatHeaderStyles.rightIcons}>
        {privacyMode && (
          <TouchableOpacity
            onPress={() => router.replace('/weather')}
            activeOpacity={0.7}
            style={chatHeaderStyles.tempBtn}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <AppText style={chatHeaderStyles.tempText}>{temp}</AppText>
          </TouchableOpacity>
        )}
      </View>

      <View style={chatHeaderStyles.separator} />
    </View>
  );
}

export default ChatHeader;
