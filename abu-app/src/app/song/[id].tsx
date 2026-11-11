import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { partLevel } from '@/audio/engine';
import { useSongPlayer } from '@/audio/use-song-player';
import { PartMixer, PlayButton, Stepper, ToggleRow } from '@/components/player-controls';
import { Score } from '@/components/score';
import { DEMO_SONGS, type DemoSong } from '@/data/demo-songs';
import { KEY_NAMES, mod12, parseSolfa } from '@/solfa';
import { colors, fonts } from '@/theme/tokens';

/** Pre-render a page per demo song for the static web export. */
export function generateStaticParams(): { id: string }[] {
  return DEMO_SONGS.map((s) => ({ id: s.id }));
}

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = DEMO_SONGS.find((s) => s.id === id);
  if (!song) {
    return (
      <SafeAreaView style={styles.page}>
        <TopBar title="Song not found" subtitle="It may have been removed." />
      </SafeAreaView>
    );
  }
  return <Player key={song.id} song={song} />;
}

function Player({ song }: { song: DemoSong }) {
  const parsed = useMemo(() => parseSolfa(song.solfa, { time: song.time, key: song.key }), [song]);
  const p = useSongPlayer(parsed, song.key);
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
      <TopBar title={song.title} subtitle={`${song.composer} · Doh is ${keyName} · ${parsed.meta.time}`} />
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
          <Score song={parsed} activeBeat={p.beat} silent={silent} onActiveLine={followLine} />
        </View>

        <PartMixer parts={parsed.parts} mix={p.mix} onMute={p.toggleMute} onSolo={p.toggleSolo} onMine={p.setMine} />
        {parsed.parts.length > 1 ? (
          <ToggleRow label="Focus my part" hint="(others softer)" value={p.mix.focus} onChange={p.toggleFocus} />
        ) : null}
        <ToggleRow label="Loop the song" value={p.loop} onChange={p.toggleLoop} />

        {p.message ? <Text style={styles.message}>{p.message}</Text> : null}
        {parsed.parts.length > 1 ? <Text style={styles.hint}>Tap a letter to mute that part. “Mine” sets your part.</Text> : null}
        {p.timesPlayed > 0 ? (
          <Text style={styles.hint}>
            Practised {p.timesPlayed} {p.timesPlayed === 1 ? 'time' : 'times'}
          </Text>
        ) : null}
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
