/**
 * Songs: the library. Everything shared on Abụ is open to everyone, signed in
 * or not; the demo songs are always here to try. Adding songs comes with
 * milestone 3.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { api } from '@/api/client';
import { SearchIcon } from '@/components/icons';
import { SongRow, type SongSummary } from '@/components/song-row';
import { Body, Kicker, Page, TopBar } from '@/components/ui';
import { DEMO_SONGS } from '@/data/demo-songs';
import { colors, fonts } from '@/theme/tokens';

export default function Songs() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shared = useQuery({ queryKey: ['songs', q], queryFn: () => api.songs(q || undefined) });

  const demos: SongSummary[] = DEMO_SONGS.filter((d) => !q || `${d.title} ${d.composer}`.toLowerCase().includes(q)).map((d) => ({
    id: d.id,
    title: d.title,
    composer: d.composer,
    doh: d.key,
    time: d.time,
    playable: true,
  }));
  const library: SongSummary[] = (shared.data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    composer: s.composer,
    doh: s.doh,
    time: s.time_signature,
    playable: !!s.solfa.trim(),
  }));

  return (
    <Page>
      <TopBar title="Songs" subtitle="Every song shared on Abụ is open to you." />
      <View style={styles.search}>
        <SearchIcon color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title or composer"
          placeholderTextColor="#B3A39A"
          style={styles.searchInput}
          accessibilityLabel="Search songs"
          autoCorrect={false}
        />
      </View>

      {library.length ? (
        <>
          <Kicker>Shared on Abụ</Kicker>
          {library.map((s) => (
            <SongRow key={s.id} song={s} />
          ))}
        </>
      ) : null}

      <Kicker>Demo songs</Kicker>
      {demos.length ? demos.map((s) => <SongRow key={s.id} song={s} />) : <Body muted>No demo song matches “{query}”.</Body>}
      {shared.error ? <Body muted>Couldn’t load shared songs: {shared.error.message}</Body> : null}
      <Body muted style={{ textAlign: 'center', marginTop: 6 }}>
        Adding songs (typing or pasting sol-fa, and attaching the original sheet) is coming next.
      </Body>
    </Page>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minHeight: 46, fontFamily: fonts.body, fontSize: 16, color: colors.ink },
});
