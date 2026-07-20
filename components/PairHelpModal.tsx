import React from 'react';
import { View, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, UserPlus, Check, MessageCircle } from 'lucide-react-native';
import { FontSize, Spacing, Radius } from '@/constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  variant: 'inviter' | 'joiner';
};

export default function PairHelpModal({ visible, onClose, variant }: Props) {
  const insets = useSafeAreaInsets();

  const steps = variant === 'inviter'
    ? [
        { icon: UserPlus, title: 'Share your code', desc: 'Send your 6-character invite code to your partner via text or email.' },
        { icon: Check, title: 'They accept your invite', desc: 'When your partner enters your code and creates their profile, you\'ll see their name and a request to confirm here.' },
        { icon: MessageCircle, title: 'You confirm', desc: 'Tap Accept to finalize the connection. Your private shared space opens for both of you.' },
      ]
    : [
        { icon: UserPlus, title: 'Get their code', desc: 'Ask your partner for their 6-character invite code.' },
        { icon: Check, title: 'See who\'s inviting you', desc: 'When you enter the code, you\'ll see your partner\'s name before continuing. Create your profile to accept the invite.' },
        { icon: MessageCircle, title: 'Wait for confirmation', desc: 'Your partner sees that you accepted and confirms the connection. Once they do, your shared space opens.' },
      ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          <LinearGradient colors={['#18101C', '#100810']} style={StyleSheet.absoluteFill} />

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X color="rgba(255,255,255,0.80)" size={20} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>
            <AppText style={styles.title}>How pairing works</AppText>
            <AppText style={styles.subtitle}>
              {variant === 'inviter'
                ? 'You\'re sharing an invite code for your partner to join.'
                : 'You\'re entering a code from your partner.'}
            </AppText>

            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumberWrap}>
                    <LinearGradient
                      colors={['rgba(255,90,60,0.35)', 'rgba(255,46,138,0.25)']}
                      style={styles.stepNumberCircle}
                    >
                      <Icon color="#FF6B3D" size={18} strokeWidth={1.8} />
                    </LinearGradient>
                  </View>
                  <View style={styles.stepContent}>
                    <AppText style={styles.stepTitle}>{i + 1}. {step.title}</AppText>
                    <AppText style={styles.stepDesc}>{step.desc}</AppText>
                  </View>
                </View>
              );
            })}

            <View style={styles.noteBox}>
              <AppText style={styles.noteText}>
                {variant === 'inviter'
                  ? 'For your safety, you confirm every connection. No one can join without your approval. Only one partner connection at a time.'
                  : 'For your safety, your partner confirms every connection. No one can join without their approval. Your partner\'s identity is shown before you commit.'}
              </AppText>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    maxHeight: '85%',
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    zIndex: 10,
  },
  title: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    marginBottom: Spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  stepNumberWrap: {
    flexShrink: 0,
  },
  stepNumberCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  stepDesc: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  noteBox: {
    backgroundColor: 'rgba(255,122,69,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,69,0.18)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  noteText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});
