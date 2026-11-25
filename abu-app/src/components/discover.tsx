/**
 * Home's feed, laid out as music apps lay theirs out (colleagues' request, 25 November 2026, from Audiomack's
 * screens: "very animated and dynamic… like Audiomack, Spotify, Apple Music, and not just like any regular app"):
 * chips of the kinds of song along the top, cards that swipe across with dots under them, cards of songs four to a
 * card ("Back to your songs", "Find something new"), trending songs in ranked columns, collections in a grid of
 * stacked covers, and composers in circles. A glow at the top takes its colour from the card in front.
 *
 * Songs come from GET /api/home (only songs the viewer can see), sol-fa and all, so any of them plays from here at
 * once, offline too once Home has loaded.
 */
import { router } from 'expo-router';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { HomeFeed, HomeSong } from '@/api/client';
import { useNowPlaying } from '@/audio/now-playing';
import { parseSolfa } from '@/solfa';
import { makeStyles, useColors, useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { CoverArt } from './cover-art';
import { ChevronIcon } from './icons';
import { Equalizer, PressScale, Skeleton } from './motion';
import { MAX_WIDTH } from './ui';

/** The page's width, edge to edge (as wide as the screen, up to the page's widest), before anything is measured. */
function usePageWidth(): number {
  return Math.min(useWindowDimensions().width, MAX_WIDTH);
}

/* ---------- Playing a song straight from Home ---------- */

/** Whether a song is the one playing, and a tap that plays or pauses it. */
export function useQuickPlay() {
  const { play, song: now, player } = useNowPlaying();
  return {
    state(id: string): 'playing' | 'paused' | null {
      if (now?.id !== id) return null;
      return player.playing ? 'playing' : player.pausedAt !== null ? 'paused' : null;
    },
    toggle(s: HomeSong) {
      if (now?.id === s.id && player.playing) return player.pause();
      let parsed = null;
      try {
        const p = s.solfa.trim() ? parseSolfa(s.solfa, { time: s.time_signature, key: s.doh }) : null;
        parsed = p && p.total > 0 ? p : null;
      } catch {
        parsed = null;
      }
      // Nothing to play (a sheet only): its page shows the sheet.
      if (!parsed) return router.push({ pathname: '/song/[id]', params: { id: s.id } });
      play({ id: s.id, title: s.title, composer: s.composer, solfa: s.solfa, key: s.doh, parsed, countable: true, cover: s.cover_key });
    },
  };
}

const openSong = (id: string) => router.push({ pathname: '/song/[id]', params: { id } });

/* ---------- The glow at the top ---------- */

/**
 * A wash of colour behind the top of Home, fading down into the page, as Audiomack and Apple Music tint theirs from
 * what's in front. A new colour fades in over the old; it breathes slowly unless the phone asks for less motion.
 */
export function AmbientGlow({ colour }: { colour: string }) {
  const styles = useStyles();
  const [layers, setLayers] = useState([{ key: 0, colour }]);
  const top = layers[layers.length - 1];
  if (top.colour !== colour) setLayers([top, { key: top.key + 1, colour }]);
  // The old colour goes once the new one has faded in.
  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), 1000);
    return () => clearTimeout(t);
  }, [layers]);
  return (
    <View pointerEvents="none" style={styles.ambient}>
      {layers.map((l, i) => (
        <GlowLayer key={l.key} colour={l.colour} on={i === layers.length - 1} first={l.key === 0} />
      ))}
    </View>
  );
}

