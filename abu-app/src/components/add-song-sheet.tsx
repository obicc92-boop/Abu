/**
 * Add a song, as a sheet that rises from the bottom (owner's request, 21 November 2026, from the design canvas's
 * "One place to add a song" board; the sheet itself is src/components/bottom-sheet.tsx): four ways in, each a row
 * with its own coloured icon. Write it opens the song's details, then the song editor (src/app/write.tsx); Scan a
 * sheet, the sheet reader (web only); Paste sol-fa, src/app/paste.tsx; From the library, the Songs tab's search
 * (songs other choirs have shared, to save or add to the repertoire). Opened by the floating "+" at the bottom
 * right of the Songs tab (`FloatingAdd`) and by the leader's To do on Home.
 */
import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { makeStyles, useColors, usePartInk, useTheme } from '@/theme/theme';

import { BottomSheet, SheetRow } from './bottom-sheet';
import { MainFill } from './brand';
import { ClipboardIcon, PencilIcon, PlusIcon, ScanLineIcon, SearchIcon } from './icons';
import { MAX_WIDTH } from './ui';

export { CLOSE_MS } from './bottom-sheet';

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
  const colors = useColors();
  const ink = usePartInk();
  const dark = useTheme().scheme === 'dark';
  const wash = (c: string) => `${c}${dark ? '38' : '1F'}`;
  const ways: Way[] = [
    { title: 'Write it', sub: 'Part by part, with the sol-fa keys', icon: <PencilIcon color={ink('A')} />, wash: wash(colors.gold), go: () => router.push('/write') },
    ...(Platform.OS === 'web'
      ? [{ title: 'Scan a sheet', sub: 'Sol-fa or staff notation: a PDF, photos or MusicXML', icon: <ScanLineIcon color={ink('T')} />, wash: wash(ink('T')), go: () => router.push('/scan') }]
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
    <BottomSheet open={open} onClose={onClose} title="Add a song" subtitle="However you have it, it ends up as sol-fa your choir can play.">
      {ways.map((w, i) => (
        <SheetRow
          key={w.title}
          index={i}
          icon={w.icon}
          wash={w.wash}
          title={w.title}
          sub={w.sub}
          onPress={() => {
            onClose();
            w.go();
          }}
        />
      ))}
    </BottomSheet>
  );
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

const useStyles = makeStyles(() => ({
  // Over the list, inside the page's column on a wide screen.
  floatWrap: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center', pointerEvents: 'box-none' },
  floatColumn: { width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: 18, alignItems: 'flex-end', pointerEvents: 'box-none' },
  float: { width: FLOAT, height: FLOAT, borderRadius: FLOAT / 2, alignItems: 'center', justifyContent: 'center' },
  floatPressed: { opacity: 0.9, transform: [{ scale: 0.94 }] },
  floatFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: FLOAT / 2, overflow: 'hidden' },
}));
