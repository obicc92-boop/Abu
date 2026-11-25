/**
 * A song's cover (colleagues' request, 25 November 2026: songs with pictures, as on Audiomack, Spotify and Apple
 * Music): the picture its creator chose or the AI made (every song gets one: abu-api/src/auto-covers.ts), fading in
 * as it loads. Until it has one (or offline, before it has loaded), a plain cover: a deep gradient of the song's own
 * (src/lib/cover-look.ts) with its title, or its first letter when small. No lines of melody: the owner didn't like
 * that "wave cover" (25 November 2026). A cover that's playing has bars dancing in its corner.
 */
import { useState } from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { coverUrl } from '@/api/client';
import { coverLook } from '@/lib/cover-look';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { Equalizer } from './motion';

export interface CoverSong {
  id: string;
  title: string;
  /** The cover picture's key (covers/<song>/<picture>.jpg), if it has one. */
  cover?: string | null;
  /** Its sol-fa, when to hand, for the drawn cover's melodies. */
  solfa?: string | null;
}

/** The drawn cover's colour for a song, for glows. */
export const coverGlow = (id: string) => coverLook(id).to;

export function CoverArt({
  song,
  size,
  radius = Math.round(size * 0.12),
  title = size >= 120,
  playing,
  paused,
  style,
}: {
  song: CoverSong;
  size: number;
  radius?: number;
  /** Write the title on a drawn cover (by default when it's big enough to read). */
  title?: boolean;
  /** This song is playing (bars dance) or paused (bars still). */
  playing?: boolean;
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  const uri = coverUrl(song.cover);
  const [failed, setFailed] = useState<string | null>(null);
  const picture = !!uri && failed !== uri;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius }, styles.box, style]}>
      {/* Drawn underneath a picture too, so there's never a blank square while it loads. */}
      <DrawnCover song={song} size={size} title={title && !picture} />
      {picture ? <Picture uri={uri} onError={() => setFailed(uri)} /> : null}
      {playing || paused ? (
        <View style={[styles.playing, { left: size * 0.07, bottom: size * 0.07, padding: Math.max(4, size * 0.05), borderRadius: Math.max(6, size * 0.08) }]}>
          <Equalizer playing={!!playing} color={colors.onHero} height={Math.max(10, Math.min(18, size * 0.14))} />
        </View>
      ) : null}
    </View>
  );
}

function Picture({ uri, onError }: { uri: string; onError: () => void }) {
  const reduce = useReducedMotion();
  const a = useSharedValue(reduce ? 1 : 0);
  const shown = useAnimatedStyle(() => ({ opacity: a.get() }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, shown]}>
      <Image
        source={{ uri }}
        onLoad={() => a.set(withTiming(1, { duration: reduce ? 0 : 320 }))}
        onError={onError}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        style={{ width: '100%', height: '100%' }}
      />
    </Animated.View>
  );
}

/** The letter a small cover shows: the title's first, past "The", "A" and the like. */
function initialOf(title: string): string {
  const words = title.trim().split(/\s+/);
  const word = words.length > 1 && /^(the|a|an|o)$/i.test(words[0]) ? words[1] : (words[0] ?? '');
  return [...word.replace(/^[^\p{L}\p{N}]+/u, '')][0]?.toUpperCase() ?? '♪';
}

function DrawnCover({ song, size, title }: { song: CoverSong; size: number; title: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const look = coverLook(song.id);
  const id = song.id.replace(/[^a-zA-Z0-9]/g, '');
  return (
    <>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={`cf${id}`} x1="100" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={look.to} />
            <Stop offset="1" stopColor={look.from} />
          </LinearGradient>
          <RadialGradient id={`cg${id}`} cx="85" cy="10" r="75" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.onHero} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.onHero} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#cf${id})`} />
        <Rect width="100" height="100" fill={`url(#cg${id})`} />
      </Svg>
      {title ? (
        <Text style={[styles.title, { fontSize: Math.max(13, size * 0.11), lineHeight: Math.max(16, size * 0.13), left: size * 0.08, right: size * 0.08, bottom: size * 0.07 }]} numberOfLines={3}>
          {song.title}
        </Text>
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.46, lineHeight: size * 0.6 }]} accessibilityElementsHidden importantForAccessibility="no">
          {initialOf(song.title)}
        </Text>
      )}
    </>
  );
}

// Covers are dark in light and dark alike, as the feature cards are: their text is the feature cards' light text.
const useStyles = makeStyles((colors) => ({
  box: { overflow: 'hidden', backgroundColor: colors.hero, alignItems: 'center', justifyContent: 'center' },
  title: { position: 'absolute', fontFamily: fonts.display, color: colors.onHero, textShadowColor: `${colors.hero}80`, textShadowRadius: 6 },
  initial: { fontFamily: fonts.display, color: colors.onHero, opacity: 0.92, textAlign: 'center' },
  playing: { position: 'absolute', backgroundColor: `${colors.hero}B3` },
}));
