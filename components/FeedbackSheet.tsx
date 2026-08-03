import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const MAX_CHARS = 5000;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FeedbackSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMessage('');
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Please enter a message before sending.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your session has expired. Please sign in again.');
        setSubmitting(false);
        return;
      }
      const { error: fnError } = await supabase.functions.invoke('submit-feedback', {
        body: JSON.stringify({ content: trimmed }),
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (fnError) throw fnError;
      setSubmitted(true);
      setMessage('');
      setTimeout(() => {
        setSubmitted(false);
        handleClose();
      }, 1800);
    } catch (err: any) {
      logger.log('[feedback] submit failed', err?.message ?? String(err));
      setError(err?.message ?? 'Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [message, submitting, submitted]);

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Send Feedback"
      subtitle="Share ideas, report issues, or send us a note. Your message goes straight to our team."
      scrollable
    >
      <View style={styles.content}>
        {submitted ? (
          <View style={styles.successWrap}>
            <View style={[styles.successIcon, { backgroundColor: 'rgba(51,209,122,0.12)' }]}>
              <Check color="#33D17A" size={30} strokeWidth={2.5} />
            </View>
            <AppText style={[styles.successTitle, { color: colors.text }]}>Thank you!</AppText>
            <AppText style={[styles.successBody, { color: colors.textSecondary }]}>
              Your feedback has been sent. We appreciate you taking the time to help us improve.
            </AppText>
          </View>
        ) : (
          <>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.card,
                  borderColor: error ? colors.danger : colors.borderSubtle,
                  color: colors.text,
                },
              ]}
              placeholder="Tell us what's on your mind — a bug you found, a feature you'd love, or anything else..."
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={(t) => {
                setMessage(t);
                if (error) setError(null);
              }}
              multiline
              maxLength={MAX_CHARS}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.charRow}>
              {error ? (
                <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <AppText style={[styles.charCount, { color: colors.textMuted }]}>
                {message.length}/{MAX_CHARS}
              </AppText>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.borderSubtle }]}
                onPress={handleClose}
                activeOpacity={0.7}
                disabled={submitting}
              >
                <AppText style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, (!message.trim() || submitting) && { opacity: 0.5 }]}
                onPress={handleSubmit}
                activeOpacity={0.8}
                disabled={!message.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <AppText style={styles.submitText}>Send Feedback</AppText>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 20,
    gap: Spacing.sm,
  },
  textInput: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    minHeight: 140,
    lineHeight: 22,
  },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  charCount: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
  errorText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  cancelText: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  submitBtn: {
    flex: 1.5,
    borderRadius: Radius.pill,
    backgroundColor: '#FF2E8A',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  submitText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  successTitle: {
    fontSize: FontSize.h2,
    fontFamily: 'Inter-Bold',
  },
  successBody: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: Spacing.md,
  },
});
