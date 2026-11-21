/**
 * The opening animation, on the welcome screen's night (owner's request, 21
 * November 2026): near-black with an orange glow from the top right and a pink
 * one from below, and faint sol-fa colons (`BrandNight`). Its first frame
 * matches the still splash screen (the night, the s:s mark in the middle), so
 * the hand-over is seamless: on a phone the glows come in over the first
 * moments; on the web they're there from the first paint.
 * Then the mark bounces, a glow and sound rings spread from it, the sol-fa
 * scale (d r m f s l t d', each syllable in its own soft colour) bursts out
 * of it and pops up all over the screen, "SolfaScores" rises in, and
 * everything fades into the app. About two seconds; a tap skips it, and
 * phones set to reduce motion get a plain fade.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { BrandMark, BrandNight, MARK_ASPECT } from '@/components/brand';
import { brand as colors, fonts } from '@/theme/tokens';

import { splashParticles, type Burst, type Pop } from './particles';

/** Mark width on screen: the same as `imageWidth` for expo-splash-screen in app.json. */
export const MARK_WIDTH = 140;
const MARK_HEIGHT = MARK_WIDTH * MARK_ASPECT;
const TOTAL_MS = 2200;
const EXIT_MS = 380;
const REDUCED_TOTAL_MS = 700;
const SKIP_MS = 240;

const SESSION_KEY = 'abu.splash.shown';

/** On the web, play once per visit rather than on every page load. */
function seenThisVisit(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return true;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Storage blocked: just play it.
  }
  return false;
}

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const span = Math.max(width, height) || 800;
  const [{ bursts, pops }] = useState(() => splashParticles());
  const exit = useSharedValue(0);
  const finished = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      onDone();
    };
    if (seenThisVisit()) {
      finish();
      return;
    }
    const total = reduceMotion ? REDUCED_TOTAL_MS : TOTAL_MS;
    exit.set(withDelay(total - EXIT_MS, withTiming(1, { duration: EXIT_MS, easing: Easing.in(Easing.quad) })));
    const timer = setTimeout(finish, total + 20);
    return () => clearTimeout(timer);
  }, [exit, onDone, reduceMotion]);

  const skip = () => {
    if (finished.current) return;
    exit.set(withTiming(1, { duration: SKIP_MS }));
    setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      onDone();
    }, SKIP_MS + 20);
  };

  const rootStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    transform: [{ scale: 1 + 0.05 * exit.value }],
  }));

  return (
    <Animated.View style={[styles.root, rootStyle]}>
      <Sky />
      <Pressable style={styles.fill} onPress={skip} accessibilityRole="button" accessibilityLabel="SolfaScores. Tap to skip">
        {reduceMotion ? null : (
          <>
            <Glow />
            <Ring delay={140} />
            <Ring delay={460} />
            {pops.map((p, i) => (
              <PopUp key={`p${i}`} pop={p} />
            ))}
            {bursts.map((b, i) => (
              <BurstGlyph key={`b${i}`} burst={b} span={span} />
            ))}
          </>
        )}
        <Mark animate={!reduceMotion} />
        {reduceMotion ? null : <Wordmark />}
      </Pressable>
    </Animated.View>
  );
}

/* ---------- Pieces ---------- */

/**
 * The night's glows and colons. A phone's still splash can only be one colour (the night), so there they come in
 * over the first moments; the web's first paint already has them.
 */
function Sky() {
  const a = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  useEffect(() => {
    if (Platform.OS !== 'web') a.set(withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }));
  }, [a]);
  const style = useAnimatedStyle(() => ({ opacity: a.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <BrandNight focus={{ x: 0.5, y: 0.5 }} />
    </Animated.View>
  );
}

function Mark({ animate }: { animate: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (!animate) return;
    s.set(
      withDelay(
        60,
        withSequence(
          withTiming(1.14, { duration: 200, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
        ),
      ),
    );
  }, [animate, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.centred, { width: MARK_WIDTH, height: MARK_HEIGHT, marginLeft: -MARK_WIDTH / 2, marginTop: -MARK_HEIGHT / 2 }, style]}>
      <BrandMark size={MARK_WIDTH} />
    </Animated.View>
  );
}

const GLOW = 340;

/** A soft light behind the mark that swells, then settles. */
function Glow() {
  const g = useSharedValue(0);
  useEffect(() => {
    g.set(withDelay(80, withSequence(withTiming(1, { duration: 380 }), withTiming(0.55, { duration: 700 }))));
  }, [g]);
  const style = useAnimatedStyle(() => ({ opacity: g.value, transform: [{ scale: 0.7 + 0.4 * g.value }] }));
  return (
    <Animated.View style={[styles.centred, { width: GLOW, height: GLOW, marginLeft: -GLOW / 2, marginTop: -GLOW / 2 }, style]}>
      <Svg width={GLOW} height={GLOW}>
        <Defs>
          <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.nightGlow} stopOpacity={0.5} />
            <Stop offset="0.45" stopColor={colors.nightGlow2} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colors.night} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#splashGlow)" />
      </Svg>
    </Animated.View>
  );
}

