import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '@/components/AppText';
import { Radius, Spacing, FontSize } from '@/constants/theme';

export default function DeleteAccountPage() {
  const requestDeletion = () => {
    const subject = encodeURIComponent('Warm Me Up account deletion request');
    const body = encodeURIComponent('Please delete my Warm Me Up account and associated data.\n\nAccount email: \n\nI understand you may contact me at my account email to verify this request.');
    Linking.openURL(`mailto:support@warmmeup.app?subject=${subject}&body=${body}`);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#060406', '#0A060A', '#0E080E']} style={StyleSheet.absoluteFill} />
      <View style={styles.card}>
        <AppText style={styles.eyebrow}>WARM ME UP</AppText>
        <AppText style={styles.title}>Delete your account</AppText>
        <AppText style={styles.body}>
          You can permanently delete your Warm Me Up account at any time. Deleting your account removes your profile and associated app data according to our Privacy Policy and Terms.
        </AppText>

        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>From the app</AppText>
          <AppText style={styles.body}>Open Warm Me Up → Profile → Settings → Delete My Account, then confirm the deletion.</AppText>
        </View>

        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>No longer have the app?</AppText>
          <AppText style={styles.body}>Use the button below to request deletion. Send the request from, or identify, the email address used for your Warm Me Up account. We may contact that account email to verify ownership before completing the request.</AppText>
        </View>

        <TouchableOpacity onPress={requestDeletion} activeOpacity={0.85} style={styles.buttonWrap}>
          <LinearGradient colors={['#FF7B00', '#FF5A3D', '#FF2E8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
            <AppText style={styles.buttonText}>Request Account Deletion</AppText>
          </LinearGradient>
        </TouchableOpacity>

        <AppText style={styles.note}>Deleting the Warm Me Up account does not automatically cancel an App Store or Google Play subscription. Subscription management remains with the applicable store.</AppText>
        {Platform.OS === 'web' && <AppText style={styles.note}>Support: support@warmmeup.app</AppText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 700, justifyContent: 'center', padding: Spacing.xl },
  card: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)', padding: Spacing.xl, gap: Spacing.lg },
  eyebrow: { color: '#FF5A8A', fontSize: 11, fontFamily: 'Inter-Bold', letterSpacing: 2 },
  title: { color: '#fff', fontSize: 32, fontFamily: 'Inter-Bold', letterSpacing: -0.5 },
  body: { color: 'rgba(255,255,255,0.64)', fontSize: FontSize.sm, lineHeight: 22, fontFamily: 'Inter-Regular' },
  section: { gap: Spacing.sm }, sectionTitle: { color: '#fff', fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  buttonWrap: { borderRadius: Radius.pill, overflow: 'hidden' }, button: { alignItems: 'center', paddingVertical: 15 }, buttonText: { color: '#fff', fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  note: { color: 'rgba(255,255,255,0.42)', fontSize: FontSize.xs, lineHeight: 18, fontFamily: 'Inter-Regular' },
});
