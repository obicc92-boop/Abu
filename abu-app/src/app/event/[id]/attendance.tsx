/**
 * The register for one service or rehearsal (leaders and part leaders):
 * everyone by part, with their reply; tap a status to change it (Present →
 * Absent → Excused). Part leaders mark only their own part. Self check-ins
 * appear as they come in.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type AttendanceStatus, type SheetRow } from '@/api/client';
import { Avatar, Body, Button, Card, Chip, ErrorText, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { checkInOpen, fmtDate, fmtTime } from '@/lib/dates';
import { kindLabel } from '@/lib/group-types';
import { useOnline } from '@/lib/online';
import { useSerial } from '@/lib/serial';
import { partName, partPlural } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts, partColor } from '@/theme/tokens';

type Filter = 'all' | 'unmarked' | 'present' | 'absent';
const PART_ORDER = ['S', 'A', 'T', 'B'];
const NEXT: Record<string, AttendanceStatus> = { '': 'present', present: 'absent', absent: 'excused', excused: 'present' };
const LABEL: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', excused: 'Excused' };

/** The mark, or "excused" for someone who said they can't come and wasn't marked. */
const shown = (r: SheetRow, pending?: AttendanceStatus): AttendanceStatus | null => pending ?? r.status ?? (r.reply === 'cant' ? 'excused' : null);

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const queryClient = useQueryClient();
  const signedIn = s.status === 'signedIn';
  const online = useOnline();
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: signedIn && !!id });
  const sheet = useQuery({ queryKey: ['attendance', id], queryFn: () => api.attendance(id), enabled: signedIn && !!id, refetchInterval: 10_000 });
  const [filter, setFilter] = useState<Filter>('all');
  // Taps not yet confirmed by the server, shown straight away.
  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({});
  const serial = useSerial();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance', id] });
  const rest = useMutation({
    mutationFn: (status: 'present' | 'absent') => serial.run(() => api.markRest(id, status)),
    onSuccess: () => refresh(),
  });

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  // Mark from the latest register, not a copy saved on the phone.
  if (!details.data || !sheet.data || (online && !sheet.isFetchedAfterMount)) {
    const error = details.error ?? sheet.error;
    return (
      <Page>
        <TopBar back title="Attendance" />
        {error ? <ErrorText message={error.message} /> : <Loading />}
      </Page>
    );
  }

  const e = details.data.event;
  const group = s.groups.find((g) => g.id === e.group_id);
  const rows = sheet.data;
  const myPart = details.data.my_role === 'part_leader' ? details.data.my_part : null;
  const status = (r: SheetRow) => shown(r, pending[r.user_id]);
  const count = (st: AttendanceStatus) => rows.filter((r) => status(r) === st).length;
  const unmarked = rows.filter((r) => r.can_mark && !r.status && !pending[r.user_id]).length;

  const tap = (r: SheetRow) => {
    const next = NEXT[status(r) ?? ''];
    setPending((p) => ({ ...p, [r.user_id]: next }));
    const settle = () =>
      setPending((p) => {
        if (p[r.user_id] !== next) return p;
        const { [r.user_id]: _done, ...others } = p;
        return others;
      });
    serial
      .run(() => api.mark(id, r.user_id, next))
      .then(refresh)
      .then(settle, settle);
  };

  const visible = rows.filter((r) => {
    const st = status(r);
    if (filter === 'unmarked') return !st;
    if (filter === 'present') return st === 'present';
    if (filter === 'absent') return st === 'absent';
    return true;
  });
  const partsInOrder = [...PART_ORDER, ...new Set(rows.map((r) => r.part).filter((p): p is string => !!p && !PART_ORDER.includes(p)))].sort((a, b) =>
    myPart ? Number(b === myPart) - Number(a === myPart) : 0,
  );
  const sections = [
    ...partsInOrder.map((p) => ({ key: p, title: partPlural(p), color: partColor(p), rows: visible.filter((r) => r.part === p) })),
    { key: 'none', title: 'No part yet', color: colors.muted, rows: visible.filter((r) => !r.part) },
  ].filter((x) => x.rows.length);

  return (
    <Page>
      <TopBar back title="Attendance" subtitle={`${group ? kindLabel(group.type, e.kind) : e.title} · ${fmtDate(e.starts_at)} · ${fmtTime(e.starts_at)}`} />

      <Card tone="sand">
        <Kicker>Present</Kicker>
        <Text style={styles.big}>
          {count('present')} <Text style={styles.of}>of {rows.length}</Text>
        </Text>
        <Text style={styles.small}>
          {count('excused')} excused · {count('absent')} absent · {rows.filter((r) => !status(r)).length} not marked
        </Text>
        <View style={styles.parts}>
          {PART_ORDER.filter((p) => rows.some((r) => r.part === p)).map((p) => {
            const inPart = rows.filter((r) => r.part === p);
            return (
              <View key={p} style={styles.part} accessibilityLabel={`${partPlural(p)}: ${inPart.filter((r) => status(r) === 'present').length} of ${inPart.length} present`}>
                <View style={[styles.dot, { backgroundColor: partColor(p) }]}>
                  <Text style={styles.dotText}>{p}</Text>
                </View>
                <Text style={styles.partCount}>
                  {inPart.filter((r) => status(r) === 'present').length}/{inPart.length}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {group?.self_check_in && checkInOpen(e.starts_at) ? (
        <Button kind="ghost" label="Show the check-in code" onPress={() => router.push({ pathname: '/event/[id]/code', params: { id } })} />
      ) : null}

      {myPart ? (
        <Body muted>
          As {partName(myPart).toLowerCase()} part leader you mark {partPlural(myPart).toLowerCase()}. Other parts are view only.
        </Body>
      ) : null}

      <View style={styles.wrap}>
        {(
          [
            ['all', 'All'],
            ['unmarked', 'Not marked'],
            ['present', 'Present'],
            ['absent', 'Absent'],
          ] as const
        ).map(([f, label]) => (
          <Chip key={f} label={label} on={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {unmarked ? (
        <Card>
          <Text style={styles.small}>
            {unmarked} {unmarked === 1 ? 'person you can mark isn’t' : 'people you can mark aren’t'} marked yet. Anyone who said “Can’t come” is marked excused.
          </Text>
          <View style={styles.wrap}>
            <Button small kind="ghost" label="Mark the rest present" onPress={() => rest.mutate('present')} busy={rest.isPending && rest.variables === 'present'} />
            <Button small kind="ghost" label="Mark the rest absent" onPress={() => rest.mutate('absent')} busy={rest.isPending && rest.variables === 'absent'} />
          </View>
        </Card>
      ) : null}
      {rest.data ? <Body muted>{rest.data.marked ? `${rest.data.marked} marked. Change anyone who isn’t right.` : 'Everyone you can mark is already marked.'}</Body> : null}
      {serial.error ? <ErrorText message={serial.error} /> : null}

      {sections.map((sec) => (
        <View key={sec.key} style={{ gap: 8 }}>
          <Kicker color={sec.color}>{sec.title}</Kicker>
          <View style={styles.list}>
            {sec.rows.map((r) => (
              <Row key={r.user_id} row={r} status={status(r)} onTap={() => tap(r)} />
            ))}
          </View>
        </View>
      ))}
      {!sections.length ? <Body muted>Nobody here.</Body> : null}
      <Text style={styles.small}>Tap a status to change it: Present → Absent → Excused.</Text>
    </Page>
  );
}

function Row({ row, status, onTap }: { row: SheetRow; status: AttendanceStatus | null; onTap: () => void }) {
  const note = [row.self_check_in && row.status === 'present' ? 'checked in' : null, row.reply === 'going' ? 'said going' : row.reply === 'cant' ? 'said can’t come' : null]
    .filter(Boolean)
    .join(' · ');
  const label = status ? LABEL[status] : row.can_mark ? 'Mark' : '—';
  return (
    <View style={styles.row}>
      <Avatar name={row.display_name} part={row.part} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {row.display_name}
        </Text>
        {note ? <Text style={styles.small}>{note}</Text> : null}
      </View>
      {row.can_mark ? (
        <Pressable
          onPress={onTap}
          accessibilityRole="button"
          accessibilityLabel={`${row.display_name}: ${status ? LABEL[status] : 'not marked'}. Tap to change.`}
          style={[styles.badge, status && BADGE[status]]}
          hitSlop={6}
        >
          <Text style={[styles.badgeText, status && { color: BADGE_TEXT[status] }]}>{label}</Text>
        </Pressable>
      ) : (
        <View style={[styles.badge, styles.badgeQuiet, status && BADGE[status]]}>
          <Text style={[styles.badgeText, status && { color: BADGE_TEXT[status] }]}>{label}</Text>
        </View>
      )}
    </View>
  );
}

const BADGE: Record<AttendanceStatus, { backgroundColor: string; borderColor: string }> = {
  present: { backgroundColor: '#E6F4F0', borderColor: '#BFE3DA' },
  absent: { backgroundColor: colors.redTint, borderColor: '#F2C4B8' },
  excused: { backgroundColor: '#FBF0DA', borderColor: '#F0D9A6' },
};
const BADGE_TEXT: Record<AttendanceStatus, string> = { present: colors.ok, absent: colors.redDeep, excused: '#94600A' };

const styles = StyleSheet.create({
  big: { fontFamily: fonts.monoBold, fontSize: 28, color: colors.ink },
  of: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  parts: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 4 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontFamily: fonts.heavy, fontSize: 11.5, color: colors.white },
  partCount: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  badge: { minWidth: 82, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center' },
  badgeQuiet: { borderStyle: 'dashed' },
  badgeText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
});