function GlowLayer({ colour, on, first }: { colour: string; on: boolean; first: boolean }) {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const a = useSharedValue(first || reduce ? 1 : 0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    a.set(withTiming(on ? 1 : 0, { duration: reduce ? 0 : 900, easing: Easing.inOut(Easing.quad) }));
  }, [a, on, reduce]);
  useEffect(() => {
    if (!reduce) breathe.set(withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [breathe, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: a.get(), transform: [{ scale: 1 + 0.08 * breathe.get() }, { translateX: 12 * breathe.get() }] }));
  // Softer on the white page than on the black one.
  const strength = scheme === 'light' ? 0.3 : 0.5;
  const id = `amb${colour.replace('#', '')}`;
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`${id}a`} cx="78" cy="0" r="80" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colour} stopOpacity={strength} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="10" cy="20" r="60" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colour} stopOpacity={strength * 0.55} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id}a)`} />
        <Rect width="100" height="100" fill={`url(#${id}b)`} />
      </Svg>
    </Animated.View>
  );
}

/* ---------- Chips of the kinds of song ---------- */

/** "All", then the tags on the songs, as Audiomack's genres; the chosen one in the main colour. */
export function GenreChips({ tags, value, onChange }: { tags: HomeFeed['tags']; value: string | null; onChange: (tag: string | null) => void }) {
  const styles = useStyles();
  const all = [null, ...tags.map((t) => t.tag)];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.edge} contentContainerStyle={styles.chips}>
      {all.map((t) => {
        const on = value === t;
        return (
          <PressScale
            key={t ?? 'all'}
            onPress={() => onChange(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.genre, on && styles.genreOn]}
          >
            <Text style={[styles.genreText, on && styles.genreTextOn]}>{t ?? 'All'}</Text>
          </PressScale>
        );
      })}
    </ScrollView>
  );
}

/* ---------- Cards that swipe across ---------- */

/**
 * Pages that swipe across, each a little narrower than the screen so the next one peeks in, snapping into place,
 * with dots under them. `auto`: moves on by itself every so many ms until it's touched.
 */
