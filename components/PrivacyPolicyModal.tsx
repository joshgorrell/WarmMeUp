import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
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
    title: '1. Information We Collect',
    body: `When you create an account and use Warm Me Up, we collect information necessary to operate the Services.

Account Information:
\u2022 email address
\u2022 display name
\u2022 profile photo (optional)

Usage Data:
\u2022 app activity (interactions sent, dares, prompts)
\u2022 device type and operating system
\u2022 app version
\u2022 push notification tokens (if enabled)

Partner Connection Data:
\u2022 couple pairing codes
\u2022 partner connection status

User-Generated Content:
\u2022 messages, notes, and prompts you send
\u2022 photos and videos you upload to the Vault or chat
\u2022 dares and challenges you create or accept
\u2022 custom prompt preferences

We do not collect your real name, phone number, location, or financial information unless you provide it voluntarily.`,
  },
  {
    title: '2. How We Use Your Information',
    body: `We use the information we collect to:

\u2022 operate, maintain, and improve the Services
\u2022 authenticate your identity and secure your account
\u2022 deliver messages, media, and notifications to your partner
\u2022 power gamification features (points, scores, streaks)
\u2022 send push notifications (only if you enable them)
\u2022 analyze usage patterns to improve the app experience
\u2022 enforce our Terms of Service and Community Guidelines
\u2022 comply with applicable laws

We do not sell your personal data.
We do not use your private content for advertising.`,
  },
  {
    title: '3. Private Content & the Vault',
    body: `Photos, videos, and media you upload through Warm Me Up are stored securely and are only accessible to you and your connected partner.

Warm Me Up is designed with privacy in mind:

\u2022 media is stored with restricted access controls
\u2022 vault items can require biometric authentication to view
\u2022 screenshot and save controls are managed by the uploader's settings

However, no system can guarantee absolute security. Users may still find ways to capture content externally (camera, screen recording, etc.). Warm Me Up cannot prevent all forms of unauthorized capture once content is displayed on a device screen.

You are responsible for understanding the risks of sharing private digital content.`,
  },
  {
    title: '4. Sharing of Information',
    body: `We do not sell, rent, or trade your personal information to third parties.

We may share limited information in the following circumstances:

Service Providers:
We use trusted third-party providers to help us operate the Services, including cloud storage, push notification delivery, and authentication. These providers are contractually required to protect your data.

Legal Requirements:
We may disclose information if required by law, court order, or government authority, or to protect the rights, safety, or property of Warm Me Up or its users.

Business Transfers:
If Warm Me Up is acquired or merged, your data may be transferred as part of that transaction. You will be notified of any such change.

We do not share your private messages or media with third parties except as described above.`,
  },
  {
    title: '5. User-Generated Content',
    body: `All content you create or upload in Warm Me Up — including messages, notes, vault photos and videos, dares, and custom prompts — is your content. You retain full ownership.

Your content is shared only with your single connected partner. It is never:

\u2022 visible to other users, third parties, or the public
\u2022 used for advertising or marketing purposes
\u2022 used to train machine learning or AI models
\u2022 sold or licensed to any external party

You may delete any content you have uploaded at any time from within the app. If you delete your account, all user-generated content associated with your account is permanently deleted from our servers.

We do not moderate private content between consenting partners unless a safety report is submitted or we are required to act by law.`,
  },
  {
    title: '6. Data Retention & Deletion',
    body: `We retain your data for as long as your account is active or as needed to provide the Services.

You may delete your account at any time from Settings > Account > Delete My Account.

When you delete your account, the following is permanently deleted:
\u2022 your profile, display name, and avatar
\u2022 your account settings and preferences
\u2022 all messages, interactions, dares, and notes
\u2022 all vault media you uploaded
\u2022 your partner connection record
\u2022 your gamification data (points, scores, streaks)

Some anonymized, non-personal operational data (such as security and access logs) may be retained for up to 90 days for fraud prevention and legal compliance purposes. This data cannot be linked back to your identity after deletion.

Deleted accounts cannot be recovered.`,
  },
  {
    title: '7. Security',
    body: `We take reasonable measures to protect your personal information, including:

\u2022 encrypted data transmission (HTTPS/TLS)
\u2022 access-controlled cloud storage
\u2022 authentication controls (PIN, biometrics, password)
\u2022 row-level security for database access

However, no method of electronic transmission or storage is 100% secure.

We cannot guarantee absolute security, and we encourage users to use strong passwords, enable app lock features, and be thoughtful about what content they share digitally.`,
  },
  {
    title: '8. Push Notifications',
    body: `If you enable push notifications, we store a device push token to deliver notifications when your partner sends you something.

Notifications are discreet by default and never include message content or media previews unless you change your notification settings.

You can disable push notifications at any time from within the app or your device settings.`,
  },
  {
    title: '9. Children\'s Privacy',
    body: `Warm Me Up is intended for adults aged 18 and over.

We do not knowingly collect personal information from anyone under 18 years of age.

If we discover that a user under 18 has created an account, we will terminate that account and delete associated data promptly.`,
  },
  {
    title: '10. Your Rights',
    body: `Depending on your location, you may have certain rights regarding your personal data, including:

\u2022 the right to access information we hold about you
\u2022 the right to request correction of inaccurate data
\u2022 the right to delete your account and all associated data
\u2022 the right to withdraw consent for data processing
\u2022 the right to data portability

Account Deletion: You can delete your account and all personal data at any time from within the app. Go to Settings > Account > Delete My Account. Deletion is immediate and permanent for your personal data. Some anonymized operational records may be retained for up to 90 days as described in Section 6.

To exercise any other rights, or if you have questions about your data, contact us at support@warmmeup.app.`,
  },
  {
    title: '11. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time.

When we make material changes, we will notify you within the app or via email.

Continued use of the Services after updates constitutes acceptance of the revised Privacy Policy.`,
  },
  {
    title: '12. Contact',
    body: `If you have questions or concerns about this Privacy Policy or how your data is handled, please contact us at:

support@warmmeup.app
warmmeup.app

Stay Playful.`,
  },
];

export default function PrivacyPolicyModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#060406', '#0A060A', '#0E080E']} style={styles.root}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? Spacing.md : insets.top + Spacing.sm }]}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Privacy Policy</Text>
            <Text style={styles.headerSub}>Effective Date: May 12, 2026</Text>
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
          <Text style={styles.intro}>
            Your privacy matters to us.{'\n\n'}
            This Privacy Policy explains what information Warm Me Up collects, how we use it, and how we protect it.{'\n\n'}
            By using Warm Me Up, you agree to the collection and use of information as described in this policy.
          </Text>

          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm }]}>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.doneGrad}
            >
              <Text style={styles.doneLabel}>Close</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTextBlock: { flex: 1, paddingRight: Spacing.md },
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
  scroll: { flex: 1 },
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
  section: { marginBottom: Spacing.lg },
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
  doneBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
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
