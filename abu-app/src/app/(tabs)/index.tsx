/**
 * Home: what's happening now for the group you're looking at.
 * Grows with each milestone: services, replies, check-in and learning come next.
 */
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandMark, Motif } from '@/components/brand';
import { InviteCard } from '@/components/invite';
import { SongRow } from '@/components/song-row';
import { Avatar, Body, Button, Card, Kicker, Loading, Page, PartTag } from '@/components/ui';
import { DEMO_SONGS } from '@/data/demo-songs';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const s = useSession();

  if (s.status !== 'signedIn') return <LookingAround />;
  if (s.loadingMe || !s.group || !s.profile) return <Loading />;

  const g = s.group;
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
      ) : (
        <>
          <Card tone="red">
            <Motif color={colors.white} opacity={0.16} fade />
            <Kicker color="#FFD9CF">Next service</Kicker>
            <Text style={[styles.cardTitle, { color: colors.white }]}>Nothing planned yet</Text>
            <Text style={styles.onRed}>
              {g.role === 'leader'
                ? 'Planning services, rehearsals and song orders is coming in the next update.'
                : 'Your services and rehearsals will show here, with their song orders.'}
            </Text>
          </Card>
          {g.role === 'leader' && g.invite_code ? <InviteCard groupName={g.name} code={g.invite_code} /> : null}
        </>
      )}

      <Kicker>Try a song</Kicker>
      {DEMO_SONGS.map((d) => (
        <SongRow key={d.id} song={{ id: d.id, title: d.title, composer: d.composer, doh: d.key, time: d.time, playable: true }} />
      ))}
    </Page>
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
});