export function Carousel({ children, peek = 28, dots = true, auto, onIndex }: { children: ReactNode; peek?: number; dots?: boolean; auto?: number; onIndex?: (i: number) => void }) {
  const styles = useStyles();
  const reduce = useReducedMotion();
  const pages = Children.toArray(children).filter(Boolean);
  const [width, setWidth] = useState(usePageWidth());
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);
  const touched = useRef(false);
  const page = Math.max(0, width - 32 - (pages.length > 1 ? peek : 0));
  const step = page + GAP;

  const indexRef = useRef(0);
  const at = (i: number) => {
    indexRef.current = i;
    setIndex(i);
    onIndex?.(i);
  };
  useEffect(() => {
    if (!auto || reduce || pages.length < 2 || !step) return;
    const t = setInterval(() => {
      if (touched.current) return;
      const next = (indexRef.current + 1) % pages.length;
      ref.current?.scrollTo({ x: next * step, animated: true });
    }, auto);
    return () => clearInterval(t);
  }, [auto, reduce, pages.length, step]);

  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.edge, Platform.OS === 'web' ? ({ scrollPaddingLeft: 16 } as object) : null]}
        contentContainerStyle={styles.pages}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        // The web snaps with CSS; phones by the page's width.
        pagingEnabled={Platform.OS === 'web'}
        snapToInterval={Platform.OS === 'web' ? undefined : step}
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={32}
        onTouchStart={() => {
          touched.current = true;
        }}
        onScrollBeginDrag={() => {
          touched.current = true;
        }}
        onScroll={(e) => {
          if (!step) return;
          const i = Math.min(pages.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / step)));
          if (i !== indexRef.current) at(i);
        }}
      >
        {pages.map((p, i) => (
          <View key={i} style={{ width: page, flexGrow: 1 }}>
            {p}
          </View>
        ))}
      </ScrollView>
      {dots && pages.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`${index + 1} of ${pages.length}`}>
          {pages.map((_, i) => (
            <Dot key={i} on={i === index} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dot({ on }: { on: boolean }) {
  const styles = useStyles();
  const a = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    a.set(withTiming(on ? 1 : 0, { duration: 260 }));
  }, [a, on]);
  const style = useAnimatedStyle(() => ({ width: 7 + 13 * a.get(), opacity: 0.35 + 0.65 * a.get() }));
  return <Animated.View style={[styles.dot, on && styles.dotOn, style]} />;
}

/* ---------- Headings ---------- */

export function SectionHead({ title, note, onMore }: { title: string; note?: string; onMore?: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.head}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headTitle} numberOfLines={1}>
          {title}
        </Text>
        {note ? <Text style={styles.headNote}>{note}</Text> : null}
      </View>
      {onMore ? (
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={`See all: ${title}`} hitSlop={8} style={styles.more}>
          <ChevronIcon color={colors.ink} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------- A song as a row ---------- */

/** A song in a list: its cover, title and composer, and a play button (bars dancing while it plays). */
export function SongLine({ song, rank, note }: { song: HomeSong; rank?: number; note?: string }) {
  const styles = useStyles();
  const colors = useColors();
  const q = useQuickPlay();
  const state = q.state(song.id);
  return (
    <PressScale to={0.98} onPress={() => openSong(song.id)} accessibilityRole="link" accessibilityLabel={`${song.title}${song.composer ? `, ${song.composer}` : ''}`} style={styles.line}>
      {rank ? <Text style={[styles.rank, rank <= 3 && { color: colors.accent }]}>{rank}</Text> : null}
      <CoverArt song={{ id: song.id, title: song.title, cover: song.cover_key, solfa: song.solfa }} size={54} radius={10} playing={state === 'playing'} paused={state === 'paused'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.lineTitle, state && { color: colors.accent }]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.lineSub} numberOfLines={1}>
          {note ?? (song.composer || 'Composer not given')}
        </Text>
      </View>
      <Pressable
        onPress={() => q.toggle(song)}
        accessibilityRole="button"
        accessibilityLabel={state === 'playing' ? `Pause ${song.title}` : `Play ${song.title}`}
        hitSlop={8}
        style={[styles.linePlay, state === 'playing' && styles.linePlayOn]}
      >
        {state === 'playing' ? <Equalizer playing color={colors.onPrimary} height={13} /> : <View style={styles.lineTriangle} />}
      </Pressable>
    </PressScale>
  );
}

/* ---------- Cards of songs, four to a card ---------- */

export interface ListCard {
  title: string;
  songs: HomeSong[];
  onMore?: () => void;
}

/** Cards of up to four songs each that swipe across, as Audiomack's "Back to your favorites". */
export function ListCards({ cards }: { cards: ListCard[] }) {
  const styles = useStyles();
  const colors = useColors();
  const shown = cards.filter((c) => c.songs.length);
  if (!shown.length) return null;
  return (
    <Carousel peek={30}>
      {shown.map((c) => (
        <View key={c.title} style={styles.listCard}>
          <Pressable onPress={c.onMore} disabled={!c.onMore} accessibilityRole={c.onMore ? 'button' : undefined} style={styles.listHead}>
            <Text style={styles.listTitle} numberOfLines={1}>
              {c.title}
            </Text>
            {c.onMore ? <ChevronIcon color={colors.muted} size={18} /> : null}
          </Pressable>
          {c.songs.slice(0, 4).map((s) => (
            <SongLine key={s.id} song={s} />
          ))}
        </View>
      ))}
    </Carousel>
  );
}

/* ---------- Trending, ranked ---------- */

/** Songs ranked, in columns of four that swipe across, as Audiomack's trending songs. */
export function RankedColumns({ songs, plays }: { songs: HomeSong[]; plays?: boolean }) {
  const columns: HomeSong[][] = [];
  for (let i = 0; i < songs.length; i += 4) columns.push(songs.slice(i, i + 4));
  return (
    <Carousel peek={44} dots={false}>
      {columns.map((col, c) => (
        <View key={c} style={{ gap: 2 }}>
          {col.map((s, i) => (
            <SongLine key={s.id} song={s} rank={c * 4 + i + 1} note={plays && s.plays ? `${s.composer ? `${s.composer} · ` : ''}${s.plays} ${s.plays === 1 ? 'play' : 'plays'} lately` : undefined} />
          ))}
        </View>
      ))}
    </Carousel>
  );
}

/* ---------- Collections ---------- */

/** Two to a row, with room between: each one's width in a row `width` wide. */
const half = (width: number) => Math.floor((width - 14) / 2);

/** Collections (a tag's songs) as stacked covers, two to a row, as Audiomack's playlists. */
export function CollectionGrid({ items, onOpen }: { items: HomeFeed['collections']; onOpen: (tag: string) => void }) {
  const styles = useStyles();
  const [width, setWidth] = useState(usePageWidth() - 32);
  const size = half(width);
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {size > 0
        ? items.map((c) => (
            <PressScale key={c.tag} onPress={() => onOpen(c.tag)} accessibilityRole="link" accessibilityLabel={`${c.tag}, ${c.songs} songs`} style={{ width: size }}>
              <Stacked size={size}>
                <Collage covers={c.covers} size={size} />
                <Banner text={c.tag} size={size} />
              </Stacked>
              <Text style={styles.gridTitle} numberOfLines={1}>
                {c.tag}
              </Text>
              <Text style={styles.gridSub} numberOfLines={1}>
                {c.songs} songs
              </Text>
            </PressScale>
          ))
        : null}
    </View>
  );
}

/** A cover with the edges of two more behind it, as a stack of records. */
function Stacked({ size, children }: { size: number; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={{ paddingTop: 10 }}>
      <View style={[styles.stack2, { left: size * 0.12, right: size * 0.12 }]} />
      <View style={[styles.stack1, { left: size * 0.06, right: size * 0.06 }]} />
      <View style={{ width: size, height: size, borderRadius: 14, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/** Four songs' covers in a square, or one when there are fewer. */
function Collage({ covers, size }: { covers: HomeFeed['collections'][number]['covers']; size: number }) {
  if (covers.length < 4) {
    const c = covers[0];
    return c ? <CoverArt song={{ id: c.id, title: c.title, cover: c.cover_key }} size={size} radius={0} title={false} /> : null;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: size, height: size }}>
      {covers.slice(0, 4).map((c) => (
        <CoverArt key={c.id} song={{ id: c.id, title: c.title, cover: c.cover_key }} size={size / 2} radius={0} title={false} />
      ))}
    </View>
  );
}

/** The collection's name across the foot of its cover, over a shade, as an editorial playlist's cover has it. */
function Banner({ text, size }: { text: string; size: number }) {
  const styles = useStyles();
  const colors = useColors();
  const id = `bn${text.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.banner, { height: size * 0.5 }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="10" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.hero} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.hero} stopOpacity={0.88} />
          </LinearGradient>
        </Defs>
        <Rect width="10" height="10" fill={`url(#${id})`} />
      </Svg>
      <Text style={[styles.bannerText, { fontSize: Math.max(15, size * 0.12) }]} numberOfLines={2}>
        {text.toUpperCase()}
      </Text>
    </View>
  );
}

/* ---------- Newest, as a grid ---------- */

/** Songs as big covers, two to a row, the title and composer centred under each (Audiomack's trending albums). */
export function CoverGrid({ songs }: { songs: HomeSong[] }) {
  const styles = useStyles();
  const q = useQuickPlay();
  const [width, setWidth] = useState(usePageWidth() - 32);
  const size = half(width);
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {size > 0
        ? songs.map((s) => {
            const state = q.state(s.id);
            return (
              <PressScale key={s.id} onPress={() => openSong(s.id)} accessibilityRole="link" accessibilityLabel={s.title} style={{ width: size }}>
                <Stacked size={size}>
                  <CoverArt song={{ id: s.id, title: s.title, cover: s.cover_key, solfa: s.solfa }} size={size} radius={0} playing={state === 'playing'} paused={state === 'paused'} />
                </Stacked>
                <Text style={[styles.gridTitle, { textAlign: 'center' }]} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={[styles.gridSub, { textAlign: 'center' }]} numberOfLines={1}>
                  {s.composer || ' '}
                </Text>
              </PressScale>
            );
          })
        : null}
    </View>
  );
}

/* ---------- Composers ---------- */

/** Composers in circles that scroll across (Audiomack's "Accounts for you"), each opening their songs. */
export function ComposerRow({ items, onOpen }: { items: HomeFeed['composers']; onOpen: (name: string) => void }) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.edge} contentContainerStyle={styles.composers}>
      {items.map((c) => (
        <PressScale key={c.name} onPress={() => onOpen(c.name)} accessibilityRole="link" accessibilityLabel={`${c.name}, ${c.songs} ${c.songs === 1 ? 'song' : 'songs'}`} style={styles.composer}>
          <CoverArt song={{ id: c.cover.id, title: c.cover.title, cover: c.cover.cover_key }} size={96} radius={48} title={false} />
          <Text style={styles.composerName} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={styles.gridSub} numberOfLines={1}>
            {c.songs} {c.songs === 1 ? 'song' : 'songs'}
          </Text>
          <View style={styles.listen}>
            <Text style={styles.listenText}>Songs</Text>
          </View>
        </PressScale>
      ))}
    </ScrollView>
  );
}

