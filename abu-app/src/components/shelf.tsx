/**
 * Shelves of song tiles, as on Suno's Discover (owner's request, 21 November 2026, from Suno's screens): a heading
 * with a "See all" pill, and big square tiles side by side that scroll across. Each tile shows a bar of the song
 * itself, as on a sol-fa sheet (owner's request the same day): a row for each part in its colour, the words under
 * them. Resting, it's the first whole bar; playing, the tile follows the music bar by bar, the beat being sung lit
 * up and each new bar sliding in (src/lib/tile-bars.ts). A song with no sol-fa to hand shows its cover. The tile's play button starts the song at once (the app's player,
 * src/audio/now-playing.tsx).
 *
 * A song with a cover picture (colleagues' request, 25 November 2026: a Home like Audiomack's) shows its picture
 * instead while it rests; playing or paused, the bar being sung shows over the picture, darkened.
 */
import { Link } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useNowPlaying } from '@/audio/now-playing';
import { CoverArt } from '@/components/cover-art';
import { PressScale } from '@/components/motion';
import { barAt, restingBar, tileBars, type TileBar } from '@/lib/tile-bars';
import { displayBeat } from '@/score/layout';
import { KEY_NAMES, parseSolfa, type ParsedSong } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor, partInk } from '@/theme/tokens';

export interface TileSong {
  id: string;
  title: string;
  /** Under the title: the composer, or how far along you are. */
  sub?: string;
  composer?: string;
  /** The sol-fa, when to hand: the tile shows its bars, and can play. */
  solfa?: string;
  doh: number;
  time: string;
  /** In the library (not only built in): plays are counted. */
  countable?: boolean;
  /** Its cover picture's key, if it has one. */
  cover?: string | null;
  /** It has sol-fa, though not to hand here (so it isn't "Sheet only"). */
  playable?: boolean;
}

export function Shelf({ title, note, onSeeAll, children }: { title: string; note?: string; onSeeAll?: () => void; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.shelf}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`See all: ${title}`} style={styles.seeAll} hitSlop={6}>
            <Text style={styles.seeAllText}>See all ›</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
        {children}
      </ScrollView>
    </View>
  );
}

