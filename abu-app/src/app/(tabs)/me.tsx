/**
 * Me: your name, your practice (private to you), your groups and your part in
 * each, your password, how Perform looks on this phone, and signing out.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type MyGroup } from '@/api/client';
import { authClient } from '@/auth/client';
import { SongRow } from '@/components/song-row';
import { Avatar, Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, PartPicker, PartTag, TopBar } from '@/components/ui';
import { GROUP_TYPES } from '@/lib/group-types';
import { readSetting, writeSetting } from '@/lib/storage';
import { partName } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

const PERFORM_THEME = 'abu.performTheme';

export default function Me() {
  const s = useSession();
  const [name, setName] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (display_name: string) => api.updateMe({ display_name }), onSuccess: () => (setName(null), s.refresh()) });

  if (s.status !== 'signedIn') {
    return (
      <Page>
        <TopBar title="Me" />
        <Card>
          <Kicker>You’re looking around</Kicker>
          <Body>Create an account to join your choir, save songs, and keep your practice.</Body>
          <Button
            label="Create an account or sign in"
            onPress={() => {
              s.setLookingAround(false);
              router.replace('/welcome');
            }}
          />
        </Card>
        <PerformLook />
        <About />
      </Page>
    );
  }
  if (s.loadingMe || !s.profile) return <Loading />;

  return (
    <Page>
      <TopBar title="Me" />
      <Card>
        <View style={styles.profile}>
          <Avatar name={s.profile.display_name} part={s.group?.part} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{s.profile.display_name}</Text>
            <Text style={styles.small}>{s.email}</Text>
          </View>
        </View>
        {name === null ? (
          <Button kind="ghost" small label="Change your name" onPress={() => setName(s.profile!.display_name)} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <>
            <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" />
            {save.error ? <ErrorText message={save.error.message} /> : null}
            <View style={styles.row}>
              <Button small label="Save" onPress={() => save.mutate(name)} busy={save.isPending} />
              <Button small kind="ghost" label="Cancel" onPress={() => setName(null)} />
            </View>
          </>
        )}
      </Card>

      <YourPractice />

      <Kicker>Your groups</Kicker>
      {s.groups.map((g) => (
        <GroupRow key={g.id} group={g} me={s.profile!.id} current={g.id === s.group?.id} />
      ))}
      <View style={styles.row}>
        <Button label="Join a group" onPress={() => router.push('/join')} style={{ flexGrow: 1 }} />
        <Button kind="ghost" label="Start a group" onPress={() => router.push('/create-group')} style={{ flexGrow: 1 }} />
      </View>

      <Password />
      <PerformLook />
      <About />

      <Button
        kind="danger"
        label="Sign out"
        onPress={async () => {
          await s.signOut();
          router.replace('/welcome');
        }}
      />
    </Page>
  );
}

/** This week, a gentle streak, and the songs you know. Only you see it. */
function YourPractice() {
  const summary = useQuery({ queryKey: ['myPractice', 'summary'], queryFn: api.practiceSummary });
  const songs = useQuery({ queryKey: ['myPractice'], queryFn: api.myPractice });
  const [all, setAll] = useState(false);
  const t = summary.data;
  const list = (songs.data ?? []).filter((p) => p.plays > 0 || p.knows_part);
  const shown = all ? list : list.slice(0, 4);

  return (
    <View style={{ gap: 8 }}>
      <Kicker>Your practice</Kicker>
      <Card>
        {t ? (
          <>
            <View style={styles.stats}>
              <Stat value={t.week_plays} label={t.week_plays === 1 ? 'play this week' : 'plays this week'} />
              <Stat value={t.songs_known} label={t.songs_known === 1 ? 'song you know' : 'songs you know'} />
              <Stat value={t.streak} label={t.streak === 1 ? 'day in a row' : 'days in a row'} gold={t.streak >= 2} />
            </View>
            <Text style={styles.small}>
              {t.streak >= 2
                ? `Lovely: ${t.streak} days in a row. Play a song today to keep it going.`
                : t.week_days
                  ? `You practised on ${t.week_days} ${t.week_days === 1 ? 'day' : 'days'} this week.`
                  : 'Play any song through to start your week.'}{' '}
              Only you see this.
            </Text>
          </>
        ) : summary.error ? (
          <ErrorText message={summary.error.message} />
        ) : (
          <Loading />
        )}
      </Card>
      {shown.map((p) => (
        <SongRow
          key={p.song_id}
          song={{ id: p.song_id, title: p.title, composer: p.composer, doh: p.doh, time: p.time_signature, playable: p.playable }}
          note={p.knows_part ? '✓ Know it' : `${p.plays} ${p.plays === 1 ? 'play' : 'plays'}`}
        />
      ))}
      {list.length > shown.length ? <Button small kind="ghost" label={`Show all ${list.length}`} onPress={() => setAll(true)} style={{ alignSelf: 'center' }} /> : null}
    </View>
  );
}

