/**
 * A song's earlier versions (owner's yes, 21 November 2026, after the song editor's "Fill in an example" was saved
 * over Worthy is the Lamb and its music had to be got back by rewinding the whole database): every save that changes
 * a song keeps it as it was, the last 20. Whoever can edit the song sees them here, newest first; opens one to see what
 * differs, its score, and to play it; and can bring it back. Bringing one back keeps the song as it is now as a version
 * too, so that can be undone the same way. Opened from the song's page ("Earlier versions", next to Edit).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, type Song, type SongVersion } from '@/api/client';
import { useNowPlaying } from '@/audio/now-playing';
import { useSongPlayer } from '@/audio/use-song-player';
import { ChevronIcon } from '@/components/icons';
import { PlayButton } from '@/components/player-controls';
import { Score, type BarActions } from '@/components/score';
import { Body, Button, Card, ErrorText, Loading, Page, TopBar } from '@/components/ui';
import { fmtDate, fmtTime } from '@/lib/dates';
import { barAt, rangeLabel, songBars } from '@/score/bars';
import { KEY_NAMES, parseSolfa } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/** "Sat 21 Nov, 2:19 PM". */
const when = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

/** How many bars a song's music has (0 for none). */
function barCount(solfa: string, time: string, doh: number): number {
  return solfa.trim() ? songBars(parseSolfa(solfa, { time, key: doh })).length : 0;
}

/** What differs between a version and the song as it is now: "the music and the composer". */
function differences(v: SongVersion, now: Song): string[] {
  return [
    v.solfa !== now.solfa ? 'the music' : null,
    v.title !== now.title ? 'the title' : null,
    v.composer !== now.composer ? 'the composer' : null,
    v.doh !== now.doh ? 'the key' : null,
    v.time_signature !== now.time_signature ? 'the time' : null,
    JSON.stringify(v.tags) !== JSON.stringify(now.tags) ? 'the tags' : null,
  ].filter((d): d is string => !!d);
}

const andList = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** What bringing a version back changes, all of it: "Its music and composer replace the song's now." */
function replacing(diff: string[]): string {
  const parts = diff.map((d) => d.replace(/^the /, ''));
  const many = parts.length > 1 || parts[0] === 'tags';
  return `Its ${andList(parts)} ${many ? 'replace' : 'replaces'} the song’s now.`;
}

export default function SongVersionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useSession();
  const song = useQuery({ queryKey: ['song', id], queryFn: () => api.song(id!), enabled: !!id });
  const versions = useQuery({ queryKey: ['songVersions', id], queryFn: () => api.songVersions(id!), enabled: !!id && status === 'signedIn' });
  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { mode: 'sign-in' } }} />;
  const error = song.error ?? versions.error;
  if (!song.data || !versions.data) {
    return (
      <Page>
        <TopBar back title="Earlier versions" />
        {error ? <ErrorText message={error.message} /> : <Loading />}
      </Page>
    );
  }
  return <Versions song={song.data} versions={versions.data} />;
}