/** The song read for its tile, or null (no sol-fa, or none that reads). */
function readSong(solfa: string | undefined, time: string, doh: number): ParsedSong | null {
  if (!solfa?.trim()) return null;
  try {
    const parsed = parseSolfa(solfa, { time, key: doh });
    return parsed.total > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function SongTile({ song, badge }: { song: TileSong; badge?: 'known' }) {
  const styles = useStyles();
  const colors = useColors();
  const { play, song: playing, player } = useNowPlaying();
  const parsed = useMemo(() => readSong(song.solfa, song.time, song.doh), [song.solfa, song.time, song.doh]);
  const bars = useMemo(() => (parsed ? tileBars(parsed) : []), [parsed]);

  const mine = playing?.id === song.id;
  const isPlaying = mine && player.playing;
  const paused = mine && !player.playing && player.pausedAt !== null;
  // Playing or paused here: the bar the music is at; otherwise the song's first whole bar.
  const following = (isPlaying || paused) && player.beat >= 0;
  const bar = following ? barAt(bars, player.beat) : parsed ? restingBar(bars, parsed.beatsPerBar) : null;
  const label = !parsed
    ? song.playable
      ? `Doh is ${KEY_NAMES[song.doh] ?? '?'} · ${song.time}`
      : 'Sheet only'
    : following && bar
      ? isPlaying
        ? `Bar ${bar.number} of ${parsed.bars}`
        : `Paused · bar ${bar.number}`
      : `Doh is ${parsed.meta.key?.name ?? '?'} · ${parsed.meta.time}`;

  const start = () => {
    if (!song.solfa || !parsed) return;
    if (isPlaying) return player.pause();
    play({ id: song.id, title: song.title, composer: song.composer, solfa: song.solfa, key: song.doh, parsed, countable: !!song.countable, cover: song.cover ?? null });
  };
  // With a cover, the picture shows while the song rests; the bars show over it while it plays or is paused.
  // With no sol-fa to hand there's no bar to show: its cover (a plain one until it has a picture) instead.
  const pictured = !!song.cover || !parsed;
  const showBar = !pictured || following;
  const glow = `g${song.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={styles.tile}>
      <Link href={{ pathname: '/song/[id]', params: { id: song.id } }} asChild>
        <PressScale accessibilityRole="link" accessibilityLabel={song.sub ? `${song.title}, ${song.sub}` : song.title} style={styles.art}>
          {pictured ? (
            <>
              <CoverArt song={{ id: song.id, title: song.title, cover: song.cover, solfa: song.solfa }} size={TILE} radius={0} style={styles.fill} />
              {following ? <View style={[styles.fill, styles.dim]} /> : null}
            </>
          ) : (
          <View style={styles.fill}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <Defs>
                <RadialGradient id={glow} cx="85" cy="5" r="90" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={colors.heroGlow} stopOpacity={0.35} />
                  <Stop offset="1" stopColor={colors.heroGlow} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width="100" height="100" fill={colors.hero} />
              <Rect width="100" height="100" fill={`url(#${glow})`} />
            </Svg>
          </View>
          )}
          {showBar ? (
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
          {showBar && bar ? <BarView bar={bar} active={isPlaying ? player.beat - bar.start : null} /> : null}
        </PressScale>
      </Link>
      {badge === 'known' ? (
        <View style={styles.known} accessibilityLabel="You know your part">
          <Text style={styles.knownText}>✓</Text>
        </View>
      ) : null}
      {parsed ? (
        <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`} style={styles.play} hitSlop={6}>
          {isPlaying ? (
            <View style={styles.pause}>
              <View style={styles.pauseBar} />
              <View style={styles.pauseBar} />
            </View>
          ) : (
            <View style={styles.triangle} />
          )}
        </Pressable>
      ) : null}
      <Text style={styles.name} numberOfLines={2}>
        {song.title}
      </Text>
      {song.sub ? (
        <Text style={styles.sub} numberOfLines={1}>
          {song.sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Mono characters across the art, for the beats and the colons between them. */
const ROOM = 108;

/**
 * One bar as a sol-fa sheet prints it, small: a row for each part in its colour, beats lined up in columns, the
 * words under them. `active`: the beat being sung (its column lit up).
 */
function BarView({ bar, active }: { bar: TileBar; active: number | null }) {
  const styles = useStyles();
  const colors = useColors();
  const reduce = useReducedMotion();
  const rows = bar.rows.map((r) => ({ part: r.part, beats: r.beats.map(displayBeat) }));
  const n = Math.max(1, ...rows.map((r) => r.beats.length));
  // Each column as wide as its widest beat; the whole bar fitted across the tile.
  const widths = Array.from({ length: n }, (_, j) => Math.max(1, ...rows.map((r) => [...(r.beats[j] ?? '')].length)));
  const chars = widths.reduce((a, b) => a + b, 0) + (n - 1) * 1.1;
  const size = Math.max(9, Math.min(15, ROOM / (chars * 0.6)));
  const ch = size * 0.6;

  // A new bar slides in from the right as the music reaches it.
  const a = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    a.set(0);
    a.set(withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [a, bar.number, reduce]);
  const slide = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * a.get(), transform: [{ translateX: 14 * (1 - a.get()) }] }));

  return (
    <Animated.View style={[styles.bar, slide]}>
      {rows.map((r) => (
        <View key={r.part} style={styles.barRow}>
          <View style={[styles.tick, { backgroundColor: partColor(r.part) }]} />
          {widths.map((w, j) => {
            const text = r.beats[j] ?? '';
            const faint = !text || text === '–';
            return (
              <Fragment key={j}>
                {j ? <Text style={[styles.colon, { fontSize: size, lineHeight: size * 1.3, width: ch * 1.1 }]}>:</Text> : null}
                <Text
                  style={[
                    styles.beat,
                    { fontSize: size, lineHeight: size * 1.3, width: ch * w + 4, color: faint ? colors.onHeroSoft : partInk(r.part, true) },
                    faint && styles.faint,
                    active === j && { backgroundColor: `${colors.onHero}30` },
                  ]}
                >
                  {text}
                </Text>
              </Fragment>
            );
          })}
        </View>
      ))}
      {bar.words ? (
        <Text style={styles.words} numberOfLines={1}>
          {bar.words}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const TILE = 156;
const PLAY = 34;

const useStyles = makeStyles((colors) => ({
  shelf: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.heavy, fontSize: 20, color: colors.ink },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
  seeAll: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 7 },
  seeAllText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
  // The tiles run to the screen's edges, as on Suno.
  scroller: { marginHorizontal: -16 },
  row: { gap: 14, paddingHorizontal: 16 },
  tile: { width: TILE, gap: 6 },
  art: { width: TILE, height: TILE, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.hero, paddingTop: 12, paddingHorizontal: 11, paddingBottom: 10 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dim: { backgroundColor: `${colors.hero}C7` },
  // Clear of the play button in the corner.
  label: { fontFamily: fonts.heavy, fontSize: 10.5, letterSpacing: 0.3, color: colors.heroKicker, paddingRight: PLAY + 4, minHeight: PLAY - 6 },
  bar: { flex: 1, justifyContent: 'center', gap: 3 },
  barRow: { flexDirection: 'row', alignItems: 'center' },
  tick: { width: 3, alignSelf: 'stretch', borderRadius: 1.5, marginRight: 5 },
  beat: { fontFamily: fonts.monoBold, textAlign: 'center', borderRadius: 4, overflow: 'hidden' },
  faint: { opacity: 0.55 },
  colon: { fontFamily: fonts.mono, textAlign: 'center', color: colors.onHeroSoft, opacity: 0.5 },
  words: { fontFamily: fonts.bold, fontSize: 11, color: colors.onHeroSoft, marginTop: 3, paddingLeft: 8, paddingRight: 22 },
  known: { position: 'absolute', top: TILE - 30, right: 9, width: 21, height: 21, borderRadius: 10.5, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  knownText: { fontFamily: fonts.heavy, fontSize: 12, color: colors.hero },
  play: { position: 'absolute', top: 8, right: 8, width: PLAY, height: PLAY, borderRadius: PLAY / 2, backgroundColor: colors.onHero, opacity: 0.94, alignItems: 'center', justifyContent: 'center' },
  triangle: {
    marginLeft: 3,
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.hero,
  },
  pause: { flexDirection: 'row', gap: 3.5 },
  pauseBar: { width: 3.5, height: 13, borderRadius: 1.5, backgroundColor: colors.hero },
  name: { fontFamily: fonts.bold, fontSize: 14.5, lineHeight: 19, color: colors.ink, marginTop: 2 },
  sub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, marginTop: -3 },
}));
