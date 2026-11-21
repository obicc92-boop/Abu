/**
 * Paste sol-fa, from Add a song's sheet (src/components/add-song-sheet.tsx): sol-fa already typed somewhere else (a
 * chat, a document) opens in the song editor, with the title, key and time its heading gives (src/lib/paste-draft.ts).
 * Until 21 November 2026 this was the Add a song page, with tabs for Write, Scan and Paste like Suno's Create page;
 * the owner chose the sheet instead.
 */
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Body, Button, Page, TopBar } from '@/components/ui';
import { setPastedSolfa } from '@/lib/paste-draft';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function PasteScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { status } = useSession();
  const [text, setText] = useState('');
  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { mode: 'sign-in' } }} />;

  const paste = () => {
    setPastedSolfa(text);
    router.push({ pathname: '/song-editor', params: { from: 'paste' } });
  };

  return (
    <Page>
      <TopBar back title="Paste sol-fa" />
      <Body muted>From WhatsApp or a document. If it starts with the title, key and time, they’re filled in for you, and every bar is checked in the editor.</Body>
      <View style={styles.box}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          placeholder={'title: Morning Hymn\nkey: G\ntime: 4/4\n\nS  d :r |m :- |\nA  s₁:t₁|d :- |'}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          accessibilityLabel="Sol-fa to paste"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <Button label="Continue" onPress={paste} disabled={!text.trim()} style={styles.big} />
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 16, minHeight: 260 },
  input: { flex: 1, minHeight: 228, fontFamily: fonts.mono, fontSize: 14.5, lineHeight: 21, color: colors.ink, textAlignVertical: 'top', outlineStyle: 'none' } as object,
  big: { minHeight: 58 },
}));
