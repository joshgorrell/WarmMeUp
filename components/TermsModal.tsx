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
    title: '1. Eligibility',
    body: `You must be at least 18 years old to use Warm Me Up.

By using the Services, you represent and warrant that:

\u2022 you are at least 18 years of age
\u2022 you are legally permitted to use the Services
\u2022 all interactions and shared content are consensual
\u2022 you have the legal right to upload and share any content submitted through the Services

Warm Me Up is intended only for consensual adult relationships.`,
  },
  {
    title: '2. Intended Use — Couples Only',
    body: `Warm Me Up is designed exclusively for two people in an existing, consensual relationship. It is not a social network, dating app, or group communication platform.

Each account may be connected to one partner at a time. Both users must be willing participants. Either partner may disconnect at any time from within the app — no one is locked in.

The Services are intended for:

\u2022 private, one-to-one partner communication
\u2022 consensual interaction between two adults
\u2022 playful couples experiences (games, dares, prompts, notes)
\u2022 private media sharing between connected partners only

Warm Me Up is NOT intended for:

\u2022 harassment or coercion
\u2022 exploitation or abuse
\u2022 impersonation of another person
\u2022 illegal activity of any kind
\u2022 non-consensual sharing of content
\u2022 use by anyone under 18

We reserve the right to suspend or terminate accounts that violate these Terms.`,
  },
  {
    title: '3. Community Guidelines',
    body: `Use of Warm Me Up is also subject to our Community Guidelines and Safety Standards.

Users agree to interact respectfully, consensually, and responsibly while using the Services.

Violation of our Community Guidelines may result in suspension or termination of access to the Services.`,
  },
  {
    title: '4. User Responsibility & Assumption of Risk',
    body: `Warm Me Up provides communication, media-sharing, game, and interaction tools intended for consensual adult use between partners.

Users acknowledge and agree that:

\u2022 all interactions are voluntary
\u2022 all dares, prompts, chats, uploads, and shared content are created and participated in at the users\u2019 own discretion and risk
\u2022 Warm Me Up does not direct, control, supervise, endorse, or guarantee user behavior or interactions

Users are solely responsible for:

\u2022 messages they send
\u2022 media they upload
\u2022 dares or challenges they create or accept
\u2022 interactions with connected partners
\u2022 decisions made as a result of using the Services

Warm Me Up is not responsible for user-generated content, emotional disputes between users, consensual interactions between partners, screenshots or recordings performed by users, misuse of the Services, actions taken by users on or off the platform, or damages arising from user interactions or uploaded content.

Users assume all responsibility and risk associated with use of the Services.`,
  },
  {
    title: '5. User Content',
    body: `Users retain full ownership of all content they upload or share through the Services.

By using Warm Me Up, you grant us a limited, non-exclusive license to store, process, and transmit your content solely for the purpose of operating the Services. We do not claim ownership of your private content.

Content shared through Warm Me Up is visible only to you and your single connected partner. It is not shared with other users, third parties, advertisers, or used for machine learning or model training.

You may delete your own content at any time from within the app. When you delete your account, all content associated with that account is permanently deleted from our systems.

Users are solely responsible for all uploaded messages, photos, videos, prompts, dares, and custom content.`,
  },
  {
    title: '6. Privacy & Media Handling',
    body: `Warm Me Up is designed with privacy and discretion in mind.

Features may include app lock protection, Face ID or PIN access, restricted media handling, and optional discreet viewing modes.

However, no platform can guarantee absolute security, and users may still screenshot, record, photograph, or otherwise capture content externally.

Warm Me Up does not guarantee permanent deletion or complete prevention of content sharing by users.

Users acknowledge all digital communication carries some level of risk.`,
  },
  {
    title: '7. Privacy Features; No Warranty of Privacy or Security',
    body: `Warm Me Up includes features intended to enhance user privacy, including but not limited to Vault, Stealth Mode, biometric authentication (where supported), screenshot notifications (where supported), and other privacy-related controls. These features are designed to help users better manage their privacy, but they do not guarantee confidentiality, anonymity, security, or protection against unauthorized access, disclosure, interception, copying, recording, or misuse.

No software application, mobile device, operating system, network, cloud service, or method of electronic communication can guarantee absolute privacy or security. Accordingly, Warm Me Up is provided on an "AS IS" and "AS AVAILABLE" basis, and the app owner expressly disclaims any representation, warranty, or guarantee that any communication, photograph, video, file, or other content transmitted, stored, or viewed through the Service will remain private, confidential, secure, or inaccessible to third parties.

By using the Service, you acknowledge and accept these inherent limitations and assume responsibility for the content you choose to create, upload, transmit, store, or share.`,
  },
  {
    title: '8. User Responsibility',
    body: `Users are solely responsible for the content they choose to create, upload, store, transmit, or share through Warm Me Up.

Users are also responsible for maintaining the security of their own devices, operating systems, passwords, passcodes, biometric authentication, account credentials, backups, and physical access to their devices.

The app owner is not responsible for loss of privacy or unauthorized disclosure resulting from:

\u2022 another user sharing content voluntarily or involuntarily;
\u2022 screenshots or screen recordings (whether detectable or not);
\u2022 photographs or recordings made using another device;
\u2022 compromised devices;
\u2022 malware;
\u2022 third-party software;
\u2022 operating system behavior;
\u2022 cloud backups;
\u2022 shared devices or accounts;
\u2022 unauthorized access resulting from a user's own actions or omissions; or
\u2022 other circumstances beyond the app owner's reasonable control.`,
  },
  {
    title: '9. Prohibited Content & Conduct',
    body: `Users may not use Warm Me Up to:

\u2022 violate applicable laws
\u2022 harass, threaten, or intimidate others
\u2022 share non-consensual intimate imagery
\u2022 exploit or endanger minors in any way
\u2022 distribute illegal content
\u2022 engage in fraud or trafficking
\u2022 impersonate another person
\u2022 distribute malicious software
\u2022 abuse or manipulate other users

Any violation may result in immediate suspension or permanent account termination.`,
  },
  {
    title: '10. No Obligation to Monitor',
    body: `Warm Me Up does not actively monitor all communications, uploads, or interactions occurring through the Services.

We reserve the right, but not the obligation, to investigate, remove, suspend, or terminate content or accounts that violate these Terms, Community Guidelines, or applicable laws.`,
  },
  {
    title: '11. Subscription Services',
    body: `Warm Me Up may offer free features, premium subscriptions, monthly plans, annual plans, and lifetime access options.

Subscriptions automatically renew unless canceled through the applicable app store or platform settings before the renewal date.

Pricing and features may change periodically.

Refund requests are subject to the policies of the applicable app store provider (Apple App Store or Google Play Store).`,
  },
  {
    title: '12. Account Deletion Rights',
    body: `You have the right to delete your Warm Me Up account at any time, for any reason, with no penalty.

To delete your account:
1. Open the app and go to Settings (Profile tab)
2. Tap "Delete My Account"
3. Confirm deletion when prompted

Upon deletion:
\u2022 your profile, display name, and account settings are permanently deleted
\u2022 all messages, interactions, dares, and notes are permanently deleted
\u2022 all vault media you uploaded is permanently deleted
\u2022 your partner connection is severed
\u2022 your gamification data (points, scores, streaks) is permanently deleted

Some anonymized, non-personal operational data (such as security logs) may be retained for up to 90 days for fraud prevention and legal compliance purposes. This data cannot be linked back to your identity after deletion.

Deleted accounts cannot be recovered.`,
  },
  {
    title: '13. Account Suspension & Termination by Us',
    body: `We reserve the right to suspend or terminate accounts for Terms violations, abusive behavior, illegal activity, harmful conduct, or misuse of the platform.

We will make reasonable efforts to notify affected users where legally permitted to do so.`,
  },
  {
    title: '14. Disclaimer of Warranties',
    body: `Warm Me Up is provided "as is" and "as available" without warranties of any kind.

We do not guarantee uninterrupted service, permanent availability, compatibility with all devices, absolute security, or prevention of unauthorized sharing or screenshots.

Use of the Services is at your own risk.`,
  },
  {
    title: '15. Limitation of Liability',
    body: `To the fullest extent permitted by law, Warm Me Up, its owners, operators, developers, affiliates, employees, contractors, and partners shall not be liable for indirect damages, emotional disputes between users, lost data, unauthorized access, screenshots or recordings by users, misuse of the Services, damages arising from user-generated content, or actions taken by users on or off the platform.

Warm Me Up is not responsible for the conduct of its users.`,
  },
  {
    title: '16. Indemnification',
    body: `You agree to defend, indemnify, and hold harmless Warm Me Up, its owners, operators, developers, affiliates, employees, contractors, and partners from and against any claims, liabilities, damages, losses, or expenses arising from your use of the Services, your uploaded content, your interactions with other users, your violation of these Terms, or unlawful or improper conduct.

This includes reasonable legal fees and costs.`,
  },
  {
    title: '17. Changes to Terms',
    body: `We may update these Terms periodically.

Continued use of the Services after updates constitutes acceptance of revised Terms.`,
  },
  {
    title: '18. Contact',
    body: `Questions regarding these Terms may be sent to:

support@warmmeup.app
warmmeup.app

Stay Playful.`,
  },
];

export default function TermsModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#060406', '#0A060A', '#0E080E']} style={styles.root}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? Spacing.md : insets.top + Spacing.sm }]}>
          <View style={styles.headerTextBlock}>
            <AppText style={styles.headerTitle}>Terms of Service</AppText>
            <AppText style={styles.headerSub}>Effective Date: May 12, 2026</AppText>
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
            Warm Me Up is a private communication and interaction platform designed for consensual adult relationships. By creating an account, accessing, or using the Warm Me Up application, website, or related services ({'"'}Services{'"'}), you agree to these Terms of Service ({'"'}Terms{'"'}).{'\n\n'}
            If you do not agree to these Terms, do not use the Services.
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
