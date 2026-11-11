/**
 * Perform: the order read only, for the service or show itself. There is no
 * play button and no audio code here at all, so nothing can start playing
 * during Mass. Large type (A−/A+), all parts or just mine, dark or light
 * (remembered on this device), and the screen stays on.
 */
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, sheetUrl, type OrderItem } from '@/api/client';
import { Score } from '@/components/score';
import { MAX_WIDTH } from '@/components/ui';
import { DEMO_SONGS } from '@/data/demo-songs';
import { useScreenOn } from '@/lib/screen-on';
import { readSetting, writeSetting } from '@/lib/storage';
import { KEY_NAMES, parseSolfa, partName } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

const SIZES = [16, 19, 23, 28];
const THEME_KEY = 'abu.performTheme';
const SIZE_KEY = 'abu.performSize';

interface Look {
  bg: string;
  text: string;
  kicker: string;
  section: string;
  small: string;
  ctl: string;
  ctlText: string;
  ctlOn: string;
  ctlOnText: string;
  line: string;
  lock: string;
}

const LOOKS: Record<'dark' | 'light', Look> = {
  dark: {
    bg: '#140D0A',
    text: '#F7EDE7',
    kicker: '#E8A592',
    section: colors.gold,
    small: '#BFAEA5',
    ctl: '#2B1E18',
    ctlText: '#F7EDE7',
    ctlOn: '#F7EDE7',
    ctlOnText: '#140D0A',
    line: '#33241D',
    lock: '#8E7A70',
  },
  light: {
    bg: '#FFFFFF',
    text: '#140D0A',
    kicker: colors.redDeep,
    section: colors.red,
    small: '#5E4E46',
    ctl: colors.sand,
    ctlText: colors.ink,
    ctlOn: '#140D0A',
    ctlOnText: '#FFFFFF',
    line: colors.line,
    lock: '#8E7A70',
  },
};

