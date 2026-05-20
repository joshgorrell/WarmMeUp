import React from 'react';
import {
  Modal,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import AppText from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { FontSize, Spacing, Radius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: '1. Intended Use',
    body: `Warm Me Up is designed for:

\u2022 consensual adult relationships
\u2022 private partner communication
\u2022 playful interaction between partners
\u2022 respectful sharing between connected users

Warm Me Up is not a public social platform or dating marketplace.

The app is intended only for communication and interaction between connected adult partners.`,
  },
  {
    title: '2. Consent Matters',
    body: `Only share messages, photos, videos, dares, prompts, and custom content with the clear consent of your partner.

Respect boundaries at all times.

"No" always means no.

Users are responsible for ensuring all interactions remain consensual, respectful, and appropriate for both participants.`,
  },
  {
    title: '3. Respectful Communication',
    body: `Warm Me Up should never be used to:

\u2022 harass
\u2022 intimidate
\u2022 manipulate
\u2022 threaten
\u2022 blackmail
\u2022 pressure
\u2022 exploit
\u2022 shame

We encourage users to communicate openly and respectfully with their partners.

Keep things playful. Keep things healthy.`,
  },
  {
    title: '4. Privacy & Trust',
    body: `Warm Me Up was built to help couples share more privately and comfortably.

Please respect the privacy and trust of your partner.

Users may not:

\u2022 share another user's content without permission
\u2022 upload content without consent
\u2022 impersonate another person
\u2022 attempt unauthorized access to another account
\u2022 misuse private media

While Warm Me Up includes privacy-focused features, users should always understand that digital communication carries some level of risk.`,
  },
  {
    title: '5. Prohibited Content',
    body: `The following content is strictly prohibited:

\u2022 content involving minors
\u2022 exploitation or abuse
\u2022 non-consensual intimate imagery
\u2022 illegal activity
\u2022 violent threats
\u2022 coercive behavior
\u2022 trafficking-related content
\u2022 harassment
\u2022 malicious software or scams
\u2022 impersonation or fraud

Violation of these rules may result in immediate suspension or permanent account removal.`,
  },
  {
    title: '6. Safety & Responsibility',
    body: `Warm Me Up provides tools for communication, games, prompts, dares, and media sharing.

Users are solely responsible for:

\u2022 the content they create
\u2022 the dares they send or accept
\u2022 the decisions they make
\u2022 interactions with their partner

Never pressure another user into participating in anything that makes them uncomfortable.

Respect boundaries and communicate clearly.`,
  },
  {
    title: '7. Reporting Abuse',
    body: `If you believe someone is:

\u2022 abusing the platform
\u2022 violating these Guidelines
\u2022 sharing non-consensual content
\u2022 engaging in harmful behavior

please contact us at:

support@warmmeup.app

We reserve the right to investigate and take appropriate action, including suspension or permanent removal of accounts.`,
  },
  {
    title: '8. Enforcement',
    body: `Warm Me Up may suspend or terminate accounts that:

\u2022 violate these Guidelines
\u2022 violate our Terms of Service
\u2022 engage in illegal or harmful activity
\u2022 misuse the platform

We reserve the right to remove content or restrict access at our discretion.`,
  },
  {
    title: '9. Final Thoughts',
    body: `Warm Me Up was created for couples who want a fun, private space to connect and stay playful together.

Use the app responsibly.
Respect each other.
Protect each other's trust.

Stay Playful.`,
  },
];

export default function CommunityGuidelinesModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#060406', '#0A060A', '#0E080E']} style={styles.root}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? Spacing.md : insets.top + Spacing.sm }]}>
          <View style={styles.headerTextBlock}>
            <AppText style={styles.headerTitle}>Community Guidelines</AppText>
            <AppText style={styles.headerSub}>How we keep this space safe and playful</AppText>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.75}>
            <X color="rgba(255,255,255,0.70)" size={18} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <AppText style={styles.intro}>
            Welcome to Warm Me Up.{'\n\n'}
            Warm Me Up was created to give couples a more private, playful, and customizable space to stay connected.{'\n\n'}
            This app is built around trust, consent, privacy, respect, and fun.{'\n\n'}
            We ask every user to help keep it that way.
          </AppText>

          {/* Sections */}
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText style={styles.sectionTitle}>{section.title}</AppText>
              <AppText style={styles.sectionBody}>{section.body}</AppText>
            </View>
          ))}
        </ScrollView>

        {/* Footer close button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm }]}>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.doneGrad}
            >
              <AppText style={styles.doneLabel}>Close</AppText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTextBlock: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  headerTitle: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.3,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  intro: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: Spacing.sm,
    letterSpacing: -0.2,
  },
  sectionBody: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  doneBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  doneGrad: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: Radius.pill,
  },
  doneLabel: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
});
