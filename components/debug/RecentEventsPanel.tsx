import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { Spacing } from '@/constants/theme';
import { DebugEvent } from '@/lib/debugLog';
import { EventRow } from './DebugSharedHelpers';

// ── Recent Debug Events list ──
// Extracted from debug.tsx lines ~2149-2169. Shows the in-memory
// debug event log with a Clear button. The parent owns the events
// array and the clear callback.

type RecentEventsPanelProps = {
  events: DebugEvent[];
  onClear: () => void;
};

export default function RecentEventsPanel({ events, onClear }: RecentEventsPanelProps) {
  return (
    <>
      {/* ── 6. Recent Debug Events ── */}
      <View style={eventsStyles.eventsHeader}>
        <AppText style={eventsStyles.eventsCount}>{events.length} event{events.length !== 1 ? 's' : ''}</AppText>
        <TouchableOpacity
          onPress={onClear}
          style={eventsStyles.clearEventsBtn}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <RefreshCw size={12} color="#777" />
          <AppText style={eventsStyles.clearEventsBtnText}>Clear</AppText>
        </TouchableOpacity>
      </View>
      {events.length === 0 ? (
        <View style={eventsStyles.emptyEvents}>
          <AppText style={eventsStyles.emptyEventsText}>No events yet — trigger a vault upload to see logs here.</AppText>
        </View>
      ) : (
        events.slice(0, 30).map((ev, i) => <EventRow key={i} event={ev} />)
      )}
    </>
  );
}

const eventsStyles = StyleSheet.create({
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  eventsCount: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#777',
  },
  clearEventsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  clearEventsBtnText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#777',
  },
  emptyEvents: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyEventsText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});