export default function PerformScreen() {
  const { id, i } = useLocalSearchParams<{ id: string; i?: string }>();
  const s = useSession();
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: s.status === 'signedIn' && !!id });
  const [light, setLight] = useState(() => readSetting(THEME_KEY) === 'light');
  const [size, setSize] = useState(() => {
    const n = Number(readSetting(SIZE_KEY));
    return Number.isInteger(n) && n >= 0 && n < SIZES.length && readSetting(SIZE_KEY) !== null ? n : 1;
  });
  const [mineOnly, setMineOnly] = useState(false);
  useScreenOn();

  const look = light ? LOOKS.light : LOOKS.dark;
  const chooseLight = (on: boolean) => {
    setLight(on);
    writeSetting(THEME_KEY, on ? 'light' : 'dark');
  };
  const resize = (by: number) => {
    const next = Math.min(SIZES.length - 1, Math.max(0, size + by));
    setSize(next);
    writeSetting(SIZE_KEY, String(next));
  };

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  const items = details.data?.items ?? [];
  const at = Math.min(Math.max(0, Number(i) || 0), Math.max(0, items.length - 1));
  const item = items[at];
  const exit = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/event/[id]', params: { id } }));

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: look.bg }]}>
      <StatusBar style={light ? 'dark' : 'light'} />
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: look.kicker, flex: 1 }]} numberOfLines={1}>
          Perform · {details.data?.event.title ?? ''}
        </Text>
        <Ctl look={look} label="Exit" onPress={exit} />
      </View>

      {!details.data ? (
        <Text style={[styles.small, { color: look.small, padding: 16 }]}>{details.error ? details.error.message : 'Loading…'}</Text>
      ) : !item ? (
        <Text style={[styles.small, { color: look.small, padding: 16 }]}>There are no songs in this order yet.</Text>
      ) : (
        <PerformSong
          key={item.id}
          item={item}
          look={look}
          light={light}
          onLight={chooseLight}
          size={size}
          onResize={resize}
          myPart={details.data.my_part}
          mineOnly={mineOnly}
          onMineOnly={setMineOnly}
        />
      )}

      {items.length ? (
        <View style={[styles.nav, { borderTopColor: look.line }]}>
          <NavButton look={look} label="Previous" disabled={at === 0} onPress={() => router.setParams({ i: String(at - 1) })} />
          <Text style={[styles.pos, { color: look.small }]}>
            {at + 1} / {items.length}
          </Text>
          <NavButton look={look} label="Next" disabled={at === items.length - 1} onPress={() => router.setParams({ i: String(at + 1) })} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function PerformSong({
  item,
  look,
  light,
  onLight,
  size,
  onResize,
  myPart,
  mineOnly,
  onMineOnly,
}: {
  item: OrderItem;
  look: Look;
  light: boolean;
  onLight: (on: boolean) => void;
  size: number;
  onResize: (by: number) => void;
  myPart: string | null;
  mineOnly: boolean;
  onMineOnly: (on: boolean) => void;
}) {
  const demo = DEMO_SONGS.find((d) => d.id === item.song_id);
  const song = useQuery({ queryKey: ['song', item.song_id], queryFn: () => api.song(item.song_id), retry: demo ? 0 : 1 });
  const solfa = song.data?.solfa ?? demo?.solfa ?? '';
  const time = song.data?.time_signature ?? demo?.time ?? item.time_signature;
  const doh = song.data?.doh ?? demo?.key ?? item.doh;
  const parsed = useMemo(() => (solfa.trim() ? parseSolfa(solfa, { time, key: doh }) : null), [solfa, time, doh]);
  const canMine = !!parsed && !!myPart && parsed.parts.length > 1 && parsed.parts.includes(myPart);
  const only = canMine && mineOnly ? myPart : null;
  const pts = SIZES[size];
  const maxBeats = pts >= 23 ? 4 : pts >= 19 && only ? 6 : 8;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        {item.section ? <Text style={[styles.kicker, { color: look.section }]}>{item.section}</Text> : null}
        <Text style={[styles.title, { color: look.text }]}>{item.title}</Text>
        <Text style={[styles.small, { color: look.small }]}>{[item.composer, parsed ? `Doh is ${KEY_NAMES[doh]} · ${parsed.meta.time}` : null].filter(Boolean).join(' · ')}</Text>
      </View>

      <View style={styles.ctls}>
        <Ctl look={look} label="Dark" on={!light} onPress={() => onLight(false)} />
        <Ctl look={look} label="Light" on={light} onPress={() => onLight(true)} />
        {parsed ? (
          <>
            <View style={[styles.sep, { backgroundColor: look.line }]} />
            <Ctl look={look} label="A−" a11y="Smaller text" disabled={size === 0} onPress={() => onResize(-1)} />
            <Ctl look={look} label="A+" a11y="Bigger text" disabled={size === SIZES.length - 1} onPress={() => onResize(1)} />
          </>
        ) : null}
        {canMine ? (
          <>
            <View style={[styles.sep, { backgroundColor: look.line }]} />
            <Ctl look={look} label="All parts" on={!mineOnly} onPress={() => onMineOnly(false)} />
            <Ctl look={look} label={`${partName(myPart!)} only`} on={mineOnly} onPress={() => onMineOnly(true)} />
          </>
        ) : null}
      </View>

      {parsed ? (
        <Score song={parsed} activeBeat={-1} only={only} maxBeats={maxBeats} theme={light ? 'light' : 'dark'} size={pts} />
      ) : song.isPending && !demo ? (
        <Text style={[styles.small, { color: look.small }]}>Loading…</Text>
      ) : (
        <View style={[styles.sheetOnly, { borderColor: look.line }]}>
          <Text style={[styles.small, { color: look.small, textAlign: 'center' }]}>
            {song.data?.sheet_key ? 'This song is a sheet only (no sol-fa typed yet).' : 'This song has no sol-fa or sheet yet.'}
          </Text>
          {song.data?.sheet_key ? <Ctl look={look} label="Open the original sheet" onPress={() => void Linking.openURL(sheetUrl(item.song_id))} /> : null}
        </View>
      )}
      <Text style={[styles.lock, { color: look.lock }]}>Read only · no sound · screen stays on</Text>
    </ScrollView>
  );
}

function Ctl({ look, label, a11y, on, disabled, onPress }: { look: Look; label: string; a11y?: string; on?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={[styles.ctl, { backgroundColor: on ? look.ctlOn : look.ctl }, disabled && { opacity: 0.35 }]}
      hitSlop={4}
    >
      <Text style={[styles.ctlText, { color: on ? look.ctlOnText : look.ctlText }]}>{label}</Text>
    </Pressable>
  );
}

function NavButton({ look, label, disabled, onPress }: { look: Look; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.navBtn, { backgroundColor: look.ctl }, disabled && { opacity: 0.35 }]}
    >
      <Text style={[styles.navText, { color: look.ctlText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, width: '100%', maxWidth: MAX_WIDTH + 200, alignSelf: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24, gap: 12, width: '100%', maxWidth: MAX_WIDTH + 200, alignSelf: 'center' },
  kicker: { fontFamily: fonts.heavy, fontSize: 11.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33 },
  small: { fontFamily: fonts.body, fontSize: 13 },
  ctls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  ctl: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 },
  ctlText: { fontFamily: fonts.heavy, fontSize: 13 },
  sep: { width: 1, height: 22, marginHorizontal: 2 },
  sheetOnly: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', gap: 12 },
  lock: { fontFamily: fonts.body, fontSize: 11.5 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1 },
  navBtn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navText: { fontFamily: fonts.heavy, fontSize: 15.5 },
  pos: { fontFamily: fonts.monoBold, fontSize: 14, minWidth: 54, textAlign: 'center' },
});
