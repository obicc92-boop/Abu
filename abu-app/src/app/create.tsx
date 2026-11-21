/**
 * Add a song, opened from the "+" in the tabs' bar: like Suno's Create page (owner's request, 21 November 2026,
 * from Suno's screens), tabs for the three ways in, Write, Scan and Paste, each with one big gradient button.
 * Write opens the song editor in rows; Scan, the sheet reader; Paste takes sol-fa already typed somewhere else
 * (a chat, a document) and opens it in the editor, with the title, key and time its heading gives.
 */
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { ScanIcon } from '@/components/icons';
import { Body, Button, Card, Page, TopBar } from '@/components/ui';
import { setPastedSolfa } from '@/lib/paste-draft';
import { useSession } from '@/state/session';
import { makeStyles, useColors, usePartInk } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

type Way = 'write' | 'scan' | 'paste';

const WAYS: { id: Way; label: string }[] = [
  { id: 'write', label: 'Write' },
  { id: 'scan', label: 'Scan' },
  { id: 'paste', label: 'Paste' },
];

/** A line of a hymn in four parts, to show what writing in rows looks like. */
const SAMPLE: [string, string][] = [
  ['S', 'd :- |d :t₁ |l₁ :s₁ |'],
  ['A', 's₁ :- |s₁ :s₁ |f₁ :m₁ |'],
  ['T', 'm :- |m :r |d :d |'],
  ['B', 'd :- |d :s₁ |f₁ :d |'],
];

export default function CreateScreen() {
  const styles = useStyles();
  const colors = useColors();
  const ink = usePartInk();
  const { status } = useSession();
  const [way, setWay] = useState<Way>('write');
  const [text, setText] = useState('');
  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { mode: 'sign-in' } }} />;

  const paste = () => {
    setPastedSolfa(text);
    router.push({ pathname: '/song-editor', params: { from: 'paste' } });
  };

  return (
    <Page>
      <TopBar back title="Add a song" />
      <View style={styles.tabs} accessibilityRole="tablist">
        {WAYS.map((w) => {
          const on = way === w.id;
          return (
            <Pressable key={w.id} onPress={() => setWay(w.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{w.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {way === 'write' ? (
        <>
          <Card style={styles.panel}>
            {SAMPLE.map(([part, notes]) => (
              <View key={part} style={styles.row}>
                <View style={[styles.edge, { backgroundColor: partColor(part) }]} />
                <Text style={[styles.notes, { color: ink(part) }]}>{notes}</Text>
              </View>
            ))}
            <Body muted>Write each part in its own colour with the sol-fa keys, bar by bar. Words go under the notes, and every bar is checked as you write.</Body>
          </Card>
          <Button label="Start writing" onPress={() => router.push('/song-editor')} style={styles.big} />
        </>
      ) : null}

      {way === 'scan' ? (
        <>
          <Card style={[styles.panel, styles.centred]}>
            <ScanIcon color={colors.accent} size={52} />
            <Body muted style={styles.centredText}>
              A PDF or photos of a sheet, typed or handwritten. SolfaScores reads it, and you check each line against the picture before it’s saved.
            </Body>
          </Card>
          {Platform.OS === 'web' ? (
            <Button label="Choose a sheet" onPress={() => router.push('/scan')} style={styles.big} />
          ) : (
            <Body muted>Scanning a sheet works in the web app for now.</Body>
          )}
        </>
      ) : null}

      {way === 'paste' ? (
        <>
          <View style={styles.box}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={'Paste sol-fa you already have, from WhatsApp or a document.\n\nS  d :r |m :- |\nA  s₁:t₁|d :- |'}
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              accessibilityLabel="Sol-fa to paste"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <Button label="Continue" onPress={paste} disabled={!text.trim()} style={styles.big} />
        </>
      ) : null}
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: 'transparent', marginBottom: -1 },
  tabOn: { borderBottomColor: colors.ink },
  tabText: { fontFamily: fonts.bold, fontSize: 17, color: colors.muted },
  tabTextOn: { fontFamily: fonts.heavy, color: colors.ink },
  panel: { gap: 10, paddingVertical: 18 },
  centred: { alignItems: 'center' },
  centredText: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  edge: { width: 4, height: 22, borderRadius: 2 },
  notes: { fontFamily: fonts.mono, fontSize: 16 },
  box: { borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 16, minHeight: 240 },
  input: { flex: 1, minHeight: 208, fontFamily: fonts.mono, fontSize: 14.5, lineHeight: 21, color: colors.ink, textAlignVertical: 'top', outlineStyle: 'none' } as object,
  big: { minHeight: 58 },
}));
