/**
 * Small movements that make Home feel alive, as music apps do (colleagues' request, 25 November 2026, from
 * Audiomack's screens): things shrink a little under a finger, sections rise into place as they arrive, a cover
 * that's playing has bars dancing on it, and grey shapes shimmer while the page loads. Each one stays still for
 * anyone whose phone asks for less motion.
 */
import { useEffect, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { makeStyles } from '@/theme/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A pressable that shrinks a little while pressed and springs back. */
export function PressScale({ style, children, to = 0.96, ...props }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: ReactNode; to?: number }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        if (!reduce) scale.set(withTiming(to, { duration: 110, easing: Easing.out(Easing.quad) }));
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 260 }));
        props.onPressOut?.(e);
      }}
      style={[style, pressed]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Rises into place and fades in, `delay` ms after it first shows. */
export function Appear({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const a = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) a.set(withDelay(delay, withTiming(1, { duration: 520, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })));
  }, [a, delay, reduce]);
  const shown = useAnimatedStyle(() => ({ opacity: a.get(), transform: [{ translateY: 16 * (1 - a.get()) }] }));
  return <Animated.View style={[style, shown]}>{children}</Animated.View>;
}

function Bar({ index, color, height, playing }: { index: number; color: string; height: number; playing: boolean }) {
  const reduce = useReducedMotion();
  const h = useSharedValue(0.4);
  useEffect(() => {
    if (!playing || reduce) {
      cancelAnimation(h);
      h.set(withTiming(playing ? 0.7 : 0.4, { duration: 200 }));
      return;
    }
    // Each bar at its own pace, so they never move together.
    const pace = [380, 300, 450, 340][index % 4];
    h.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: pace, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.25 + (index % 3) * 0.12, { duration: pace * 0.9, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(h);
  }, [h, index, playing, reduce]);
  const style = useAnimatedStyle(() => ({ height: Math.max(2, height * h.get()) }));
  return <Animated.View style={[{ width: Math.max(2.5, height / 4.5), borderRadius: 2, backgroundColor: color }, style]} />;
}

/** Bars dancing as music plays (still while paused), `height` tall. */
export function Equalizer({ playing, color, height = 14, bars = 3 }: { playing: boolean; color: string; height?: number; bars?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Math.max(2, height / 7), height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: bars }, (_, i) => (
        <Bar key={i} index={i} color={color} height={height} playing={playing} />
      ))}
    </View>
  );
}

/** A grey shape that shimmers while what goes there loads. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const reduce = useReducedMotion();
  const a = useSharedValue(0.55);
  useEffect(() => {
    if (reduce) return;
    a.set(withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(a);
  }, [a, reduce]);
  const pulse = useAnimatedStyle(() => ({ opacity: a.get() }));
  return <Animated.View style={[styles.skeleton, style, pulse]} />;
}

const useStyles = makeStyles((colors) => ({
  skeleton: { backgroundColor: colors.board, borderRadius: 14 },
}));
