/**
 * A service, rehearsal or concert: when and where, your reply, the song order
 * by section, Rehearse and Perform, and (for leaders) how ready each part is.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { api, eventLink, whatsappUrl, type EventDetails, type OrderItem, type Reply } from '@/api/client';
import { CheckedIn, CheckIn } from '@/components/check-in';
import { Readiness } from '@/components/readiness';
import { ReplyButtons } from '@/components/reply-buttons';
import { Body, Button, Card, ErrorText, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { checkInOpen, fmtDate, fmtTime, hasStarted, isOver, relDay } from '@/lib/dates';
import { kindLabel, kindNoun } from '@/lib/group-types';
import { bySection } from '@/lib/order';
import { KEY_NAMES, partPlural } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: s.status === 'signedIn' && !!id });

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  if (!details.data) {
    return (
      <Page>
        <TopBar back title={details.error ? 'Not found' : 'Loading…'} />
        {details.error ? <ErrorText message={details.error.message} /> : <Loading />}
      </Page>
    );
  }
  return <EventView details={details.data} />;
}

function EventView({ details }: { details: EventDetails }) {
  const styles = useStyles();
  const s = useSession();
  const { event: e, items, my_role } = details;
  const group = s.groups.find((g) => g.id === e.group_id);
  const type = group?.type ?? 'catholic';
  const personal = type === 'personal';
  const leader = my_role === 'leader';
  const canEditOrder = details.can_edit_order;
  const past = isOver(e.starts_at);
  const rehearsal = e.kind === 'rehearsal';
  const when = relDay(e.starts_at);

  return (
    <Page>
      <TopBar
        back
        title={e.title}
        subtitle={[`${fmtDate(e.starts_at)}`, fmtTime(e.starts_at), e.venue].filter(Boolean).join(' · ')}
        right={leader ? <Button small kind="ghost" label="Edit" accessibilityLabel="Change details" onPress={() => router.push({ pathname: '/event-editor', params: { id: e.id } })} /> : undefined}
      />
      <View style={styles.badges}>
        <Text style={[styles.badge, !rehearsal && styles.badgeRed]}>{kindLabel(type, e.kind)}</Text>
        <Text style={styles.badge}>
          {items.length} {items.length === 1 ? 'song' : 'songs'}
        </Text>
        {when ? <Text style={[styles.badge, styles.badgeDark]}>{when}</Text> : past ? <Text style={styles.badge}>past</Text> : null}
      </View>
      {e.note ? (
        <Card tone="sand">
          <Body>{e.note}</Body>
        </Card>
      ) : null}

      {!personal && !past ? <ReplyCard details={details} /> : null}
      {!personal && !past && (leader || my_role === 'part_leader') ? <WhoIsComing details={details} /> : null}
      {!personal ? <AttendanceSection details={details} /> : null}

      <View style={styles.sectHead}>
        <Kicker>{rehearsal ? 'Songs to prepare' : 'Song order'}</Kicker>
        {canEditOrder ? (
          <Pressable onPress={() => router.push({ pathname: '/event/[id]/order', params: { id: e.id } })} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Edit order</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length ? (
        <View style={{ gap: 12 }}>
          {bySection(items).map((run, r) => (
            <View key={`${run.section}-${r}`} style={{ gap: 6 }}>
              {run.section ? <Text style={styles.section}>{run.section}</Text> : null}
              {run.items.map(({ item, n }) => (
                <OrderRow key={item.id} item={item} n={n} />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <Body>No songs yet.</Body>
          {canEditOrder ? <Body muted>Tap “Edit order”, then add songs from the library.</Body> : <Body muted>Your leader will add the songs.</Body>}
        </Card>
      )}
      {canEditOrder && !items.length ? <CopyEarlier eventId={e.id} groupId={e.group_id} /> : null}

      {items.length ? (
        <Card tone="sand">
          <Kicker>Two ways to use this order</Kicker>
          <Button kind="ghost" label="Rehearse · play and practise each song" onPress={() => router.push({ pathname: '/event/[id]/rehearse', params: { id: e.id, i: '0' } })} />
          {!rehearsal ? <Button label="Perform · read only, no sound" onPress={() => router.push({ pathname: '/event/[id]/perform', params: { id: e.id, i: '0' } })} /> : null}
          <Text style={styles.small}>
            {rehearsal
              ? 'Go through the songs in order and practise your part.'
              : `Perform shows large, clear sol-fa and words for the ${kindNoun(type, e.kind)}. It has no play button, so nothing can start playing by accident.`}
          </Text>
        </Card>
      ) : null}

      {!personal && (leader || my_role === 'part_leader') && items.length ? <Readiness eventId={e.id} /> : null}

      <Button
        small
        kind="ghost"
        label="Share on WhatsApp"
        accessibilityLabel={`Share ${e.title} on WhatsApp`}
        onPress={() =>
          void Linking.openURL(
            whatsappUrl(
              `${e.title}: ${fmtDate(e.starts_at)} at ${fmtTime(e.starts_at)}${e.venue ? `, ${e.venue}` : ''}.${items.length ? ' The song order is on Abụ:' : ''} ${eventLink(e.id)}`,
            ),
          )
        }
        style={{ alignSelf: 'center' }}
      />
    </Page>
  );
}

function OrderRow({ item, n }: { item: OrderItem; n: number }) {
  const styles = useStyles();
  return (
    <Link href={{ pathname: '/song/[id]', params: { id: item.song_id } }} asChild>
      <Pressable style={styles.row} accessibilityRole="link" accessibilityLabel={`${n}. ${item.title}`}>
        <Text style={styles.ord}>{n}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.composer ? (
            <Text style={styles.small} numberOfLines={1}>
              {item.composer}
            </Text>
          ) : null}
        </View>
        <Text style={styles.key}>{item.playable ? KEY_NAMES[item.doh] : 'sheet'}</Text>
      </Pressable>
    </Link>
  );
}

function ReplyCard({ details }: { details: EventDetails }) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (status: Reply) => api.reply(details.event.id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', details.event.id] });
      void queryClient.invalidateQueries({ queryKey: ['replies', details.event.id] });
    },
  });
  const mine = send.isPending ? send.variables : details.my_reply;
  const { going, cant } = details.replies;
  return (
    <Card>
      <Kicker>Are you coming?</Kicker>
      <ReplyButtons value={mine ?? null} onChange={(v) => send.mutate(v)} />
      {mine === 'cant' ? <Text style={styles.small}>Your leader will see you as excused.</Text> : null}
      {going || cant ? (
        <Text style={styles.small}>
          {going} going{cant ? ` · ${cant} can’t come` : ''}
        </Text>
      ) : null}
      {send.error ? <ErrorText message={send.error.message} /> : null}
    </Card>
  );
}

/**
 * Leaders: who's coming, who can't and who hasn't replied, by name, and a
 * WhatsApp reminder. Part leaders see their own part.
 */
