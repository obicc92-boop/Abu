/**
 * "Carry on where you left off", at the top of the Songs tab (owner's request, 21 November 2026: in front, not
 * only inside the Scan page): scans still being checked, kept on the phone (src/scan/saved.web.ts), and a song
 * started with Write it and not saved yet (src/lib/new-song.ts). Each opens where it was left. Nothing shows when
 * there's nothing unfinished.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { hasMusic, newSong, type NewSong } from '@/lib/new-song';
import { listScans, type SavedScan } from '@/scan/saved';
import { ago, scanProgress, scanTitle } from '@/scan/unfinished';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { PencilIcon, ScanLineIcon } from './icons';
import { Button, Kicker } from './ui';

type Scan = SavedScan<{ checked?: boolean; skipped?: boolean }>;

export function CarryOn() {
  const styles = useStyles();
  const colors = useColors();
  const [scans, setScans] = useState<Scan[]>([]);
  const [draft, setDraft] = useState<NewSong | null>(null);
  // Looked at afresh each time the tab comes back into view (a scan saved or finished meanwhile).
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listScans<{ checked?: boolean; skipped?: boolean }>().then((s) => live && setScans(s));
      setDraft(newSong());
      return () => {
        live = false;
      };
    }, []),
  );
  const writing = draft && (draft.title.trim() || hasMusic(draft.solfa)) ? draft : null;
  if (!scans.length && !writing) return null;
  return (
    <View style={styles.box}>
      <Kicker>Carry on where you left off</Kicker>
      {scans.map((s) => (
        <View key={s.id} style={styles.row}>
          <View style={styles.icon}>
            <ScanLineIcon color={colors.ink} size={20} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {scanTitle(s)}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {s.phase === 'finish' ? 'Checked, ready to save' : scanProgress(s)} · {ago(s.savedAt)}
            </Text>
          </View>
          <Button
            small
            label={s.phase === 'finish' ? 'Save it' : 'Carry on'}
            accessibilityLabel={`Carry on with ${scanTitle(s)}`}
            onPress={() => router.push({ pathname: '/scan', params: { resume: s.id } })}
          />
        </View>
      ))}
      {writing ? (
        <View style={styles.row}>
          <View style={styles.icon}>
            <PencilIcon color={colors.ink} size={20} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {writing.title.trim() || 'A song you started'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {hasMusic(writing.solfa) ? 'Being written, not saved yet' : 'Started, no music yet'}
            </Text>
          </View>
          <Button
            small
            label="Carry on"
            accessibilityLabel={`Carry on writing ${writing.title.trim() || 'the song you started'}`}
            onPress={() => router.push(hasMusic(writing.solfa) ? { pathname: '/song-editor', params: { from: 'write' } } : '/write')}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
}));
