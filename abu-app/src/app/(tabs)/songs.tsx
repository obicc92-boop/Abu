/**
 * Songs: the library. Every song shared on SolfaScores is open to everyone, signed in
 * or not. Filters: your group's repertoire, My songs, songs with sol-fa, tags.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { api, type Song } from '@/api/client';
import { SearchIcon } from '@/components/icons';
import { Shelf, SongTile, type TileSong } from '@/components/shelf';
import { SongRow } from '@/components/song-row';
import { Body, Button, Chip, Loading, Page, TopBar } from '@/components/ui';
import { DEMO_SONGS } from '@/data/demo-songs';
import { FILTER_TAGS } from '@/lib/tags';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

type View_ = 'all' | 'ours' | 'mine' | 'playable';

export default function Songs() {
  const styles = useStyles();
  const colors = useColors();
  const s = useSession();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View_>('all');
  const [tag, setTag] = useState<string | null>(null);
  const signedIn = s.status === 'signedIn';
  const choir = s.group && s.group.type !== 'personal' && s.group.status === 'active' ? s.group : null;

  const library = useQuery({
    queryKey: ['songs', query.trim(), tag, view === 'playable'],
    queryFn: () => api.songs({ query, tag: tag ?? undefined, playable: view === 'playable' }),
    enabled: view === 'all' || view === 'playable',
  });
  const listGroup = view === 'ours' ? choir?.id : view === 'mine' ? s.personal?.id : undefined;
  const repertoire = useQuery({
    queryKey: ['repertoire', listGroup],
    queryFn: () => api.repertoire(listGroup!),
    enabled: !!listGroup,
  });

  // Browsing (no search, no filter): shelves first, as on Suno's Discover, then every song.
  const browsing = !query.trim() && view === 'all' && !tag;
  const ourShelf = useQuery({ queryKey: ['repertoire', choir?.id], queryFn: () => api.repertoire(choir!.id), enabled: browsing && !!choir });
  const myShelf = useQuery({ queryKey: ['repertoire', s.personal?.id], queryFn: () => api.repertoire(s.personal!.id), enabled: browsing && !!s.personal });

  const source = listGroup ? repertoire : library;
  const q = query.trim().toLowerCase();
  let songs: Song[] = source.data ?? [];
  if (listGroup) {
    songs = songs.filter((x) => (!q || `${x.title} ${x.composer}`.toLowerCase().includes(q)) && (!tag || x.tags.some((t) => t.toLowerCase() === tag.toLowerCase())));
  }
  // Offline or the API unreachable: the demo songs still work.
  const offline = !!source.error && !listGroup;

  return (
    <Page>
      <TopBar
        title="Songs"
        subtitle="Every song shared on SolfaScores is open to you."
        right={
          signedIn ? (
            <Button small label="Add a song" onPress={() => router.push('/create')} />
          ) : undefined
        }
      />
      <View style={styles.search}>
        <SearchIcon color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, composer or words"
          placeholderTextColor={colors.placeholder}
          style={styles.searchInput}
          accessibilityLabel="Search songs"
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" on={view === 'all'} onPress={() => setView('all')} />
        {choir ? <Chip label="Our repertoire" on={view === 'ours'} onPress={() => setView('ours')} /> : null}
        {signedIn && s.personal ? <Chip label="My songs" on={view === 'mine'} onPress={() => setView('mine')} /> : null}
        <Chip label="Has sol-fa" on={view === 'playable'} onPress={() => setView('playable')} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTER_TAGS.map((t) => (
          <Chip key={t} label={t} on={tag === t} onPress={() => setTag(tag === t ? null : t)} />
        ))}
      </ScrollView>

      {browsing && choir && ourShelf.data?.length ? (
        <Shelf title="Our repertoire" note={choir.name} onSeeAll={() => setView('ours')}>
          {ourShelf.data.slice(0, 12).map((x) => (
            <SongTile key={x.id} song={tileOf(x)} />
          ))}
        </Shelf>
      ) : null}
      {browsing && myShelf.data?.length ? (
        <Shelf title="My songs" onSeeAll={() => setView('mine')}>
          {myShelf.data.slice(0, 12).map((x) => (
            <SongTile key={x.id} song={tileOf(x)} />
          ))}
        </Shelf>
      ) : null}
      {browsing && (ourShelf.data?.length || myShelf.data?.length) ? <Text style={styles.heading}>All songs</Text> : null}

      {source.isPending && source.fetchStatus !== 'idle' ? <Loading /> : null}
      {offline ? (
        <>
          <Body muted>Couldn’t reach the library ({source.error!.message}). These demo songs still work:</Body>
          {DEMO_SONGS.map((d) => (
            <SongRow key={d.id} song={{ id: d.id, title: d.title, composer: d.composer, doh: d.key, time: d.time, playable: true }} />
          ))}
        </>
      ) : (
        songs.map((x) => (
          <SongRow
            key={x.id}
            song={{ id: x.id, title: x.title, composer: x.composer, doh: x.doh, time: x.time_signature, playable: !!x.solfa.trim() }}
            note={x.group_name ?? undefined}
          />
        ))
      )}
      {!source.isPending && !offline && !songs.length ? (
        <Body muted style={{ textAlign: 'center', paddingVertical: 16 }}>
          {view === 'ours'
            ? 'No songs in the repertoire yet. Leaders add them from a song’s page.'
            : view === 'mine'
              ? 'No saved songs yet. Open a song and tap “Save to My songs”.'
              : 'No songs match. Try fewer words, or another filter.'}
        </Body>
      ) : null}
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minHeight: 46, fontFamily: fonts.body, fontSize: 16, color: colors.ink },
  chips: { gap: 8 },
  heading: { fontFamily: fonts.heavy, fontSize: 20, color: colors.ink, marginTop: 4 },
}));

/** A library song as a shelf's tile. */
const tileOf = (x: Song): TileSong => ({
  id: x.id,
  title: x.title,
  composer: x.composer,
  sub: x.composer || (x.solfa.trim() ? x.time_signature : 'Sheet only'),
  doh: x.doh,
  time: x.time_signature,
  solfa: x.solfa,
  countable: true,
});
