/**
 * Plan a service, rehearsal or concert (or a setlist in your own space), or
 * change one (?id=...). Dates and times are picked with taps; rehearsals can
 * repeat weekly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type EventKind, type GroupEvent } from '@/api/client';
import { Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { addDays, fmtDate, startOfDay } from '@/lib/dates';
import { defaultTitle, kindLabel } from '@/lib/group-types';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

const TIMES = ['07:00', '08:00', '09:00', '10:00', '12:00', '16:00', '17:00', '18:00', '19:00'];
const REPEATS = [0, 3, 7, 11];

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeLabel = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function EventEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { status } = useSession();
  const existing = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id!), enabled: !!id });
  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (id && !existing.data) {
    return (
      <Page>
        <TopBar back title="Change details" />
        {existing.error ? <ErrorText message={existing.error.message} /> : <Loading />}
      </Page>
    );
  }
  return <Editor event={existing.data?.event} />;
}

function Editor({ event }: { event?: GroupEvent }) {
  const s = useSession();
  const queryClient = useQueryClient();
  const group = s.groups.find((g) => g.id === (event?.group_id ?? s.group?.id)) ?? s.group;
  const personal = group?.type === 'personal';
  const editing = !!event;

  const start = event ? new Date(event.starts_at) : null;
  const [kind, setKind] = useState<EventKind>(event?.kind ?? (personal ? 'service' : 'service'));
  const [title, setTitle] = useState(event?.title ?? (group ? defaultTitle(group.type, 'service') : ''));
  const [titleTouched, setTitleTouched] = useState(editing);
  const [date, setDate] = useState(start ? ymd(start) : '');
  const [time, setTime] = useState(start ? hhmm(start) : '');
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [repeat, setRepeat] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(startOfDay(new Date()), i)), []);
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{1,2}:\d{2}$/.test(time) ? new Date(`${date}T${time.padStart(5, '0')}:00`) : null;
  const valid = !!title.trim() && !!when && !Number.isNaN(when.getTime());

  const save = useMutation({
    mutationFn: async () => {
      const input = { kind, title: title.trim(), starts_at: when!.toISOString(), venue: venue.trim(), note: note.trim() };
      return editing ? api.updateEvent(event!.id, input) : api.createEvent(group!.id, { ...input, repeat_weeks: kind === 'rehearsal' ? repeat : 0 });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['event', saved.id] });
      router.replace({ pathname: '/event/[id]', params: { id: saved.id } });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteEvent(event!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      router.replace('/schedule');
    },
  });

  if (!group) return <Loading />;
  if (group.role !== 'leader') {
    return (
      <Page>
        <TopBar back title="Plan" />
        <Card>
          <Body>Only a leader can plan services and rehearsals.</Body>
        </Card>
      </Page>
    );
  }

  const chooseKind = (k: EventKind) => {
    setKind(k);
    if (!titleTouched) setTitle(defaultTitle(group.type, k));
  };

  return (
    <Page>
      <TopBar back title={editing ? 'Change details' : personal ? 'New setlist' : 'Plan'} subtitle={personal ? undefined : group.name} />
      <Card>
        {!personal ? (
          <View style={styles.group}>
            <Text style={styles.label}>What is it?</Text>
            <View style={styles.wrap}>
              {(['service', 'rehearsal', 'concert'] as EventKind[]).map((k) => (
                <Chip key={k} label={kindLabel(group.type, k)} on={kind === k} onPress={() => chooseKind(k)} />
              ))}
            </View>
          </View>
        ) : null}
        <Field
          label="Title"
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            setTitleTouched(true);
          }}
          placeholder={defaultTitle(group.type, kind)}
        />
      </Card>

      <Card>
        <Kicker>Date</Kicker>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {days.map((d, i) => (
            <Chip key={ymd(d)} label={i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtDate(d)} on={date === ymd(d)} onPress={() => setDate(ymd(d))} />
          ))}
        </ScrollView>
        <Field label="Another date (year-month-day)" value={date} onChangeText={setDate} placeholder="2026-12-24" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
        <Kicker>Time</Kicker>
        <View style={styles.wrap}>
          {TIMES.map((t) => (
            <Chip key={t} label={timeLabel(t)} on={time === t} onPress={() => setTime(t)} />
          ))}
        </View>
        <Field label="Another time (24-hour, e.g. 18:30)" value={time} onChangeText={setTime} placeholder="18:30" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
        {when && !Number.isNaN(when.getTime()) ? (
          <Body>
            {fmtDate(when)} at {timeLabel(hhmm(when))}
          </Body>
        ) : null}
      </Card>

      {kind === 'rehearsal' && !editing ? (
        <Card>
          <Kicker>Repeat every week</Kicker>
          <View style={styles.wrap}>
            {REPEATS.map((r) => (
              <Chip key={r} label={r === 0 ? 'Just once' : `${r + 1} weeks`} on={repeat === r} onPress={() => setRepeat(r)} />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Field label="Venue (optional)" value={venue} onChangeText={setVenue} placeholder="e.g. Parish hall" />
        <Field label="Note for members (optional)" value={note} onChangeText={setNote} multiline placeholder="e.g. Wear the green robes. Altos meet 30 minutes early." />
      </Card>

      {save.error ? <ErrorText message={save.error.message} /> : null}
      <Button label={editing ? 'Save changes' : personal ? 'Make setlist' : 'Plan it'} onPress={() => save.mutate()} disabled={!valid} busy={save.isPending} />
      {!valid ? <Body muted style={{ textAlign: 'center' }}>Choose a date and a time.</Body> : null}

      {editing ? (
        confirmDelete ? (
          <Card tone="sand">
            <Body>Delete “{event!.title}” and its song order? This can’t be undone.</Body>
            {remove.error ? <ErrorText message={remove.error.message} /> : null}
            <View style={styles.wrap}>
              <Button small kind="danger" label="Yes, delete it" onPress={() => remove.mutate()} busy={remove.isPending} />
              <Button small kind="ghost" label="Keep it" onPress={() => setConfirmDelete(false)} />
            </View>
          </Card>
        ) : (
          <Button kind="danger" label="Delete" onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { gap: 8 },
});
