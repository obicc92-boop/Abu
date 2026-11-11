/**
 * Home: what's happening now for the group you're looking at: the next
 * service with your reply, the next rehearsal, the songs to learn for them,
 * and (for leaders) how ready each part is.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type EventDetails, type GroupEvent, type MyGroup, type OrderItem, type Practice, type Reply } from '@/api/client';
import { BrandMark, Motif } from '@/components/brand';
import { CheckedIn, CheckIn } from '@/components/check-in';
import { EventCard } from '@/components/event-card';
import { InviteCard } from '@/components/invite';
import { Readiness } from '@/components/readiness';
import { ReplyButtons } from '@/components/reply-buttons';
import { SongRow } from '@/components/song-row';
import { Avatar, Body, Button, Card, ErrorText, Kicker, Loading, Page, PartTag } from '@/components/ui';
import { DEMO_SONGS } from '@/data/demo-songs';
import { rateColor } from '@/lib/attendance';
import { checkInOpen, fmtDate, fmtTime, hasStarted, isOver, relDay, startOfDay } from '@/lib/dates';
import { kindLabel, kindNoun } from '@/lib/group-types';
import { partName } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * The group's next service (or setlist) and next rehearsal, each with its
 * details (your reply and its songs).
 */
function useUpcoming(g: MyGroup | null) {
  const active = !!g && g.status === 'active';
  const from = startOfDay(new Date()).toISOString();
  const events = useQuery({ queryKey: ['events', g?.id, 'from', from], queryFn: () => api.events(g!.id, { from }), enabled: active });
  const soon = (events.data ?? []).filter((e) => !isOver(e.starts_at));
  const service = soon.find((e) => e.kind !== 'rehearsal');
  const rehearsal = soon.find((e) => e.kind === 'rehearsal');
  const serviceDetails = useQuery({ queryKey: ['event', service?.id], queryFn: () => api.event(service!.id), enabled: !!service });
  const rehearsalDetails = useQuery({ queryKey: ['event', rehearsal?.id], queryFn: () => api.event(rehearsal!.id), enabled: !!rehearsal });
  // Happening now (check-in is open): for checking in, or for leaders to mark attendance.
  const live = g?.type !== 'personal' ? (events.data ?? []).find((e) => checkInOpen(e.starts_at)) : undefined;
  const liveDetails = useQuery({ queryKey: ['event', live?.id], queryFn: () => api.event(live!.id), enabled: !!live });
  return {
    loading: active && events.isPending,
    service,
    rehearsal,
    serviceDetails: serviceDetails.data,
    rehearsalDetails: rehearsalDetails.data,
    live,
    liveDetails: liveDetails.data,
  };
}

