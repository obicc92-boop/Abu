/** A service, rehearsal or concert in a list: date block, title, time, venue and songs. */
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GroupEvent, GroupType } from '@/api/client';
import { fmtTime, relDay } from '@/lib/dates';
import { kindLabel } from '@/lib/group-types';
import { colors, fonts } from '@/theme/tokens';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function EventCard({ event, groupType, muted }: { event: GroupEvent; groupType: GroupType; muted?: boolean }) {
  const d = new Date(event.starts_at);
  const when = relDay(event.starts_at);
  const rehearsal = event.kind === 'rehearsal';
  // Link asChild spreads the child's style into one object, so it must be a single style, not an array.
  return (
    <View style={muted ? styles.muted : undefined}>
      <Link href={{ pathname: '/event/[id]', params: { id: event.id } }} asChild>
        <Pressable style={styles.row} accessibilityRole="link" accessibilityLabel={`${event.title}, ${d.toDateString()}`}>
          <View style={[styles.date, rehearsal && styles.dateRehearsal]}>
            <Text style={[styles.day, rehearsal && { color: colors.ink }]}>{DAYS[d.getDay()]}</Text>
            <Text style={[styles.num, rehearsal && { color: colors.ink }]}>{d.getDate()}</Text>
            <Text style={[styles.day, rehearsal && { color: colors.muted }]}>{MONTHS[d.getMonth()]}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.kind}>
              {kindLabel(groupType, event.kind)}
              {when ? ` · ${when}` : ''}
            </Text>
            <Text style={styles.title} numberOfLines={2}>
              {event.title}
            </Text>
            <Text style={styles.small} numberOfLines={1}>
              {[fmtTime(event.starts_at), event.venue, event.songs !== undefined ? `${event.songs} ${event.songs === 1 ? 'song' : 'songs'}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12 },
  date: { width: 52, borderRadius: 12, backgroundColor: colors.red, paddingVertical: 6, alignItems: 'center' },
  dateRehearsal: { backgroundColor: colors.board },
  day: { fontFamily: fonts.heavy, fontSize: 10, letterSpacing: 0.6, color: '#FFD9CF' },
  num: { fontFamily: fonts.heavy, fontSize: 20, lineHeight: 24, color: colors.white },
  kind: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.redDeep },
  title: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
});
