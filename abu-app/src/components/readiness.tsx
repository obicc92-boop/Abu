import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { partName } from '@/solfa';
import { colors, fonts, partColor } from '@/theme/tokens';

import { Card, Kicker } from './ui';

/** Totals per part: who knows every song, and how much they've practised. Never one person's practice. */
export function Readiness({ eventId, title = 'How ready each part is' }: { eventId: string; title?: string }) {
  const readiness = useQuery({ queryKey: ['readiness', eventId], queryFn: () => api.readiness(eventId) });
  const parts = (readiness.data ?? []).filter((p) => p.part);
  if (!parts.length) return null;
  return (
    <Card>
      <Kicker>{title}</Kicker>
      {parts.map((p) => (
        <View key={p.part} style={styles.readyRow}>
          <View style={[styles.dot, { backgroundColor: partColor(p.part) }]}>
            <Text style={styles.dotText}>{p.part}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {partName(p.part)} · {p.ready} of {p.members} know every song
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${p.members ? Math.round((p.ready / p.members) * 100) : 0}%`, backgroundColor: partColor(p.part) }]} />
            </View>
          </View>
          <Text style={styles.small}>
            {p.plays} {p.plays === 1 ? 'play' : 'plays'}
          </Text>
        </View>
      ))}
      <Text style={styles.small}>Totals only. Each member’s own practice stays private.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  dot: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.white },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.sand, marginTop: 4, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
});
