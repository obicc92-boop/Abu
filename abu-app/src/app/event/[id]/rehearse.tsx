/** Rehearse: the full player for each song in the order, with Previous and Next. */
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { api } from '@/api/client';
import { SongView } from '@/components/song-view';
import { Body, Card, ErrorText, Loading, MAX_WIDTH, Page, TopBar } from '@/components/ui';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function RehearseScreen() {
  const styles = useStyles();
  const { id, i } = useLocalSearchParams<{ id: string; i?: string }>();
  const s = useSession();
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: s.status === 'signedIn' && !!id });

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  if (!details.data) {
    return (
      <Page>
        <TopBar back title="Rehearse" />
        {details.error ? <ErrorText message={details.error.message} /> : <Loading />}
      </Page>
    );
  }
  const items = details.data.items;
  if (!items.length) {
    return (
      <Page>
        <TopBar back title="Rehearse" subtitle={details.data.event.title} />
        <Card>
          <Body>There are no songs in this order yet.</Body>
        </Card>
      </Page>
    );
  }
  const at = Math.min(Math.max(0, Number(i) || 0), items.length - 1);
  const item = items[at];
  const go = (to: number) => router.setParams({ i: String(to) });

  const banner = (
    <View style={styles.outer}>
      <View style={styles.bar}>
        <StepButton label="‹ Previous" disabled={at === 0} onPress={() => go(at - 1)} />
        <View style={styles.middle}>
          <Text style={styles.kicker}>
            Rehearse · {at + 1} of {items.length}
          </Text>
          {item.section ? (
            <Text style={styles.section} numberOfLines={1}>
              {item.section}
            </Text>
          ) : null}
        </View>
        <StepButton label="Next ›" disabled={at === items.length - 1} onPress={() => go(at + 1)} />
      </View>
    </View>
  );
  // A new key per song stops the last one and starts the player fresh.
  return <SongView key={item.id} id={item.song_id} banner={banner} />;
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.step, disabled && { opacity: 0.35 }]} hitSlop={4}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  outer: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16, marginBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 12, backgroundColor: colors.board },
  middle: { flex: 1, alignItems: 'center', minWidth: 0 },
  kicker: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  section: { fontFamily: fonts.bold, fontSize: 13, color: colors.redDeep },
  step: { paddingHorizontal: 12, minHeight: 36, borderRadius: 9, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
}));