export default function Home() {
  const s = useSession();
  const upcoming = useUpcoming(s.status === 'signedIn' ? s.group : null);
  const practice = useQuery({ queryKey: ['myPractice'], queryFn: api.myPractice, enabled: s.status === 'signedIn' });
  const choir = s.status === 'signedIn' && s.group && s.group.type !== 'personal' && s.group.status === 'active' ? s.group : null;
  const attendance = useQuery({ queryKey: ['myAttendance', choir?.id], queryFn: () => api.myAttendance(choir!.id), enabled: !!choir });

  if (s.status !== 'signedIn') return <LookingAround />;
  if (s.loadingMe || !s.group || !s.profile) return <Loading />;

  const g = s.group;
  // Songs in the next service and rehearsal, each once, in order.
  const toLearn = [...(upcoming.serviceDetails?.items ?? []), ...(upcoming.rehearsalDetails?.items ?? [])].filter(
    (item, i, all) => all.findIndex((x) => x.song_id === item.song_id) === i,
  );
  const firstName = s.profile.display_name.split(' ')[0] || 'there';
  const choirs = s.groups.filter((x) => x.type !== 'personal');

  return (
    <Page>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>
            {greeting()}, {firstName}
          </Text>
          <Text style={styles.groupLine}>
            {g.type === 'personal' ? 'My space' : g.name}
            {g.part ? ' · ' : ''}
            <PartTag part={g.part} />
          </Text>
        </View>
        <Pressable onPress={() => router.push('/me')} accessibilityRole="button" accessibilityLabel="Your profile">
          <Avatar name={s.profile.display_name} part={g.part} size={42} />
        </Pressable>
      </View>

      {s.groups.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {s.groups.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => s.setGroup(x.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: x.id === g.id }}
              style={[styles.chip, x.id === g.id && styles.chipOn]}
            >
              <Text style={[styles.chipText, x.id === g.id && { color: colors.white }]}>{x.type === 'personal' ? 'My space' : x.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {choir && upcoming.live && upcoming.liveDetails ? <HappeningNow group={choir} event={upcoming.live} details={upcoming.liveDetails} /> : null}

      {g.status === 'pending' ? (
        <Card>
          <Kicker color={colors.redDeep}>Waiting to be let in</Kicker>
          <Text style={styles.cardTitle}>{g.name}</Text>
          <Body>The leader lets new members in. You’ll see the group’s songs and services here as soon as they do.</Body>
        </Card>
      ) : g.type === 'personal' ? (
        <Card tone="red">
          <Motif color={colors.white} opacity={0.16} fade />
          <Kicker color="#FFD9CF">{choirs.length ? 'Your own space' : 'Sing with a group?'}</Kicker>
          <Text style={[styles.cardTitle, { color: colors.white }]}>{choirs.length ? 'Your songs and setlists' : 'Join your choir or band'}</Text>
          <Text style={styles.onRed}>
            {choirs.length
              ? 'Save songs here and make personal setlists for weddings, concerts and services.'
              : 'Got a code from a choir or band? Join it here. You keep your own songs and setlists.'}
          </Text>
          <View style={styles.row}>
            <Button kind="light" small label="Join a group" onPress={() => router.push('/join')} />
            <Button kind="outlineLight" small label="Start a group" onPress={() => router.push('/create-group')} />
          </View>
        </Card>
      ) : upcoming.service ? (
        <NextService
          group={g}
          event={upcoming.service}
          myReply={upcoming.serviceDetails?.my_reply ?? null}
          songs={upcoming.serviceDetails?.items.length}
          canEditOrder={!!upcoming.serviceDetails?.can_edit_order}
        />
      ) : (
        <Card tone="red">
          <Motif color={colors.white} opacity={0.16} fade />
          <Kicker color="#FFD9CF">Next {kindNoun(g.type, 'service')}</Kicker>
          <Text style={[styles.cardTitle, { color: colors.white }]}>{upcoming.loading ? 'Loading…' : 'Nothing planned yet'}</Text>
          {!upcoming.loading ? (
            <Text style={styles.onRed}>
              {g.role === 'leader' ? 'Plan the next service and build its song order by section.' : 'Your services and rehearsals will show here, with their song orders.'}
            </Text>
          ) : null}
          {g.role === 'leader' && !upcoming.loading ? (
            <View style={styles.row}>
              <Button kind="light" small label={`Plan a ${kindNoun(g.type, 'service')}`} onPress={() => router.push('/event-editor')} />
            </View>
          ) : null}
        </Card>
      )}

      {g.type === 'personal' && upcoming.service ? (
        <>
          <Kicker>Your next setlist</Kicker>
          <EventCard event={upcoming.service} groupType={g.type} />
        </>
      ) : null}
      {g.type !== 'personal' && upcoming.rehearsal ? (
        <>
          <View style={styles.learnHead}>
            <Kicker>Next rehearsal</Kicker>
            {attendance.data?.rate != null ? (
              <Text style={styles.small}>
                Your attendance <Text style={{ fontFamily: fonts.heavy, color: rateColor(attendance.data.rate) }}>{attendance.data.rate}%</Text>
              </Text>
            ) : null}
          </View>
          <EventCard event={upcoming.rehearsal} groupType={g.type} />
        </>
      ) : null}

      {toLearn.length ? <LearnForUpcoming items={toLearn} practice={practice.data} part={g.part} /> : null}

      {g.type !== 'personal' && (g.role === 'leader' || g.role === 'part_leader') && upcoming.service && upcoming.serviceDetails?.items.length ? (
        <Readiness eventId={upcoming.service.id} title={`Ready for ${upcoming.service.title}?`} />
      ) : null}

      {g.type !== 'personal' && g.status === 'active' && g.role === 'leader' && g.invite_code ? <InviteCard groupName={g.name} code={g.invite_code} /> : null}

      {!toLearn.length ? (
        <>
          <Kicker>Try a song</Kicker>
          {DEMO_SONGS.map((d) => (
            <SongRow key={d.id} song={{ id: d.id, title: d.title, composer: d.composer, doh: d.key, time: d.time, playable: true }} />
          ))}
        </>
      ) : null}
    </Page>
  );
}

/**
 * Happening now (from 3 hours before the start to 6 hours after): members
 * check in with the code; leaders and part leaders mark attendance or show the code.
 */
function HappeningNow({ group, event, details }: { group: MyGroup; event: GroupEvent; details: EventDetails }) {
  const leaderish = details.my_role === 'leader' || details.my_role === 'part_leader';
  if (!leaderish) {
    if (!details.self_check_in) return null;
    return details.my_attendance === 'present' ? <CheckedIn /> : <CheckIn eventId={event.id} />;
  }
  return (
    <Card>
      <Kicker color={colors.redDeep}>
        {kindLabel(group.type, event.kind)} {hasStarted(event.starts_at) ? 'now' : `at ${fmtTime(event.starts_at)}`}
      </Kicker>
      <Text style={styles.cardTitle}>{event.title}</Text>
      <View style={styles.row}>
        <Button small label="Mark attendance" onPress={() => router.push({ pathname: '/event/[id]/attendance', params: { id: event.id } })} />
        {details.self_check_in ? (
          <Button small kind="ghost" label="Show the check-in code" onPress={() => router.push({ pathname: '/event/[id]/code', params: { id: event.id } })} />
        ) : null}
      </View>
    </Card>
  );
}

/** The red card: the next service, when and where, and your reply. */
function NextService({
  group,
  event,
  myReply,
  songs,
  canEditOrder,
}: {
  group: MyGroup;
  event: GroupEvent;
  myReply: Reply | null;
  songs?: number;
  canEditOrder: boolean;
}) {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (status: Reply) => api.reply(event.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event', event.id] }),
  });
  const mine = send.isPending ? (send.variables ?? null) : myReply;
  const personal = group.type === 'personal';
  const when = relDay(event.starts_at);
  const open = () => router.push({ pathname: '/event/[id]', params: { id: event.id } });
  return (
    <Card tone="red">
      <Motif color={colors.white} opacity={0.16} fade />
      <Kicker color="#FFD9CF">
        Next {kindNoun(group.type, event.kind)}
        {when ? ` · ${when}` : ''}
      </Kicker>
      <Pressable onPress={open} accessibilityRole="link">
        <Text style={[styles.cardTitle, { color: colors.white }]}>{event.title}</Text>
        <Text style={styles.onRed}>{[fmtDate(event.starts_at), fmtTime(event.starts_at), event.venue].filter(Boolean).join(' · ')}</Text>
      </Pressable>
      {!personal ? <ReplyButtons light value={mine} onChange={(v) => send.mutate(v)} /> : null}
      {send.error ? <ErrorText message={send.error.message} /> : null}
      <View style={styles.row}>
        <Button
          kind="light"
          small
          label={songs === 0 ? (canEditOrder ? 'Add songs' : 'No songs yet') : songs === undefined ? 'Song order' : `Song order · ${songs} ${songs === 1 ? 'song' : 'songs'}`}
          onPress={() => (songs === 0 && canEditOrder ? router.push({ pathname: '/event/[id]/order', params: { id: event.id } }) : open())}
        />
        {songs ? <Button kind="outlineLight" small label="Perform" onPress={() => router.push({ pathname: '/event/[id]/perform', params: { id: event.id, i: '0' } })} /> : null}
      </View>
    </Card>
  );
}

/** Songs coming up, with how far along you are on each (your own practice, seen only by you). */
function LearnForUpcoming({ items, practice, part }: { items: OrderItem[]; practice?: Practice[]; part: string | null }) {
  const bySong = new Map((practice ?? []).map((p) => [p.song_id, p]));
  const known = items.filter((i) => bySong.get(i.song_id)?.knows_part).length;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.learnHead}>
        <Kicker>Learn for upcoming</Kicker>
        <Text style={styles.small}>
          {part ? `${partName(part)} · ` : ''}
          {known} of {items.length} known
        </Text>
      </View>
      {items.slice(0, 8).map((item) => {
        const p = bySong.get(item.song_id);
        const note = p?.knows_part ? '✓ Know it' : p?.plays ? `${p.plays} ${p.plays === 1 ? 'play' : 'plays'}` : 'New';
        return (
          <SongRow
            key={item.song_id}
            song={{ id: item.song_id, title: item.title, composer: item.composer, doh: item.doh, time: item.time_signature, playable: item.playable }}
            note={note}
          />
        );
      })}
    </View>
  );
}

/** Home for someone browsing without an account. */
function LookingAround() {
  const s = useSession();
  return (
    <Page>
      <Card tone="red" style={{ alignItems: 'flex-start' }}>
        <Motif color={colors.white} opacity={0.16} fade />
        <BrandMark size={64} />
        <Text style={[styles.cardTitle, { color: colors.white, marginTop: 6 }]}>Welcome to Abụ</Text>
        <Text style={styles.onRed}>Listen to any song’s parts now. Create an account to join your choir, save songs and see your song orders.</Text>
        <Button
          kind="light"
          small
          label="Create an account or sign in"
          onPress={() => {
            s.setLookingAround(false);
            router.replace('/welcome');
          }}
        />
      </Card>
      <Kicker>Try a song</Kicker>
      {DEMO_SONGS.map((d) => (
        <SongRow key={d.id} song={{ id: d.id, title: d.title, composer: d.composer, doh: d.key, time: d.time, playable: true }} />
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { fontFamily: fonts.heavy, fontSize: 22, color: colors.ink },
  groupLine: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 2 },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  cardTitle: { fontFamily: fonts.heavy, fontSize: 20, color: colors.ink },
  onRed: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: '#FFE7E0' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  learnHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
});