function Stat({ value, label, gold }: { value: number; label: string; gold?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, gold && { color: colors.gold }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** One of your groups: tap to show it; change the part you sing there. */
function GroupRow({ group: g, me, current }: { group: MyGroup; me: string; current: boolean }) {
  const s = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const setPart = useMutation({
    mutationFn: (part: string | null) => api.updateMember(g.id, me, { part }),
    onSuccess: async () => {
      setOpen(false);
      await s.refresh();
      await queryClient.invalidateQueries({ queryKey: ['members', g.id] });
    },
  });
  const personal = g.type === 'personal';
  return (
    <View style={[styles.groupRow, current && styles.groupRowOn]}>
      <Pressable
        onPress={() => {
          s.setGroup(g.id);
          router.push('/');
        }}
        accessibilityRole="button"
        accessibilityLabel={`Show ${personal ? 'My space' : g.name}`}
        accessibilityState={{ selected: current }}
        style={styles.groupTop}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.groupName}>{personal ? 'My space' : g.name}</Text>
          <Text style={styles.small}>
            {personal
              ? 'Your own songs and setlists'
              : [GROUP_TYPES[g.type].name, g.status === 'pending' ? 'waiting to be let in' : g.role === 'leader' ? g.leader_title : g.role === 'part_leader' ? 'Part leader' : null]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>
        </View>
        {current ? <Text style={styles.current}>Showing</Text> : null}
      </Pressable>
      <View style={styles.partLine}>
        <Text style={styles.small}>
          {personal ? 'Your usual part: ' : 'Your part: '}
          {g.part ? <PartTag part={g.part} /> : <Text style={styles.small}>not set</Text>}
        </Text>
        <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`Change your part in ${personal ? 'My space' : g.name}`} hitSlop={8}>
          <Text style={styles.link}>{open ? 'Close' : 'Change'}</Text>
        </Pressable>
      </View>
      {open ? (
        <>
          <PartPicker value={g.part} onChange={(p) => setPart.mutate(p)} allowNone />
          {setPart.error ? <ErrorText message={setPart.error.message} /> : null}
        </>
      ) : null}
    </View>
  );
}

/** Change your password with the current one; other phones are signed out. */
function Password() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (error) throw new Error(error.status === 400 || error.status === 401 ? 'That isn’t your current password.' : (error.message ?? 'Couldn’t change your password.'));
    },
    onSuccess: () => {
      setOpen(false);
      setDone(true);
      setCurrent('');
      setNext('');
      setAgain('');
    },
  });
  const problem = next && next.length < 8 ? 'Use at least 8 characters.' : again && again !== next ? 'The two new passwords don’t match.' : null;

  return (
    <Card>
      <Kicker>Password</Kicker>
      {done && !open ? <Text style={[styles.small, { color: colors.ok }]}>Password changed. Other phones signed in as you have been signed out.</Text> : null}
      {open ? (
        <>
          <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="At least 8 characters." />
          <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" error={problem} />
          {change.error ? <ErrorText message={change.error.message} /> : null}
          <View style={styles.row}>
            <Button small label="Change password" onPress={() => change.mutate()} disabled={!current || next.length < 8 || next !== again} busy={change.isPending} />
            <Button small kind="ghost" label="Cancel" onPress={() => setOpen(false)} />
          </View>
        </>
      ) : (
        <Button small kind="ghost" label="Change your password" onPress={() => (setOpen(true), setDone(false))} style={{ alignSelf: 'flex-start' }} />
      )}
    </Card>
  );
}

/** Perform's background on this phone (Perform remembers changes too). */
function PerformLook() {
  const [light, setLight] = useState(() => readSetting(PERFORM_THEME) === 'light');
  const choose = (on: boolean) => {
    setLight(on);
    writeSetting(PERFORM_THEME, on ? 'light' : 'dark');
  };
  return (
    <Card>
      <Kicker>Perform on this phone</Kicker>
      <Text style={styles.small}>The background for reading sol-fa at Mass or on stage. Dark is easier in a dim church; light is clearer in daylight.</Text>
      <View style={styles.row}>
        <Chip label="Dark" on={!light} onPress={() => choose(false)} />
        <Chip label="Light" on={light} onPress={() => choose(true)} />
      </View>
    </Card>
  );
}

function About() {
  const version = Constants.expoConfig?.version;
  return (
    <Card tone="sand">
      <Kicker>About Abụ</Kicker>
      <Text style={styles.small}>
        Abụ means “song” in Igbo. Learn your part in tonic sol-fa, and keep your choir together.{version ? ` Version ${version}.` : ''}
      </Text>
      <Text style={styles.small}>Your practice is private to you. Leaders see only totals for each part ({['S', 'A', 'T', 'B'].map(partName).join(', ')}).</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontFamily: fonts.heavy, fontSize: 19, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  link: { fontFamily: fonts.heavy, fontSize: 13.5, color: colors.red },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.sand, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  statValue: { fontFamily: fonts.monoBold, fontSize: 26, color: colors.ink },
  statLabel: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.muted, textAlign: 'center' },
  groupRow: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, padding: 14, gap: 8 },
  groupRowOn: { borderColor: colors.ink },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  partLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  current: { fontFamily: fonts.bold, fontSize: 12, color: colors.ok },
});
