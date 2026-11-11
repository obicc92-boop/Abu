/**
 * Edit a song order (leaders): move songs up and down, change their section,
 * remove them, and add songs from the repertoire or the library. Every change
 * saves straight away, one request at a time, so quick taps arrive in order.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type EventDetails, type MyGroup, type OrderItem, type Song } from '@/api/client';
import { SearchIcon } from '@/components/icons';
import { Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { agoText } from '@/lib/dates';
import { nextSection, sectionChoices } from '@/lib/order';
import { useSerial } from '@/lib/serial';
import { KEY_NAMES } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: s.status === 'signedIn' && !!id });
  const group = s.groups.find((g) => g.id === details.data?.event.group_id);
  const [version, setVersion] = useState(0);

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  if (!details.data || !group) {
    return (
      <Page>
        <TopBar back title="Song order" />
        {details.error ? <ErrorText message={details.error.message} /> : <Loading />}
      </Page>
    );
  }
  if (details.data.my_role !== 'leader') {
    return (
      <Page>
        <TopBar back title="Song order" />
        <Card>
          <Body>Only a leader can change the song order.</Body>
        </Card>
      </Page>
    );
  }
  // After "Reload", start again from what the server has (not on every background refetch).
  return (
    <OrderEditor
      key={version}
      details={details.data}
      group={group}
      reload={() => {
        void details.refetch().then(() => setVersion((v) => v + 1));
      }}
    />
  );
}

function OrderEditor({ details, group, reload }: { details: EventDetails; group: MyGroup; reload: () => void }) {
  const queryClient = useQueryClient();
  const e = details.event;
  const rehearsal = e.kind === 'rehearsal';

  // The list as shown. The ref is the truth that queued saves read when they run.
  const [items, setItems] = useState<OrderItem[]>(details.items);
  const itemsRef = useRef(details.items);
  const update = (next: OrderItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  // One request at a time, in the order the taps happened.
  const { run: queue, idle, busy, error } = useSerial(() => void queryClient.invalidateQueries({ queryKey: ['events'] }));
  const saveSeq = useRef(0);
  const saveOrder = () => {
    const seq = ++saveSeq.current;
    void queue(async () => {
      if (seq !== saveSeq.current) return; // a later save will send the newest order
      await api.setOrder(e.id, itemsRef.current.map((i) => ({ id: i.id, section: i.section })));
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...itemsRef.current];
    [next[index], next[to]] = [next[to], next[index]];
    update(next);
    saveOrder();
  };
  const setSection = (itemId: string, section: string) => {
    update(itemsRef.current.map((i) => (i.id === itemId ? { ...i, section } : i)));
    saveOrder();
  };
  const remove = (itemId: string) => {
    void queue(async () => {
      await api.removeFromOrder(e.id, itemId);
      update(itemsRef.current.filter((i) => i.id !== itemId));
    });
  };
  const add = (song: Song, section: string) =>
    queue(async () => {
      const item = await api.addToOrder(e.id, song.id, section);
      update([...itemsRef.current, item]);
    });

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const choices = sectionChoices(group.sections, rehearsal, items.map((i) => i.section));

  const done = async () => {
    await idle();
    await queryClient.invalidateQueries({ queryKey: ['event', e.id] });
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/event/[id]', params: { id: e.id } });
  };

  return (
    <Page>
      <TopBar back title={rehearsal ? 'Songs to prepare' : 'Song order'} subtitle={e.title} right={<Button small label={busy ? 'Saving…' : 'Done'} onPress={() => void done()} />} />
      {error ? (
        <Card tone="sand">
          <ErrorText message={error} />
          <Button small kind="ghost" label="Reload the order" onPress={reload} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      {items.length ? (
        <View style={{ gap: 8 }}>
          {items.map((item, i) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.ord}>{i + 1}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Pressable
                    onPress={() => setEditingSection(editingSection === item.id ? null : item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Section: ${item.section || 'none'}. Change`}
                    hitSlop={6}
                  >
                    <Text style={styles.section}>{item.section || 'Choose a section'} ▾</Text>
                  </Pressable>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                </View>
                <View style={styles.tools}>
                  <Tool label="↑" a11y={`Move ${item.title} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                  <Tool label="↓" a11y={`Move ${item.title} down`} disabled={i === items.length - 1} onPress={() => move(i, 1)} />
                  <Tool label="✕" a11y={`Remove ${item.title}`} onPress={() => remove(item.id)} />
                </View>
              </View>
              {editingSection === item.id ? (
                <View style={styles.wrap}>
                  {choices.map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      on={item.section === c}
                      onPress={() => {
                        setSection(item.id, c);
                        setEditingSection(null);
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <Body>No songs yet. Add the first one below.</Body>
        </Card>
      )}

      <AddSong group={group} rehearsal={rehearsal} items={items} choices={choices} onAdd={add} />
    </Page>
  );
}

function Tool({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} style={[styles.tool, disabled && { opacity: 0.3 }]} hitSlop={4}>
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

/** Pick a section, then a song: the group's repertoire first, or search the whole library. */
function AddSong({
  group,
  rehearsal,
  items,
  choices,
  onAdd,
}: {
  group: MyGroup;
  rehearsal: boolean;
  items: OrderItem[];
  choices: string[];
  onAdd: (song: Song, section: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const section = picked ?? nextSection(group.sections, rehearsal, items);
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const [adding, setAdding] = useState<string | null>(null);

  const repertoire = useQuery({ queryKey: ['repertoire', group.id], queryFn: () => api.repertoire(group.id) });
  const library = useQuery({ queryKey: ['songs', q, null, false], queryFn: () => api.songs({ query: q }), enabled: !!q || repertoire.data?.length === 0 });
  const history = useQuery({ queryKey: ['song-history', group.id], queryFn: () => api.songHistory(group.id), enabled: group.type !== 'personal' });
  const lastSung = new Map((history.data ?? []).map((h) => [h.song_id, h]));
  const inOrder = new Set(items.map((i) => i.song_id));

  const list: Song[] = q ? (library.data ?? []) : repertoire.data?.length ? repertoire.data : (library.data ?? []);
  const label = q ? 'From the library' : repertoire.data?.length ? (group.type === 'personal' ? 'My songs' : 'Our repertoire') : 'From the library';

  return (
    <Card>
      <Kicker>Add a song</Kicker>
      <Text style={styles.label}>Into which section?</Text>
      <View style={styles.wrap}>
        {choices.map((c) => (
          <Chip key={c} label={c} on={section === c} onPress={() => setPicked(c)} />
        ))}
      </View>
      <View>
        <Field label="Find a song" value={query} onChangeText={setQuery} placeholder="Title, composer or words" autoCapitalize="none" returnKeyType="search" />
        <View style={styles.searchIcon} pointerEvents="none">
          <SearchIcon color={colors.muted} />
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
      {(q ? library.isPending : repertoire.isPending) ? <Loading /> : null}
      {list.slice(0, 30).map((song) => {
        const h = lastSung.get(song.id);
        const already = inOrder.has(song.id);
        const playable = !!song.solfa.trim();
        return (
          <View key={song.id} style={styles.pick}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={2}>
                {song.title}
              </Text>
              <Text style={styles.small} numberOfLines={1}>
                {[song.composer, playable ? `Doh is ${KEY_NAMES[song.doh]}` : 'sheet only', h ? `last sung ${agoText(h.last_sung_at)}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {already ? (
              <Text style={styles.small}>In the order</Text>
            ) : (
              <Button
                small
                kind="ghost"
                label="Add"
                accessibilityLabel={`Add ${song.title}`}
                busy={adding === song.id}
                onPress={() => {
                  setAdding(song.id);
                  onAdd(song, section)
                    .then(() => setPicked(null))
                    .catch(() => {})
                    .finally(() => setAdding(null));
                }}
              />
            )}
          </View>
        );
      })}
      {q && library.data && !library.data.length ? <Body muted>No songs match “{q}”. Share it from the Songs tab first.</Body> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ord: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.sand, textAlign: 'center', lineHeight: 26, fontFamily: fonts.heavy, fontSize: 12.5, color: colors.muted, overflow: 'hidden' },
  section: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.redDeep },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  tools: { flexDirection: 'row', gap: 4 },
  tool: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  toolText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  searchIcon: { position: 'absolute', right: 14, bottom: 16 },
});
