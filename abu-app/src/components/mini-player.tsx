/**
 * The song playing, in a bar over the tabs, as on Suno (owner's request, 21 November 2026): its parts' colours,
 * its name and the bar it's on, play or pause (carrying on where it was), and how far it has got. Tapping it opens
 * the song; while it's paused, × puts it away. Shown once a song has been played (src/audio/now-playing.tsx).
 */
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useNowPlaying } from '@/audio/now-playing';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

import { CloseIcon } from './icons';

export function MiniPlayer() {
  const styles = useStyles();
  const colors = useColors();
  const { song, player, close } = useNowPlaying();
  // Only a song that has been played: opening a song's page to look at it doesn't bring the bar up.
  if (!song || !player.played) return null;
  const { parsed } = song;
  const started = player.beat >= 0;
  const bar = started ? Math.min(parsed.bars, Math.floor(player.beat / Math.max(1, parsed.beatsPerBar)) + 1) : 0;
  const progress = started && parsed.total ? Math.min(1, (player.beat + 1) / parsed.total) : 0;
  const parts = parsed.parts.slice(0, 4);
  // Playing a stretch of the song (a bar, or a loop, chosen on its score): says so, briefly.
  const line = player.playing
    ? player.range
      ? `Bar ${bar}${player.range.loop ? ', looping' : ''}`
      : `Bar ${bar} of ${parsed.bars}`
    : player.pausedAt !== null
      ? `Paused at bar ${bar}`
      : song.composer || 'Tap play to hear it again';

  return (
    <View style={styles.box}>
      <Pressable onPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })} accessibilityRole="button" accessibilityLabel={`Open ${song.title}`} style={styles.body}>
        {/* The parts' colours, rising and falling with the beat while it plays. */}
        <View style={styles.art}>
          {parts.map((p, i) => (
            <View key={p} style={[styles.level, { backgroundColor: partColor(p), height: player.playing ? 8 + ((player.beat + i * 2) % 4) * 5 : 10 + (i % 2) * 6 }]} />
          ))}
        </View>
        <View style={styles.words}>
          <Text style={styles.title} numberOfLines={1}>
            {song.title}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {line}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={player.playing ? player.pause : player.togglePlay} accessibilityRole="button" accessibilityLabel={player.playing ? 'Pause' : 'Play'} style={styles.play} hitSlop={6}>
        {player.playing ? (
          <View style={styles.pause}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        ) : (
          <View style={styles.triangle} />
        )}
      </Pressable>
      {!player.playing ? (
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close the player" style={styles.close} hitSlop={8}>
          <CloseIcon color={colors.muted} size={14} />
        </Pressable>
      ) : null}
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingLeft: 8,
    paddingRight: 10,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  art: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.board, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, paddingBottom: 9 },
  level: { width: 4, borderRadius: 2 },
  words: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  line: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  triangle: {
    marginLeft: 3,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.onInk,
  },
  pause: { flexDirection: 'row', gap: 4 },
  pauseBar: { width: 4, height: 15, borderRadius: 1.5, backgroundColor: colors.onInk },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: colors.line },
  fill: { height: 2.5, backgroundColor: colors.primary },
}));
