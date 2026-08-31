import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type SurveyType = 'cancel' | 'trial_expired' | 'declined';

const REASONS: { key: string; label: string }[] = [
  { key: 'forgot', label: 'Forgot to use it' },
  { key: 'partner_not_interested', label: "Partner wasn't interested" },
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'not_enough_value', label: 'Not enough value' },
  { key: 'missing_features', label: 'Missing features' },
  { key: 'technical_issues', label: 'Technical issues' },
  { key: 'privacy_concerns', label: 'Privacy concerns' },
  { key: 'broke_up', label: 'No longer together' },
  { key: 'other', label: 'Other' },
];

const FEATURES = ['Chat', 'Vault', 'Dice', 'Dares', 'Wishes', 'Points', 'Streaks'];

const WOULD_RETURN_OPTIONS = [
  { key: 'yes', label: 'Yes' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no', label: 'No' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  surveyType: SurveyType;
  coupleId?: string | null;
}

export default function CancellationSurveySheet({ visible, onClose, surveyType, coupleId }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [wouldReturn, setWouldReturn] = useState<string | null>(null);
  const [mostUsedFeature, setMostUsedFeature] = useState<string | null>(null);
  const [neverUsedFeature, setNeverUsedFeature] = useState<string | null>(null);
  const [wouldConvinceFeature, setWouldConvinceFeature] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSelectedReason(null);
    setOtherReason('');
    setWouldReturn(null);
    setMostUsedFeature(null);
    setNeverUsedFeature(null);
    setWouldConvinceFeature(null);
    setShowFollowUp(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('cancellation_surveys')
        .insert({
          user_id: user?.id,
          couple_id: coupleId ?? null,
          survey_type: surveyType,
          primary_reason: selectedReason,
          other_reason_text: selectedReason === 'other' ? otherReason.trim() || null : null,
          would_return: wouldReturn,
          most_used_feature: mostUsedFeature,
          never_used_feature: neverUsedFeature,
          would_convince_feature: wouldConvinceFeature,
        });

      if (insertError) throw insertError;
      reset();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to submit survey');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Help us improve Warm Me Up"
      subtitle="Your feedback helps us build a better app. All questions are optional."
      scrollable
    >
      <View style={styles.content}>
        {/* Primary reason */}
        <AppText style={[styles.question, { color: colors.text }]}>
          What's the biggest reason you're leaving?
        </AppText>
        <View style={styles.chipGrid}>
          {REASONS.map((reason) => {
            const selected = selectedReason === reason.key;
            return (
              <TouchableOpacity
                key={reason.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? 'rgba(255,90,61,0.12)' : colors.card,
                    borderColor: selected ? 'rgba(255,90,61,0.45)' : colors.borderSubtle,
                  },
                ]}
                onPress={() => setSelectedReason(reason.key)}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.chipText,
                    { color: selected ? '#FF5A3D' : colors.textSecondary },
                  ]}
                >
                  {reason.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Other reason text input */}
        {selectedReason === 'other' && (
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.card,
                borderColor: colors.borderSubtle,
                color: colors.text,
              },
            ]}
            placeholder="Tell us more…"
            placeholderTextColor={colors.textMuted}
            value={otherReason}
            onChangeText={setOtherReason}
            multiline
            maxLength={500}
          />
        )}

        {/* Would you return? */}
        <AppText style={[styles.question, { color: colors.text, marginTop: Spacing.lg }]}>
          Would you consider returning?
        </AppText>
        <View style={styles.optionRow}>
          {WOULD_RETURN_OPTIONS.map((opt) => {
            const selected = wouldReturn === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: selected ? 'rgba(255,179,71,0.12)' : colors.card,
                    borderColor: selected ? 'rgba(255,179,71,0.45)' : colors.borderSubtle,
                  },
                ]}
                onPress={() => setWouldReturn(opt.key)}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.optionText,
                    { color: selected ? '#FFB347' : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Follow-up questions toggle */}
        <TouchableOpacity
          style={[styles.followUpToggle, { borderColor: colors.borderSubtle }]}
          onPress={() => setShowFollowUp(!showFollowUp)}
          activeOpacity={0.7}
        >
          <AppText style={[styles.followUpLabel, { color: colors.textSecondary }]}>
            Answer a few more questions (optional)
          </AppText>
          {showFollowUp ? (
            <ChevronUp color={colors.textMuted} size={18} />
          ) : (
            <ChevronDown color={colors.textMuted} size={18} />
          )}
        </TouchableOpacity>

        {showFollowUp && (
          <View style={styles.followUpContent}>
            {/* Most used feature */}
            <AppText style={[styles.subQuestion, { color: colors.text }]}>
              Which feature did you use the most?
            </AppText>
            <View style={styles.featureRow}>
              {FEATURES.map((f) => {
                const selected = mostUsedFeature === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.featureChip,
                      {
                        backgroundColor: selected ? 'rgba(105,167,255,0.12)' : colors.card,
                        borderColor: selected ? 'rgba(105,167,255,0.40)' : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setMostUsedFeature(mostUsedFeature === f ? null : f)}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.featureChipText, { color: selected ? '#69A7FF' : colors.textMuted }]}>
                      {f}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Never used feature */}
            <AppText style={[styles.subQuestion, { color: colors.text, marginTop: Spacing.md }]}>
              Which feature did you never use?
            </AppText>
            <View style={styles.featureRow}>
              {FEATURES.map((f) => {
                const selected = neverUsedFeature === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.featureChip,
                      {
                        backgroundColor: selected ? 'rgba(255,46,138,0.12)' : colors.card,
                        borderColor: selected ? 'rgba(255,46,138,0.40)' : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setNeverUsedFeature(neverUsedFeature === f ? null : f)}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.featureChipText, { color: selected ? '#FF2E8A' : colors.textMuted }]}>
                      {f}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Would convince feature */}
            <AppText style={[styles.subQuestion, { color: colors.text, marginTop: Spacing.md }]}>
              What feature would have convinced you to stay?
            </AppText>
            <View style={styles.featureRow}>
              {FEATURES.map((f) => {
                const selected = wouldConvinceFeature === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.featureChip,
                      {
                        backgroundColor: selected ? 'rgba(51,209,122,0.12)' : colors.card,
                        borderColor: selected ? 'rgba(51,209,122,0.40)' : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setWouldConvinceFeature(wouldConvinceFeature === f ? null : f)}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.featureChipText, { color: selected ? '#33D17A' : colors.textMuted }]}>
                      {f}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Error */}
        {error && (
          <AppText style={styles.errorText}>{error}</AppText>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.skipBtn, { borderColor: colors.borderSubtle }]}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <AppText style={[styles.skipText, { color: colors.textMuted }]}>Skip</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <AppText style={styles.submitText}>Submit</AppText>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 20,
  },
  question: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: Spacing.sm,
  },
  subQuestion: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  textInput: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    marginTop: Spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: 'center',
  },
  optionText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  followUpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: Spacing.lg,
  },
  followUpLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  followUpContent: {
    marginTop: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureChip: {
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  featureChipText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Medium',
  },
  errorText: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    marginTop: Spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.lg,
  },
  skipBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipText: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  submitBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    backgroundColor: '#FF5A3D',
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
});
