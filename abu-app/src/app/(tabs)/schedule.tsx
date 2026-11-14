/**
 * Schedule (Setlists in your own space): services, rehearsals and concerts by
 * week, with a Plan button for leaders.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api, type GroupEvent } from '@/api/client';
import { EventCard } from '@/components/event-card';
import { CalendarIcon } from '@/components/icons';
import { Body, Button, Card, ErrorText, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { weekBucket } from '@/lib/dates';
import { useSession } from '@/state/session';
import { useColors } from '@/theme/theme';

const BUCKETS = ['this week', 'next week', 'later'] as const;

export default function Schedule() {
  const colors = useColors();
  const s = useSession();
  const [showPast, setShowPast] = useState(false);
  const g = s.group;
  const ready = s.status === 'signedIn' && !!g && g.status === 'active';
  const events = useQuery({ queryKey: ['events', g?.id], queryFn: () => api.events(g!.id), enabled: ready });
  const personal = !g || g.type === 'personal';
  const leader = g?.role === 'leader';

  if (s.status !== 'signedIn') {
    return (
      <Page>
        <TopBar title="Schedule" />
        <Card>
          <Body>Sign in and join your choir to see its services, rehearsals and song orders.</Body>
        </Card>
      </Page>
    );
  }
  if (!g || s.loadingMe) return <Loading />;
  if (g.status !== 'active') {
    return (
      <Page>
        <TopBar title="Schedule" subtitle={g.name} />
        <Card>
          <Body>You’ll see the schedule once the leader lets you in.</Body>
        </Card>
      </Page>
    );
  }

  const list = events.data ?? [];
  const now = new Date();
  const byBucket = (b: string) => list.filter((e) => weekBucket(e.starts_at, now) === b);
  const past = list.filter((e) => weekBucket(e.starts_at, now) === 'past').reverse();

  return (
    <Page>
      <TopBar
        title={personal ? 'Setlists' : 'Schedule'}
        subtitle={personal ? 'Your own song orders for weddings, concerts and services.' : g.name}
        right={leader ? <Button small label={personal ? 'New setlist' : 'Plan'} onPress={() => router.push('/event-editor')} /> : undefined}
      />
      {events.isPending ? <Loading /> : null}
      {events.error ? <ErrorText message={events.error.message} /> : null}

      {BUCKETS.map((b) =>
        byBucket(b).length ? (
          <View key={b} style={{ gap: 8 }}>
            <Kicker>{b}</Kicker>
            {byBucket(b).map((e: GroupEvent) => (
              <EventCard key={e.id} event={e} groupType={g.type} />
            ))}
          </View>
        ) : null,
      )}

      {!events.isPending && !list.some((e) => weekBucket(e.starts_at, now) !== 'past') ? (
        <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
          <CalendarIcon size={34} color={colors.muted} />
          <Body style={{ textAlign: 'center' }}>{personal ? 'No setlists yet.' : 'Nothing planned yet.'}</Body>
          <Body muted style={{ textAlign: 'center' }}>
            {leader
              ? personal
                ? 'Make a setlist for a wedding, concert or service, and use Perform on the day.'
                : 'Plan a service or rehearsal, then build its song order by section.'
              : 'Your leader plans services and rehearsals; they’ll show here with their song orders.'}
          </Body>
        </Card>
      ) : null}

      {past.length ? (
        showPast ? (
          <View style={{ gap: 8 }}>
            <Kicker>Past</Kicker>
            {past.slice(0, 20).map((e) => (
              <EventCard key={e.id} event={e} groupType={g.type} muted />
            ))}
          </View>
        ) : (
          <Button kind="ghost" small label={`Show past (${past.length})`} onPress={() => setShowPast(true)} style={{ alignSelf: 'center' }} />
        )
      ) : null}
    </Page>
  );
}