const RING = 150;

/** A sound ring rippling out from the mark, like the motif's rings. */
function Ring({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: 1150, easing: Easing.out(Easing.cubic) })));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.06 ? p.value * 9 : 0.55 * (1 - p.value),
    transform: [{ scale: 0.5 + 3.2 * p.value }],
  }));
  return <Animated.View style={[styles.centred, styles.ring, style]} />;
}

function BurstGlyph({ burst, span }: { burst: Burst; span: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(burst.delay, withTiming(1, { duration: burst.duration, easing: Easing.out(Easing.cubic) })));
  }, [burst, p]);
  const { angle, distance, arc, spin, size } = burst;
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const opacity = t < 0.1 ? t * 10 : t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1;
    return {
      opacity,
      transform: [
        { translateX: Math.cos(angle) * distance * span * t },
        { translateY: Math.sin(angle) * distance * span * t - Math.sin(t * Math.PI) * arc * span },
        { rotate: `${spin * t}deg` },
        { scale: 0.4 + 0.8 * t },
      ],
    };
  });
  return (
    <Animated.View style={[styles.centred, styles.glyph, { width: size * 2, height: size * 1.4, marginLeft: -size, marginTop: -size * 0.7 }, style]}>
      <Syllable text={burst.text} size={size} color={burst.color} />
    </Animated.View>
  );
}

/** A syllable that pops up where it is, with a little bounce, drifts up and fades. */
function PopUp({ pop }: { pop: Pop }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(pop.delay, withTiming(1, { duration: pop.duration, easing: Easing.linear })));
  }, [pop, t]);
  const { x, y, size, tilt, drift, text, color } = pop;
  const style = useAnimatedStyle(() => {
    const k = t.value;
    const opacity = k < 0.18 ? k / 0.18 : k > 0.62 ? Math.max(0, (1 - k) / 0.38) : 1;
    // Grows past full size, then settles: a pop.
    const scale = k < 0.3 ? 0.3 + (0.85 * k) / 0.3 : 1.15 - 0.15 * Math.min(1, (k - 0.3) / 0.25);
    return { opacity, transform: [{ translateY: -drift * k }, { rotate: `${tilt}deg` }, { scale }] };
  });
  return (
    <Animated.View
      style={[
        styles.pop,
        { left: `${x * 100}%`, top: `${y * 100}%`, width: size * 2, height: size * 1.4, marginLeft: -size, marginTop: -size * 0.7 },
        style,
      ]}
    >
      <Syllable text={text} size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Lah, drawn: Marcellus's "l" is a plain stroke that reads like a bar line as it
 * flies past, so this one keeps the font's flared top and weight but ends in a
 * small curl at the foot. In the font's own units (2048 to the em), with the
 * top of the l at 0 and its baseline at 1495.
 */
const LAH = 'M160 1165L160 391Q160 306 158 242Q155 179 152 133Q148 87 143 56Q137 25 131 4L131 0L362 0L362 4Q356 25 351 56Q346 87 342 133Q338 179 336 242Q334 306 334 391L334 1165C334 1335 380 1405 445 1405C500 1405 548 1377 590 1327L632 1361C580 1455 505 1513 415 1513C255 1513 160 1395 160 1165Z';

/** One syllable of the scale in Marcellus, with lah drawn so it reads clearly. */
function Syllable({ text, size, color }: { text: string; size: number; color: string }) {
  if (text === 'l') {
    return (
      <Svg width={(size * 560) / 2048} height={(size * 1525) / 2048} viewBox="100 -5 560 1525">
        <Path d={LAH} fill={color} />
      </Svg>
    );
  }
  return <Text style={[styles.syllable, { fontSize: size, lineHeight: size * 1.3, color }]}>{text}</Text>;
}

function Wordmark() {
  const a = useSharedValue(0);
  useEffect(() => {
    a.set(withDelay(650, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) })));
  }, [a]);
  const style = useAnimatedStyle(() => ({ opacity: a.value, transform: [{ translateY: 14 * (1 - a.value) }] }));
  return (
    <Animated.View style={[styles.wordmarkBox, style]}>
      <Text style={styles.wordmark}>SolfaScores</Text>
      <Text style={styles.tagline}>Learn your part. Keep your choir together.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: colors.night,
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  centred: { position: 'absolute', left: '50%', top: '50%' },
  ring: {
    width: RING,
    height: RING,
    marginLeft: -RING / 2,
    marginTop: -RING / 2,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: colors.white,
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  syllable: { fontFamily: fonts.display, textAlign: 'center' },
  pop: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  wordmarkBox: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: MARK_HEIGHT / 2 + 18, alignItems: 'center' },
  wordmark: { fontFamily: fonts.display, fontSize: 46, lineHeight: 58, color: colors.onNight },
  tagline: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.onNightSoft, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },
});