function Versions({ song, versions }: { song: Song; versions: SongVersion[] }) {
  const styles = useStyles();
  const colors = useColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const app = useNowPlaying();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const open = versions.find((v) => v.id === openId) ?? null;

  // The open version, to see and play (here, not in the app's player: it isn't the song as it is).
  const parsed = useMemo(() => (open?.solfa.trim() ? parseSolfa(open.solfa, { time: open.time_signature, key: open.doh }) : null), [open]);
  const player = useSongPlayer(parsed, open?.doh ?? 0);
  const bars = useMemo(() => (parsed ? songBars(parsed) : []), [parsed]);
  const [fromBar, setFromBar] = useState<number | null>(null);
  /** One song at a time: the song's own player stops while a version plays. */
  const quietApp = () => {
    if (app.player.playing) app.player.stop();
  };
  const barActions: BarActions = {
    canPlay: !!parsed,
    playFrom: (beat) => {
      quietApp();
      setFromBar(barAt(bars, beat)?.bar ?? null);
      player.playFrom(beat);
    },
    playBar: (from, to, loop) => {
      quietApp();
      player.playRange(from, to, { loop });
    },
  };
  const barNow = barAt(bars, Math.max(0, player.beat))?.bar ?? 1;
  const nowPlaying = player.playing
    ? player.range
      ? rangeLabel(player.range, bars)
      : fromBar && fromBar > 1
        ? `Playing from bar ${fromBar}`
        : `Bar ${barNow} of ${bars.length}`
    : player.pausedAt !== null
      ? `Paused · bar ${barNow}`
      : null;

  const toggle = (v: SongVersion) => {
    player.stop();
    setFromBar(null);
    setConfirming(false);
    setOpenId(openId === v.id ? null : v.id);
  };

  const bringBack = useMutation({
    mutationFn: (v: SongVersion) => api.bringBackVersion(song.id, v.id),
    onSuccess: async (saved) => {
      player.stop();
      queryClient.setQueryData(['song', song.id], saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['songVersions', song.id] }),
        queryClient.invalidateQueries({ queryKey: ['songs'] }),
        queryClient.invalidateQueries({ queryKey: ['repertoire'] }),
      ]);
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/song/[id]', params: { id: song.id } });
    },
  });

  const footer = parsed ? (
    <View style={[styles.transport, { paddingBottom: 8 + insets.bottom }]}>
      <PlayButton
        playing={player.playing}
        onPress={() => {
          quietApp();
          if (player.pausedAt === null) setFromBar(null);
          player.togglePlay();
        }}
        size={56}
      />
      <View style={styles.transportText}>
        <Text style={styles.transportNow} numberOfLines={1} accessibilityLiveRegion="polite">
          {nowPlaying ?? 'Play this version'}
        </Text>
        <Text style={styles.transportHint} numberOfLines={1}>
          Saved {when(open!.saved_at)}
        </Text>
      </View>
      {nowPlaying ? (
        <Pressable onPress={player.stop} accessibilityRole="button" hitSlop={8} style={styles.stopPill}>
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
      ) : null}
    </View>
  ) : undefined;

  return (
    <Page footer={footer}>
      <TopBar back title="Earlier versions" subtitle={song.title} />
      <Body muted>
        Each time this song is saved with a change, the version before is kept here: the last 20. Open one to see it and play it. Bringing one back keeps the song as it is now here too, so nothing is lost.
      </Body>
      {versions.length === 0 ? (
        <Card>
          <Body>No earlier versions yet. From now on, each time the song is saved with a change, the version before is kept here.</Body>
        </Card>
      ) : null}
      {versions.map((v) => {
        const isOpen = v.id === openId;
        const diff = differences(v, song);
        const count = barCount(v.solfa, v.time_signature, v.doh);
        return (
          <Card key={v.id}>
            <Pressable
              onPress={() => toggle(v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`Version saved ${when(v.saved_at)}`}
              style={styles.head}
            >
              <View style={styles.headText}>
                <Text style={styles.when}>{when(v.saved_at)}</Text>
                <Text style={styles.meta}>
                  {[v.saved_by_name ? `Saved by ${v.saved_by_name}` : null, count ? `${count} ${count === 1 ? 'bar' : 'bars'}` : 'No music'].filter(Boolean).join(' · ')}
                </Text>
                <Text style={[styles.meta, diff.length ? styles.diff : null]}>{diff.length ? `Differs from now in ${andList(diff)}` : 'The same as now'}</Text>
              </View>
              <View style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}>
                <ChevronIcon color={colors.muted} size={16} />
              </View>
            </Pressable>
            {isOpen ? (
              <View style={styles.body}>
                {v.title !== song.title || v.composer !== song.composer || v.doh !== song.doh || v.time_signature !== song.time_signature ? (
                  <Text style={styles.details}>
                    {[v.title, v.composer, `Doh is ${KEY_NAMES[v.doh]}`, v.time_signature].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  Replaced {when(v.replaced_at)}
                  {v.replaced_by_name ? ` by ${v.replaced_by_name}` : ''}
                </Text>
                {parsed ? (
                  <Score song={parsed} activeBeat={player.beat} barActions={barActions} flagProblems />
                ) : (
                  <Body muted>This version has no music written in.</Body>
                )}
                {confirming ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmText}>
                      Bring back the version saved {when(v.saved_at)}? {replacing(diff)} The song as it is now is kept here too.
                    </Text>
                    <View style={styles.buttons}>
                      <Button small label="Bring it back" busy={bringBack.isPending} onPress={() => bringBack.mutate(v)} />
                      <Button small kind="ghost" label="Cancel" onPress={() => setConfirming(false)} />
                    </View>
                  </View>
                ) : diff.length ? (
                  <Button small kind="ghost" label="Bring this version back" onPress={() => setConfirming(true)} style={{ alignSelf: 'flex-start' }} />
                ) : null}
                {bringBack.error ? <ErrorText message={bringBack.error.message} /> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  when: { fontFamily: fonts.heavy, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  diff: { color: colors.ink },
  body: { gap: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  details: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  confirm: { gap: 8, padding: 10, borderRadius: 12, backgroundColor: colors.sand },
  confirmText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingHorizontal: 16, backgroundColor: colors.card },
  transportText: { flex: 1, minWidth: 0 },
  transportNow: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  transportHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  stopPill: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 12, minHeight: 28, justifyContent: 'center' },
  stopText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink },
}));