/* ---------- While it loads ---------- */

export function FeedSkeleton() {
  const styles = useStyles();
  return (
    <View style={{ gap: 18 }}>
      <Skeleton style={{ height: 190, borderRadius: 22 }} />
      <View style={styles.skelRow}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ width: 150, height: 150, borderRadius: 18 }} />
        ))}
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skelLine}>
          <Skeleton style={{ width: 54, height: 54, borderRadius: 10 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton style={{ height: 13, width: '70%', borderRadius: 6 }} />
            <Skeleton style={{ height: 11, width: '45%', borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const GAP = 12;

const useStyles = makeStyles((colors) => ({
  ambient: { position: 'absolute', top: -16, left: -16, right: -16, height: 460 },
  // Rows that run to the screen's edges.
  edge: { marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  genre: { paddingHorizontal: 18, minHeight: 38, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.glass },
  genreOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  genreText: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  genreTextOn: { color: colors.onPrimary },
  pages: { gap: GAP, paddingHorizontal: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { height: 7, borderRadius: 4, backgroundColor: colors.barline },
  dotOn: { backgroundColor: colors.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  headTitle: { fontFamily: fonts.heavy, fontSize: 21, color: colors.ink, letterSpacing: -0.2 },
  headNote: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
  more: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rank: { width: 20, fontFamily: fonts.heavy, fontSize: 16, color: colors.muted, textAlign: 'center' },
  lineTitle: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
  lineSub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, marginTop: 1 },
  linePlay: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  linePlayOn: { backgroundColor: colors.primary },
  lineTriangle: {
    marginLeft: 3,
    width: 0,
    height: 0,
    borderTopWidth: 6.5,
    borderBottomWidth: 6.5,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.ink,
  },
  listCard: { flex: 1, backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 4 },
  listTitle: { flex: 1, fontFamily: fonts.heavy, fontSize: 17, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 18 },
  stack1: { position: 'absolute', top: 5, height: 12, borderRadius: 8, backgroundColor: colors.barline, opacity: 0.8 },
  stack2: { position: 'absolute', top: 0, height: 12, borderRadius: 8, backgroundColor: colors.barline, opacity: 0.45 },
  banner: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 10 },
  bannerText: { fontFamily: fonts.heavy, color: colors.onHero, letterSpacing: 0.6 },
  gridTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, marginTop: 8 },
  gridSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
  composers: { gap: 16, paddingHorizontal: 16 },
  composer: { width: 108, alignItems: 'center' },
  composerName: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink, marginTop: 8, textAlign: 'center' },
  listen: { marginTop: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 18, paddingVertical: 5 },
  listenText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink, letterSpacing: 0.3 },
  skelRow: { flexDirection: 'row', gap: 14, overflow: 'hidden' },
  skelLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
}));
