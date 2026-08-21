import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Flame, Sparkles, Dice6, ChevronRight, Eye, Clock } from 'lucide-react-native';
import AppText from '@/components/AppText';

export type ChatActivityKind = 'wish' | 'wish_bump' | 'dare' | 'dice';

export type ChatActivityItem = {
  id: string;
  kind: ChatActivityKind;
  actorUserId: string;
  createdAt: string;
  title: string;
  preview?: string | null;
  sourceId?: string | null;
  expiresAt?: string | null;
};

const META = {
  wish: { mine: 'created a Wish', partner: 'created a Wish', action: 'View Wish', color: '#FF5C9A', Icon: Sparkles },
  wish_bump: { mine: 'bumped a Wish', partner: 'bumped a Wish', action: 'View Wish', color: '#F0A96A', Icon: Eye },
  dare: { mine: 'sent a Dare', partner: 'sent you a Dare', action: 'View Dare', color: '#FF5A3D', Icon: Flame },
  dice: { mine: 'rolled the Dice', partner: 'rolled the Dice', action: 'View Roll', color: '#FFB347', Icon: Dice6 },
} as const;

export default function ActivityCard({
  item,
  actorName,
  isMine,
  onPress,
}: {
  item: ChatActivityItem;
  actorName: string;
  isMine: boolean;
  onPress: () => void;
}) {
  const meta = META[item.kind];
  const Icon = meta.Icon;
  const isExpired = item.kind === 'dare' && item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();
  const expiredColor = 'rgba(255,255,255,0.35)';
  const accentColor = isExpired ? expiredColor : meta.color;
  return (
    <View style={styles.row}>
      <TouchableOpacity style={[styles.card, isExpired && styles.cardExpired]} activeOpacity={0.82} onPress={onPress}>
        <View style={[styles.iconWrap, { backgroundColor: isExpired ? 'rgba(255,255,255,0.06)' : `${meta.color}1F` }]}>
          {isExpired
            ? <Clock size={18} color={expiredColor} strokeWidth={2.2} />
            : <Icon size={18} color={meta.color} strokeWidth={2.2} />}
        </View>
        <View style={styles.copy}>
          <AppText style={styles.eyebrow}>
            <AppText style={[styles.actor, { color: accentColor }]}>{isMine ? 'You' : actorName}</AppText>
            {' '}{isMine ? meta.mine : meta.partner}
          </AppText>
          <AppText style={[styles.title, isExpired && styles.titleExpired]} numberOfLines={2}>{item.title}</AppText>
          {!!item.preview && item.preview !== item.title && (
            <AppText style={styles.preview} numberOfLines={2}>{item.preview}</AppText>
          )}
          <View style={styles.actionRow}>
            <AppText style={[styles.action, { color: accentColor }]}>
              {isExpired ? 'Expired' : meta.action}
            </AppText>
            {!isExpired && <ChevronRight size={13} color={meta.color} strokeWidth={2.4} />}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', paddingHorizontal: 42, marginVertical: 7, alignItems: 'center' },
  card: { width: '100%', maxWidth: 430, flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,25,110,0.24)', backgroundColor: 'rgba(30,12,34,0.94)' },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  actor: { fontWeight: '700' },
  title: { color: '#FFF8F1', fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  preview: { color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 17, marginTop: 3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  action: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  cardExpired: { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(20,12,24,0.60)' },
  titleExpired: { color: 'rgba(255,255,255,0.45)' },
});
