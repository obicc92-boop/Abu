import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, type Song } from '@/api/client';
import { partLevel } from '@/audio/engine';
import { useSongPlayer } from '@/audio/use-song-player';
import { DEMO_SONGS, type DemoSong } from '@/data/demo-songs';
import { dayKey } from '@/lib/dates';
import { queuePlay } from '@/lib/outbox';
import { KEY_NAMES, mod12, parseSolfa } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

import { PartMixer, PlayButton, Stepper, ToggleRow } from './player-controls';
import { Score } from './score';
import { SongActions } from './song-actions';

/**
 * A song: the player with its score, mixer and transport, or, for a sheet-only
 * song, its sheet and actions. Used by the song page and by Rehearse, which
 * puts its own step-through bar in `banner`.
 */
export function SongView({ id, banner }: { id: string; banner?: ReactNode }) {
  const demo = DEMO_SONGS.find((s) => s.id === id);
  // Every song comes from the library; the demo songs are also built in, so they
  // open instantly and still play with no connection.
  const shared = useQuery({ queryKey: ['song', id], queryFn: () => api.song(id), enabled: !!id, retry: demo ? 0 : 1 });
  const song: DemoSong | undefined = shared.data
    ? {
        id: shared.data.id,
        title: shared.data.title,
        composer: shared.data.composer,
        key: shared.data.doh,
        time: shared.data.time_signature,
        tags: shared.data.tags,
        solfa: shared.data.solfa,
      }
    : demo;

  if (!song) {
    return (
      <SafeAreaView style={styles.page}>
        <TopBar title={shared.isPending ? 'Loading…' : 'Song not found'} subtitle={shared.isPending ? '' : 'It may have been removed.'} />
      </SafeAreaView>
    );
  }
  if (!song.solfa.trim()) {
    return (
      <SafeAreaView style={styles.page}>
        <TopBar title={song.title} subtitle={[song.composer, 'sheet only'].filter(Boolean).join(' · ')} />
        {banner}
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.hint, { textAlign: 'left', fontSize: 14 }]}>
            Nobody has typed this song in sol-fa yet, so it can’t play. Open the original sheet below, or type the sol-fa if you’re in the group that shared it.
          </Text>
          <SongActions songId={song.id} song={shared.data} />
        </ScrollView>
      </SafeAreaView>
    );
  }
  // A fresh player when the sol-fa itself changes (after an edit), but not when the
  // library's copy of a built-in demo song arrives with the same text: that would
  // stop a song someone has just started.
  return <Player key={`${song.id}-${song.solfa.length}`} song={song} apiSong={shared.data} banner={banner} />;
}

function Player({ song, apiSong, banner }: { song: DemoSong; apiSong?: Song; banner?: ReactNode }) {
  const parsed = useMemo(() => parseSolfa(song.solfa, { time: song.time, key: song.key }), [song.solfa, song.time, song.key]);
  const { status, group } = useSession();
  const p = useSongPlayer(parsed, song.key, group?.part ?? null);
  const queryClient = useQueryClient();

  // Each time you play the song through, count it (privately) when signed in.
  const counted = useRef(0);
  useEffect(() => {
    if (p.timesPlayed <= counted.current) return;
    counted.current = p.timesPlayed;
    if (status !== 'signedIn' || !apiSong) return;
    const day = dayKey();
    void api
      .recordPlay(song.id, day)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['songForMe', song.id] }),
          queryClient.invalidateQueries({ queryKey: ['myPractice'] }),
          queryClient.invalidateQueries({ queryKey: ['readiness'] }),
        ]),
      )
      // No connection: keep the play and send it when the phone is back online.
      .catch((e: { status?: number }) => e.status === 0 && queuePlay({ songId: song.id, day }));
  }, [p.timesPlayed, status, apiSong, song.id, queryClient]);
  const insets = useSafeAreaInsets();
  const keyName = KEY_NAMES[mod12(song.key + p.transpose)];
  const silent = useMemo(() => Object.fromEntries(parsed.parts.map((part) => [part, partLevel(part, p.mix) === 0])), [parsed, p.mix]);

  // Keep the line being played in view.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const viewHeight = useRef(0);
  const scoreTop = useRef(0);
  const followLine = useCallback((y: number, height: number) => {
    const top = scoreTop.current + y;
    if (top < scrollY.current + 8 || top + height > scrollY.current + viewHeight.current - 16) {
      scrollRef.current?.scrollTo({ y: Math.max(0, top - 60), animated: true });
    }
  }, []);

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <TopBar title={song.title} subtitle={[song.composer, `Doh is ${keyName}`, parsed.meta.time].filter(Boolean).join(' · ')} />
      {banner}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          viewHeight.current = e.nativeEvent.layout.height;
        }}
      >
        <View
          onLayout={(e) => {
            scoreTop.current = e.nativeEvent.layout.y;
          }}
        >
          <Score song={parsed} activeBeat={p.beat} silent={silent} onActiveLine={followLine} transpose={p.transpose} mine={group?.part ? p.mix.mine : null} />
        </View>

        <PartMixer parts={parsed.parts} mix={p.mix} onMute={p.toggleMute} onSolo={p.toggleSolo} onMine={p.setMine} />
        {parsed.parts.length > 1 ? (
          <ToggleRow label="Focus my part" hint="(others softer)" value={p.mix.focus} onChange={p.toggleFocus} />
        ) : null}
        <ToggleRow label="Loop the song" value={p.loop} onChange={p.toggleLoop} />

        {p.message ? <Text style={styles.message}>{p.message}</Text> : null}
        {parsed.parts.length > 1 ? <Text style={styles.hint}>Tap a part to mute it. “Mine” sets your part.</Text> : null}
        <SongActions songId={song.id} song={apiSong} />
      </ScrollView>

      <View style={[styles.transport, { paddingBottom: 10 + insets.bottom }]}>
        <View style={styles.transportSide}>
          <Stepper label="Tempo" value={p.tempo} onStep={p.changeTempo} lessLabel="Slower" moreLabel="Faster" />
        </View>
        <PlayButton playing={p.playing} onPress={p.togglePlay} />
        <View style={styles.transportSide}>
          <Stepper label="Key (doh)" value={keyName} onStep={p.changeKey} lessLabel="Lower key" moreLabel="Higher key" />
        </View>
      </View>
    </SafeAreaView>
  );
}

function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.topbar}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
        hitSlop={8}
      >
        <View style={styles.chevron} />
      </Pressable>
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const MAX_WIDTH = 560;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
  },
  back: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  chevron: {
    width: 10,
    height: 10,
    marginLeft: 3,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  titles: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 22, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 11, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  message: { fontFamily: fonts.bold, fontSize: 13, color: colors.redDeep, textAlign: 'center' },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center' },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  transportSide: { flex: 1, alignItems: 'center' },
});
