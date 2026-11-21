/**
 * A sheet that rises from the bottom, for a short choice (first made for Add a song, from the design canvas's "One
 * place to add a song" board, 21 November 2026; the profile picture's choices use it too): a handle, a title and a
 * line under it, then rows, each with its own coloured icon, rising in one after the other. Drag it down, tap
 * above it, or press Back or Escape to put it away.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { ChevronIcon } from './icons';
import { MAX_WIDTH } from './ui';

const OPEN_MS = 500;
export const CLOSE_MS = 220;

export function BottomSheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  // Kept on screen while it slides away.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setShown(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);
  if (!shown) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
        {children}
      </Sheet>
    </Modal>
  );
}

function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // 1: below the screen, 0: risen. `drag`: how far a finger has pulled it down.
  const y = useSharedValue(1);
  const drag = useSharedValue(0);
  const height = useSharedValue(720);

  useEffect(() => {
    y.set(
      open
        ? withTiming(0, { duration: reduce ? 0 : OPEN_MS, easing: Easing.bezier(0.2, 0.9, 0.25, 1) })
        : withTiming(1, { duration: reduce ? 0 : CLOSE_MS, easing: Easing.in(Easing.quad) }),
    );
  }, [open, reduce, y]);

  // Pulled down far enough, or flicked, it goes; otherwise it springs back. Taps on the rows are left alone.
  const [flung, setFlung] = useState(false);
  useEffect(() => {
    if (flung) onClose();
  }, [flung, onClose]);
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_e, g) => drag.set(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 90 || g.vy > 0.8) setFlung(true);
        else drag.set(withSpring(0, { damping: 22, stiffness: 260 }));
      },
      onPanResponderTerminate: () => drag.set(withTiming(0, { duration: 160 })),
    }),
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - y.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() * height.get() + drag.get() }] }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.fill} />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { paddingBottom: 26 + insets.bottom }, sheetStyle]}
        onLayout={(e) => height.set(e.nativeEvent.layout.height + 40)}
        role="dialog"
        aria-label={title}
        {...pan.panHandlers}
      >
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title} role="heading">
            {title}
          </Text>
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

/** A row rising into place a moment after the sheet, one after the other. */
export function Rise({ delay, children }: { delay: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const a = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) a.set(withDelay(delay, withTiming(1, { duration: 550, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })));
  }, [a, delay, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: a.get(), transform: [{ translateY: 18 * (1 - a.get()) }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * One of a sheet's rows: its icon on a wash of colour, a title and a line under it, a chevron where it leads on.
 * `index` staggers its rise. The caller closes the sheet in `onPress`.
 */
export function SheetRow({
  icon,
  wash,
  title,
  sub,
  onPress,
  index,
  danger,
  chevron = true,
}: {
  icon: ReactNode;
  wash: string;
  title: string;
  sub?: string;
  onPress: () => void;
  index: number;
  danger?: boolean;
  chevron?: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Rise delay={120 + index * 70}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={sub} style={({ pressed }) => [styles.way, pressed && styles.wayPressed]}>
        <View style={[styles.wayIcon, { backgroundColor: wash }]}>{icon}</View>
        <View style={styles.wayText}>
          <Text style={[styles.wayTitle, danger && { color: colors.danger }]}>{title}</Text>
          {sub ? <Text style={styles.waySub}>{sub}</Text> : null}
        </View>
        {chevron ? <ChevronIcon color={colors.faint} /> : null}
      </Pressable>
    </Rise>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)' } : null) } as object,
  sheet: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.line,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 10,
    boxShadow: '0 -24px 60px rgba(0,0,0,0.35)',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.barline, marginBottom: 8 },
  head: { paddingHorizontal: 4, paddingBottom: 6, gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted },
  way: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: colors.board, borderWidth: 1, borderColor: colors.line },
  wayPressed: { backgroundColor: colors.line, transform: [{ scale: 0.97 }] },
  wayIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wayText: { flex: 1, minWidth: 0, gap: 3 },
  wayTitle: { fontFamily: fonts.heavy, fontSize: 16, color: colors.ink },
  waySub: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 18, color: colors.muted },
}));
