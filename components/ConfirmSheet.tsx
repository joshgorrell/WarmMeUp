import React, { useEffect, useRef } from 'react';
import {
  View, Modal, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ConfirmAction = {
  label: string;
  style?: 'default' | 'destructive' | 'cancel';
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  actions: ConfirmAction[];
  onDismiss: () => void;
};

export default function ConfirmSheet({ visible, title, message, actions, onDismiss }: Props) {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <Animated.View
          style={[
            styles.card,
            { marginBottom: insets.bottom + 12 },
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
          // Prevent backdrop tap from firing through the card
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.header}>
            <AppText style={styles.title}>{title}</AppText>
            {message ? (
              <AppText style={styles.message}>{message}</AppText>
            ) : null}
          </View>

          {/* Actions */}
          {actions.map((action, idx) => {
            const isCancel = action.style === 'cancel';
            const isDestructive = action.style === 'destructive';
            const isLast = idx === actions.length - 1;
            return (
              <View key={action.label}>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={[styles.actionBtn, isLast && styles.actionBtnLast]}
                  onPress={() => { onDismiss(); action.onPress(); }}
                  activeOpacity={0.6}
                >
                  <AppText
                    style={[
                      styles.actionLabel,
                      isDestructive && styles.actionLabelDestructive,
                      isCancel && styles.actionLabelCancel,
                    ]}
                  >
                    {action.label}
                  </AppText>
                </TouchableOpacity>
              </View>
            );
          })}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: 'rgba(16,14,24,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 6,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  actionBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLast: {
    // last button gets no extra style — borderRadius handled by card overflow
  },
  actionLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  actionLabelDestructive: {
    color: '#FF4D4D',
  },
  actionLabelCancel: {
    color: 'rgba(255,255,255,0.42)',
    fontFamily: 'Inter-Regular',
    fontSize: 15,
  },
});
