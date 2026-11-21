/**
 * Shelves of song tiles, as on Suno's Discover (owner's request, 21 November 2026, from Suno's screens): a heading
 * with a "See all" pill, and big square tiles side by side that scroll across. Each tile's art is drawn from the
 * song's own parts (src/lib/song-art.ts) on a dark card, like an album cover in light and dark alike; its play
 * button starts the song at once (the app's player, src/audio/now-playing.tsx).
 */
import { Link } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Defs, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useNowPlaying } from '@/audio/now-playing';
import { songArt } from '@/lib/song-art';
import { parseSolfa } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partInk } from '@/theme/tokens';

export interface TileSong {
  id: string;
  title: string;
  /** Under the title: the composer, or how far along you are. */
  sub?: string;
  composer?: string;
  /** The sol-fa, when to hand: the art is drawn from it, and the tile can play. */
  solfa?: string;
  doh: number;
  time: string;
  /** In the library (not only built in): plays are counted. */
  countable?: boolean;
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

export function SongTile({ song, badge }: { song: TileSong; badge?: 'known' }) {
  const styles = useStyles();
  const colors = useColors();
  const { play, song: playing, player } = useNowPlaying();
  const art = useMemo(() => songArt(song.solfa, song.id), [song.solfa, song.id]);
  const canPlay = !!song.solfa?.trim();
  const isPlaying = playing?.id === song.id && player.playing;
  const start = () => {
    if (!song.solfa) return;
    if (isPlaying) return player.pause();
    const parsed = parseSolfa(song.solfa, { time: song.time, key: song.doh });
    play({ id: song.id, title: song.title, composer: song.composer, solfa: song.solfa, key: song.doh, parsed, countable: !!song.countable });
  };
  return (
    <View style={styles.tile}>
      <Link href={{ pathname: '/song/[id]', params: { id: song.id } }} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={song.sub ? `${song.title}, ${song.sub}` : song.title} style={styles.art}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id={`g${song.id.replace(/[^a-zA-Z0-9]/g, '')}`} cx="85" cy="5" r="90" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={colors.heroGlow} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.heroGlow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width="100" height="100" fill={colors.hero} />
            <Rect width="100" height="100" fill={`url(#g${song.id.replace(/[^a-zA-Z0-9]/g, '')})`} />
            {art.map((l) => (
              <Polyline key={l.part} points={l.points} fill="none" stroke={partInk(l.part, true)} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        </Pressable>
      </Link>
      {badge === 'known' ? (
        <View style={styles.known} accessibilityLabel="You know your part">
          <Text style={styles.knownText}>✓</Text>
        </View>
      ) : null}
      {canPlay ? (
        <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`} style={styles.play} hitSlop={4}>
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

const TILE = 156;

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
  art: { width: TILE, height: TILE, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.hero },
  known: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  knownText: { fontFamily: fonts.heavy, fontSize: 14, color: colors.hero },
  play: { position: 'absolute', top: TILE - 52, right: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.onHero, opacity: 0.92, alignItems: 'center', justifyContent: 'center' },
  triangle: {
    marginLeft: 3,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.hero,
  },
  pause: { flexDirection: 'row', gap: 4 },
  pauseBar: { width: 4, height: 15, borderRadius: 1.5, backgroundColor: colors.hero },
  name: { fontFamily: fonts.bold, fontSize: 14.5, lineHeight: 19, color: colors.ink, marginTop: 2 },
  sub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, marginTop: -3 },
}));