function WhoIsComing({ details }: { details: EventDetails }) {
  const styles = useStyles();
  const e = details.event;
  const partLeader = details.my_role === 'part_leader' ? details.my_part : null;
  const replies = useQuery({ queryKey: ['replies', e.id], queryFn: () => api.replies(e.id) });
  const members = useQuery({ queryKey: ['members', e.group_id], queryFn: () => api.members(e.group_id) });
  const [open, setOpen] = useState(false);
  if (!replies.data || !members.data) return null;

  const people = members.data.filter((m) => m.status === 'active' && (!partLeader || m.part === partLeader));
  const reply = new Map(replies.data.map((r) => [r.user_id, r.status]));
  const going = people.filter((m) => reply.get(m.user_id) === 'going');
  const cant = people.filter((m) => reply.get(m.user_id) === 'cant');
  const none = people.filter((m) => !reply.has(m.user_id));
  const names = (list: typeof people) => list.map((m) => m.display_name).join(', ');
  const reminder = `Please reply on Abụ: are you coming to ${e.title} on ${fmtDate(e.starts_at)} at ${fmtTime(e.starts_at)}? Tap Going or Can’t come: ${eventLink(e.id)}`;

  return (
    <Card>
      <Kicker>{partLeader ? `Who’s coming · ${partPlural(partLeader)}` : 'Who’s coming'}</Kicker>
      <Text style={styles.title}>
        {going.length} going · {cant.length} can’t come · {none.length} no reply yet
      </Text>
      {open ? (
        <View style={{ gap: 6 }}>
          {going.length ? <Text style={styles.small}>Going: {names(going)}</Text> : null}
          {cant.length ? <Text style={styles.small}>Can’t come: {names(cant)}</Text> : null}
          {none.length ? <Text style={styles.small}>No reply yet: {names(none)}</Text> : null}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button small kind="ghost" label={open ? 'Hide names' : 'Show names'} onPress={() => setOpen(!open)} />
        {none.length ? <Button small kind="ghost" label="Remind on WhatsApp" onPress={() => void Linking.openURL(whatsappUrl(reminder))} /> : null}
      </View>
    </Card>
  );
}

const MARK_LABEL = { present: 'Present', absent: 'Absent', excused: 'Excused' } as const;

/**
 * Members: check in with the code while it's open, then see their own mark.
 * Leaders and part leaders: how many are present, Mark, and the code to show.
 */
function AttendanceSection({ details }: { details: EventDetails }) {
  const styles = useStyles();
  const e = details.event;
  const leaderish = details.my_role === 'leader' || details.my_role === 'part_leader';
  const open = checkInOpen(e.starts_at);
  const started = hasStarted(e.starts_at);
  const sheet = useQuery({ queryKey: ['attendance', e.id], queryFn: () => api.attendance(e.id), enabled: leaderish && (open || started) });

  if (leaderish) {
    if (!open && !started) return null;
    const rows = sheet.data ?? [];
    const present = rows.filter((r) => r.status === 'present').length;
    const excused = rows.filter((r) => r.status === 'excused' || (!r.status && r.reply === 'cant')).length;
    return (
      <Card>
        <View style={styles.attHead}>
          <View style={{ flex: 1 }}>
            <Kicker>Attendance</Kicker>
            <Text style={styles.title}>{sheet.data ? `${present} present of ${rows.length}${excused ? ` · ${excused} excused` : ''}` : 'Loading…'}</Text>
          </View>
          <Button small label="Mark" accessibilityLabel="Mark attendance" onPress={() => router.push({ pathname: '/event/[id]/attendance', params: { id: e.id } })} />
        </View>
        {details.self_check_in && open ? (
          <Button small kind="ghost" label="Show the check-in code" onPress={() => router.push({ pathname: '/event/[id]/code', params: { id: e.id } })} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </Card>
    );
  }
  if (details.my_attendance === 'present' && open) return <CheckedIn />;
  if (details.self_check_in && open) return <CheckIn eventId={e.id} />;
  if (!started) return null;
  return (
    <Card>
      <Kicker>Your attendance</Kicker>
      <Text style={styles.title}>{details.my_attendance ? MARK_LABEL[details.my_attendance] : details.my_reply === 'cant' ? 'Excused (you said you can’t come)' : 'Not marked yet'}</Text>
    </Card>
  );
}

/** For an empty order: start from an earlier service's songs. */
function CopyEarlier({ eventId, groupId }: { eventId: string; groupId: string }) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const earlier = useQuery({
    queryKey: ['events', groupId, 'earlier'],
    queryFn: () => api.events(groupId, { to: new Date().toISOString() }),
  });
  const copy = useMutation({
    mutationFn: (from: string) => api.copyOrder(eventId, from),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  const list = (earlier.data ?? []).filter((x) => x.id !== eventId && (x.songs ?? 0) > 0).reverse().slice(0, 4);
  if (!list.length) return null;
  return (
    <Card>
      <Kicker>Or copy an earlier order</Kicker>
      {list.map((x) => (
        <Pressable key={x.id} style={styles.copyRow} onPress={() => copy.mutate(x.id)} disabled={copy.isPending} accessibilityRole="button" accessibilityLabel={`Copy the songs from ${x.title}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{x.title}</Text>
            <Text style={styles.small}>
              {fmtDate(x.starts_at)} · {x.songs} {x.songs === 1 ? 'song' : 'songs'}
            </Text>
          </View>
          <Text style={styles.link}>{copy.isPending && copy.variables === x.id ? 'Copying…' : 'Copy'}</Text>
        </Pressable>
      ))}
      {copy.error ? <ErrorText message={copy.error.message} /> : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    fontFamily: fonts.heavy,
    fontSize: 11.5,
    letterSpacing: 0.4,
    color: colors.ink,
    backgroundColor: colors.board,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  badgeRed: { backgroundColor: colors.redTint, color: colors.redDeep },
  badgeDark: { backgroundColor: colors.ink, color: colors.onInk },
  sectHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  link: { fontFamily: fonts.heavy, fontSize: 14, color: colors.link },
  section: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.redDeep, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12 },
  ord: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.sand, textAlign: 'center', lineHeight: 26, fontFamily: fonts.heavy, fontSize: 12.5, color: colors.muted, overflow: 'hidden' },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  key: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.redDeep },
  attHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
}));
