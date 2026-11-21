/**
 * Add a song, as a sheet that rises from the bottom (owner's request, 21 November 2026, from the design canvas's
 * "One place to add a song" board): four ways in, each a row with its own coloured icon. Write it opens the song
 * editor; Scan a sheet, the sheet reader (web only); Paste sol-fa, src/app/paste.tsx; From the library, the Songs
 * tab's search (songs other choirs have shared, to save or add to the repertoire). Opened by the floating "+" at the
 * bottom right of the Songs tab (`FloatingAdd`) and by the leader's To do on Home. Drag it down, tap above it, or
 * press Back or Escape to put it away.
 */
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useColors, usePartInk, useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { MainFill } from './brand';
import { ChevronIcon, ClipboardIcon, PencilIcon, PlusIcon, ScanLineIcon, SearchIcon } from './icons';
import { MAX_WIDTH } from './ui';

const OPEN_MS = 500;
export const CLOSE_MS = 220;

interface Way {
  title: string;
  sub: string;
  icon: ReactNode;
  wash: string;
  go: () => void;
}

/**
 * The sheet. `onLibrary` is what From the library does (the Songs tab focuses its search); elsewhere it opens the
 * Songs tab.
 */
export function AddSongSheet({ open, onClose, onLibrary }: { open: boolean; onClose: () => void; onLibrary?: () => void }) {
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
      <Sheet open={open} onClose={onClose} onLibrary={onLibrary} />
    </Modal>
  );
}

function Sheet({ open, onClose, onLibrary }: { open: boolean; onClose: () => void; onLibrary?: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const ink = usePartInk();
  const dark = useTheme().scheme === 'dark';
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

  const wash = (c: string) => `${c}${dark ? '38' : '1F'}`;
  const ways: Way[] = [
    { title: 'Write it', sub: 'Part by part, with the sol-fa keys', icon: <PencilIcon color={ink('A')} />, wash: wash(colors.gold), go: () => router.push('/song-editor') },
    ...(Platform.OS === 'web'
      ? [{ title: 'Scan a sheet', sub: 'A PDF or photos, typed or handwritten', icon: <ScanLineIcon color={ink('T')} />, wash: wash(ink('T')), go: () => router.push('/scan') }]
      : []),
    { title: 'Paste sol-fa', sub: 'Text you already have, from a chat or a document', icon: <ClipboardIcon color={ink('B')} />, wash: wash(ink('B')), go: () => router.push('/paste') },
    {
      title: 'From the library',
      sub: 'Songs other choirs have shared',
      icon: <SearchIcon size={24} color={colors.ink} />,
      wash: `${colors.ink}${dark ? '1A' : '12'}`,
      go: onLibrary ?? (() => router.push('/songs')),
    },
  ];

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.fill} />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { paddingBottom: 26 + insets.bottom }, sheetStyle]}
        onLayout={(e) => height.set(e.nativeEvent.layout.height + 40)}
        role="dialog"
        aria-label="Add a song"
        {...pan.panHandlers}
      >
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title} role="heading">
            Add a song
          </Text>
          <Text style={styles.sub}>However you have it, it ends up as sol-fa your choir can play.</Text>
        </View>
        {ways.map((w, i) => (
          <Rise key={w.title} delay={120 + i * 70}>
            <Pressable
              onPress={() => {
                onClose();
                w.go();
              }}
              accessibilityRole="button"
              accessibilityLabel={w.title}
              accessibilityHint={w.sub}
              style={({ pressed }) => [styles.way, pressed && styles.wayPressed]}
            >
              <View style={[styles.wayIcon, { backgroundColor: w.wash }]}>{w.icon}</View>
              <View style={styles.wayText}>
                <Text style={styles.wayTitle}>{w.title}</Text>
                <Text style={styles.waySub}>{w.sub}</Text>
              </View>
              <ChevronIcon color={colors.faint} />
            </Pressable>
          </Rise>
        ))}
      </Animated.View>
    </View>
  );
}

/** A row rising into place a moment after the sheet, one after the other. */
function Rise({ delay, children }: { delay: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const a = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) a.set(withDelay(delay, withTiming(1, { duration: 550, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })));
  }, [a, delay, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: a.get(), transform: [{ translateY: 18 * (1 - a.get()) }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * The round gradient "+", floating at the bottom right of a page, over its list (Songs: `Page`'s `floating`). It
 * pops in as the page opens.
 */
export function FloatingAdd({ onPress, label = 'Add a song' }: { onPress: () => void; label?: string }) {
  const styles = useStyles();
  const colors = useColors();
  const reduce = useReducedMotion();
  const a = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) a.set(withDelay(150, withSpring(1, { damping: 13, stiffness: 180 })));
  }, [a, reduce]);
  const pop = useAnimatedStyle(() => ({ opacity: Math.min(1, a.get() * 1.6), transform: [{ scale: 0.5 + 0.5 * a.get() }] }));
  return (
    <View style={styles.floatWrap}>
      <View style={styles.floatColumn}>
        <Animated.View style={pop}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.float, { boxShadow: `0 10px 26px ${colors.primary}66` }, pressed && styles.floatPressed]}
          >
            <View style={styles.floatFill}>
              <MainFill from={colors.primary} to={colors.primary2} />
            </View>
            {/* In a view of its own, so it sits over the gradient (on the web an svg alone is drawn under it). */}
            <View>
              <PlusIcon color={colors.onPrimary} size={28} />
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const FLOAT = 60;

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
  // Over the list, inside the page's column on a wide screen.
  floatWrap: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center', pointerEvents: 'box-none' },
  floatColumn: { width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: 18, alignItems: 'flex-end', pointerEvents: 'box-none' },
  float: { width: FLOAT, height: FLOAT, borderRadius: FLOAT / 2, alignItems: 'center', justifyContent: 'center' },
  floatPressed: { opacity: 0.9, transform: [{ scale: 0.94 }] },
  floatFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: FLOAT / 2, overflow: 'hidden' },
}));
