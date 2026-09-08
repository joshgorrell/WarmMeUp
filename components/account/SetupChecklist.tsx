import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Check, UserPlus, Camera, Calendar, SlidersHorizontal, Sparkles, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';

export interface SetupStep {
  key: string;
  label: string;
  desc: string;
  done: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  accentColor: string;
}

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const { colors } = useTheme();
  const completed = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = completed === total;

  if (allDone) return null;

  const progress = total > 0 ? completed / total : 0;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['rgba(255,179,71,0.06)', 'rgba(255,46,138,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(255,90,60,0.18)' }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText style={styles.title}>Finish Setting Up</AppText>
            <AppText style={[styles.subtitle, { color: colors.textMuted }]}>
              {completed} of {total} complete — make the app yours
            </AppText>
          </View>
          <View style={styles.progressRing}>
            <View style={[styles.progressRingBg, { borderColor: colors.borderSubtle }]} />
            <LinearGradient
              colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.progressRingFill, { width: `${progress * 100}%` }]}
            />
            <AppText style={styles.progressText}>{Math.round(progress * 100)}%</AppText>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <LinearGradient
            colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBar, { width: `${progress * 100}%` }]}
          />
        </View>

        {/* Steps */}
        <View style={styles.stepsList}>
          {steps.map((step, idx) => (
            <TouchableOpacity
              key={step.key}
              style={[
                styles.stepRow,
                idx < steps.length - 1 && { borderBottomColor: 'rgba(255,255,255,0.06)', borderBottomWidth: 1 },
              ]}
              onPress={step.onPress}
              activeOpacity={0.7}
            >
              <View style={[
                styles.stepCheck,
                step.done
                  ? { backgroundColor: 'rgba(51,209,122,0.14)', borderColor: 'rgba(51,209,122,0.30)' }
                  : { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.borderSubtle },
              ]}>
                {step.done ? (
                  <Check color="#33D17A" size={14} strokeWidth={2.5} />
                ) : (
                  <View style={[styles.stepDot, { backgroundColor: step.accentColor }]} />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText style={[
                  styles.stepLabel,
                  { color: step.done ? colors.textMuted : colors.text },
                  step.done && styles.stepLabelDone,
                ]}>
                  {step.label}
                </AppText>
                <AppText style={[styles.stepDesc, { color: colors.textMuted }]}>
                  {step.desc}
                </AppText>
              </View>
              {!step.done && (
                <View style={[styles.stepIconWrap, { backgroundColor: `${step.accentColor}14` }]}>
                  {step.icon}
                </View>
              )}
              {!step.done && <ChevronRight color={colors.textMuted} size={16} />}
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: Spacing.card,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  progressRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
  },
  progressRingBg: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2.5,
    borderRadius: 26,
  } as any,
  progressRingFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 26,
    opacity: 0.25,
  },
  progressText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Bold',
    color: '#fff',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  stepsList: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 12,
  },
  stepCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  stepLabelDone: {
    textDecorationLine: 'line-through',
    textDecorationColor: 'rgba(255,255,255,0.20)',
  },
  stepDesc: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
  },
  stepIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
