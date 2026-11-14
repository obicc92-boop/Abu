/**
 * The opening animation. Its first frame matches the still splash screen
 * (red, with the music book in the middle), so the hand-over is seamless.
 * Then the book bounces, a glow and sound rings spread from it, notes and
 * sol-fa syllables burst out across the screen, gold glitter twinkles, "Abụ"
 * rises in, and everything fades into the app. About two seconds; a tap skips
 * it, and phones set to reduce motion get a plain fade.
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
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/brand';
import { brand as colors, fonts } from '@/theme/tokens';

import { splashParticles, type Burst, type Sparkle } from './particles';

/** Book width on screen: the same as `imageWidth` for expo-splash-screen in app.json. */
export const BOOK_WIDTH = 110;
const BOOK_HEIGHT = (BOOK_WIDTH * 556) / 692;
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
  const [{ bursts, sparkles }] = useState(() => splashParticles());
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
      <Pressable style={styles.fill} onPress={skip} accessibilityRole="button" accessibilityLabel="Abụ. Tap to skip">
        {reduceMotion ? null : (
          <>
            <Glow />
            <Ring delay={140} />
            <Ring delay={460} />
            {sparkles.map((s, i) => (
              <Twinkle key={`s${i}`} sparkle={s} />
            ))}
            {bursts.map((b, i) => (
              <BurstGlyph key={`b${i}`} burst={b} span={span} />
            ))}
          </>
        )}
        <Book animate={!reduceMotion} />
        {reduceMotion ? null : <Wordmark />}
      </Pressable>
    </Animated.View>
  );
}

/* ---------- Pieces ---------- */

function Book({ animate }: { animate: boolean }) {
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
    <Animated.View style={[styles.centred, { width: BOOK_WIDTH, height: BOOK_HEIGHT, marginLeft: -BOOK_WIDTH / 2, marginTop: -BOOK_HEIGHT / 2 }, style]}>
      <BrandMark size={BOOK_WIDTH} />
    </Animated.View>
  );
}

const GLOW = 340;

/** A soft light behind the book that swells, then settles. */
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
            <Stop offset="0" stopColor="#FF8A6B" stopOpacity={0.85} />
            <Stop offset="0.45" stopColor="#F2603F" stopOpacity={0.45} />
            <Stop offset="1" stopColor={colors.red} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#splashGlow)" />
      </Svg>
    </Animated.View>
  );
}

const RING = 150;

/** A sound ring rippling out from the book, like the motif's rings. */
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
    <Animated.View style={[styles.centred, styles.glyph, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }, style]}>
      <Glyph burst={burst} />
    </Animated.View>
  );
}

/** Notes are drawn as shapes, so they look the same on every phone. */
function Glyph({ burst: { kind, text, size, color } }: { burst: Burst }) {
  if (kind === 'syllable') {
    return <Text style={[styles.syllable, { fontSize: size, lineHeight: size * 1.1, color }]}>{text}</Text>;
  }
  if (kind === 'glint') return <Star size={size} color={color} />;
  if (kind === 'beamed') {
    return (
      <Svg width={size} height={size} viewBox="556 396 236 258">
        <Ellipse cx={604} cy={616} rx={42} ry={31} fill={color} transform="rotate(-22 604 616)" />
        <Ellipse cx={740} cy={590} rx={42} ry={31} fill={color} transform="rotate(-22 740 590)" />
        <Rect x={631} y={440} width={18} height={172} fill={color} />
        <Rect x={767} y={414} width={18} height={172} fill={color} />
        <Path d="M631 428L785 402V446L631 472Z" fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 40 60">
      <Ellipse cx={14} cy={48} rx={11} ry={8} fill={color} transform="rotate(-22 14 48)" />
      <Rect x={22} y={6} width={4} height={42} fill={color} />
      {kind === 'eighth' ? <Path d="M26 6C31 13 38 17 36 30C34 23 30 20 26 19Z" fill={color} /> : null}
    </Svg>
  );
}

/** A glint that twinkles twice where it is. */
function Twinkle({ sparkle }: { sparkle: Sparkle }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(sparkle.delay, withTiming(2, { duration: sparkle.duration * 2, easing: Easing.linear })));
  }, [sparkle, t]);
  const style = useAnimatedStyle(() => {
    const k = Math.abs(Math.sin(t.value * Math.PI));
    return { opacity: k, transform: [{ scale: 0.3 + 0.9 * k }, { rotate: `${t.value * 60}deg` }] };
  });
  const { x, y, size, color } = sparkle;
  return (
    <Animated.View
      style={[
        styles.sparkle,
        { left: `${x * 100}%`, top: `${y * 100}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 },
        style,
      ]}
    >
      <Star size={size} color={color} />
    </Animated.View>
  );
}

/** A four-pointed glint. */
function Star({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M10 0C11 6 14 9 20 10C14 11 11 14 10 20C9 14 6 11 0 10C6 9 9 6 10 0Z" fill={color} />
    </Svg>
  );
}

function Wordmark() {
  const a = useSharedValue(0);
  useEffect(() => {
    a.set(withDelay(650, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) })));
  }, [a]);
  const style = useAnimatedStyle(() => ({ opacity: a.value, transform: [{ translateY: 14 * (1 - a.value) }] }));
  return (
    <Animated.View style={[styles.wordmarkBox, style]}>
      <Text style={styles.wordmark}>Abụ</Text>
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
    backgroundColor: colors.red,
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
  sparkle: { position: 'absolute' },
  wordmarkBox: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: BOOK_HEIGHT / 2 + 18, alignItems: 'center' },
  wordmark: { fontFamily: fonts.display, fontSize: 46, lineHeight: 58, color: colors.white },
});
