/**
 * Edit a song order, section by section (leaders, and part leaders when
 * allowed). Each section has its songs and its own "Add a song", so a section
 * can hold several; sections can be renamed, moved, and added with any name.
 * Every change saves straight away, one request at a time, so quick taps
 * arrive in order.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { api, type EventDetails, type MyGroup, type OrderItem, type Song } from '@/api/client';
import { SearchIcon } from '@/components/icons';
import { Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { agoText } from '@/lib/dates';
import { bySection, cleanSection, insertAfter, moveSection, moveSong, renameSection, sectionChoices } from '@/lib/order';
import { useOnline } from '@/lib/online';
import { useSerial } from '@/lib/serial';
import { KEY_NAMES } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const online = useOnline();
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: s.status === 'signedIn' && !!id });
  const group = s.groups.find((g) => g.id === details.data?.event.group_id);
  const [version, setVersion] = useState(0);

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  // Edit from the server's latest order, not a copy saved on the phone (offline, nothing can be saved anyway).
  if (!details.data || !group || (online && !details.isFetchedAfterMount)) {
    return (
      <Page>
        <TopBar back title="Song order" />
        {details.error ? <ErrorText message={details.error.message} /> : <Loading />}
      </Page>
    );
  }
  if (!details.data.can_edit_order) {
    return (
      <Page>
        <TopBar back title="Song order" />
        <Card>
          <Body>
            {details.data.my_role === 'part_leader'
              ? 'Only a leader can change the song order, unless the leader lets part leaders edit song orders (in the Group tab’s settings).'
              : 'Only a leader can change the song order.'}
          </Body>
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
  const styles = useStyles();
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
  // New sections with no songs yet (a section only exists in an order once it has a song).
  const [pending, setPending] = useState<string[]>([]);
  // The section whose song picker is open.
  const [adding, setAdding] = useState<string | null>(null);

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
  const change = (next: OrderItem[]) => {
    update(next);
    saveOrder();
  };

  const remove = (itemId: string) => {
    void queue(async () => {
      await api.removeFromOrder(e.id, itemId);
      update(itemsRef.current.filter((i) => i.id !== itemId));
    });
  };
  /** Adds a song at the end of its section (after `afterId`, the section's last song), or at the end. */
  const add = (song: Song, section: string, afterId: string | null) =>
    queue(async () => {
      const item = await api.addToOrder(e.id, song.id, section);
      const next = insertAfter(itemsRef.current, afterId && itemsRef.current.some((i) => i.id === afterId) ? afterId : null, item);
      update(next);
      setPending((p) => p.filter((x) => x !== section));
      // The server added it at the end: send the order with it in its section.
      if (next[next.length - 1].id !== item.id) await api.setOrder(e.id, next.map((i) => ({ id: i.id, section: i.section })));
    });

  const runs = bySection(items);
  const used = new Set(items.map((i) => i.section));
  const suggestions = sectionChoices(group.sections, rehearsal).filter((x) => !used.has(x) && !pending.includes(x));
  const newSection = (name: string) => {
    const clean = cleanSection(name);
    if (!clean) return;
    if (!used.has(clean) && !pending.includes(clean)) setPending([...pending, clean]);
    setAdding(clean);
  };

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

      {runs.map((run, r) => {
        const last = run.items[run.items.length - 1].item;
        return (
          <SectionBlock
            key={`${r}-${run.section}`}
            name={run.section}
            canMoveUp={r > 0}
            canMoveDown={r < runs.length - 1}
            onMove={(by) => change(moveSection(itemsRef.current, r, by))}
            onRename={(name) => change(renameSection(itemsRef.current, r, name))}
            adding={adding === run.section && runs.findIndex((x) => x.section === run.section) === r}
            onAdding={(on) => setAdding(on ? run.section : null)}
            picker={<SongPicker group={group} items={items} section={run.section} onAdd={(song) => add(song, run.section, last.id)} />}
          >
            {run.items.map(({ item, n }) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.ord}>{n}</Text>
                <Text style={[styles.title, { flex: 1 }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.tools}>
                  <Tool label="↑" a11y={`Move ${item.title} up`} disabled={n === 1} onPress={() => change(moveSong(itemsRef.current, n - 1, -1))} />
                  <Tool label="↓" a11y={`Move ${item.title} down`} disabled={n === items.length} onPress={() => change(moveSong(itemsRef.current, n - 1, 1))} />
                  <Tool label="✕" a11y={`Remove ${item.title}`} onPress={() => remove(item.id)} />
                </View>
              </View>
            ))}
          </SectionBlock>
        );
      })}

      {pending.map((name) => (
        <SectionBlock
          key={`new-${name}`}
          name={name}
          isNew
          onRename={(next) => {
            const clean = cleanSection(next);
            if (!clean) return;
            setPending(pending.map((x) => (x === name ? clean : x)));
            if (adding === name) setAdding(clean);
          }}
          onRemove={() => setPending(pending.filter((x) => x !== name))}
          adding={adding === name}
          onAdding={(on) => setAdding(on ? name : null)}
          picker={<SongPicker group={group} items={items} section={name} onAdd={(song) => add(song, name, null)} />}
        />
      ))}

      <NewSection suggestions={suggestions} empty={!items.length && !pending.length} onAdd={newSection} />

      {group.role === 'leader' ? (
        <Pressable onPress={() => router.push('/group-settings')} accessibilityRole="link" style={{ alignSelf: 'center' }} hitSlop={8}>
          <Text style={styles.link}>{group.type === 'personal' ? 'Change your usual sections' : 'Change the group’s usual sections'}</Text>
        </Pressable>
      ) : null}
    </Page>
  );
}

/** A section: its name (rename it), its songs, moving the whole section, and adding songs to it. */
function SectionBlock({
  name,
  isNew,
  canMoveUp,
  canMoveDown,
  onMove,
  onRename,
  onRemove,
  adding,
  onAdding,
  picker,
  children,
}: {
  name: string;
  isNew?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (by: -1 | 1) => void;
  onRename: (name: string) => void;
  onRemove?: () => void;
  adding: boolean;
  onAdding: (on: boolean) => void;
  picker: ReactNode;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const [renaming, setRenaming] = useState<string | null>(null);
  const label = name || 'No section';
  return (
    <View style={styles.block}>
      {renaming !== null ? (
        <View style={styles.renameRow}>
          <TextInput
            value={renaming}
            onChangeText={setRenaming}
            autoFocus
            maxLength={60}
            accessibilityLabel={`New name for ${label}`}
            style={styles.input}
            onSubmitEditing={() => {
              if (cleanSection(renaming)) onRename(cleanSection(renaming));
              setRenaming(null);
            }}
          />
          <Button
            small
            label="Save"
            accessibilityLabel={`Save the name for ${label}`}
            disabled={!cleanSection(renaming)}
            onPress={() => {
              onRename(cleanSection(renaming));
              setRenaming(null);
            }}
          />
        </View>
      ) : (
        <View style={styles.blockHead}>
          <Pressable onPress={() => setRenaming(name)} accessibilityRole="button" accessibilityLabel={`Rename section ${label}`} style={{ flex: 1 }} hitSlop={6}>
            <Text style={styles.section}>
              {label} <Text style={styles.pencil}>✎</Text>
            </Text>
          </Pressable>
          {onMove ? (
            <View style={styles.tools}>
              <Tool label="↑" a11y={`Move section ${label} up`} disabled={!canMoveUp} onPress={() => onMove(-1)} small />
              <Tool label="↓" a11y={`Move section ${label} down`} disabled={!canMoveDown} onPress={() => onMove(1)} small />
            </View>
          ) : null}
          {onRemove ? <Tool label="✕" a11y={`Remove section ${label}`} onPress={onRemove} small /> : null}
        </View>
      )}
      {children}
      {isNew && !adding ? <Text style={styles.small}>No songs yet. Add the first one.</Text> : null}
      {adding ? (
        <View style={styles.picker}>
          {picker}
          <Button small kind="ghost" label={`Done adding to ${label}`} onPress={() => onAdding(false)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : (
        <Pressable onPress={() => onAdding(true)} accessibilityRole="button" accessibilityLabel={`Add a song to ${label}`} style={styles.addRow} hitSlop={4}>
          <Text style={styles.addText}>+ Add a song to {label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Start a new section: type any name, or tap one of the usual ones. */
function NewSection({ suggestions, empty, onAdd }: { suggestions: string[]; empty: boolean; onAdd: (name: string) => void }) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open && !empty) {
    return <Button kind="ghost" label="+ Add a section" onPress={() => setOpen(true)} />;
  }
  return (
    <Card>
      <Kicker>{empty ? 'Start with a section' : 'Add a section'}</Kicker>
      {suggestions.length ? (
        <View style={styles.wrap}>
          {suggestions.map((x) => (
            <Chip
              key={x}
              label={x}
              on={false}
              onPress={() => {
                onAdd(x);
                setOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.renameRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="Or type a name, e.g. Igbo hymn"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="New section name"
          style={styles.input}
          onSubmitEditing={() => {
            if (!cleanSection(name)) return;
            onAdd(name);
            setName('');
            setOpen(false);
          }}
        />
        <Button
          small
          label="Add"
          accessibilityLabel="Add section"
          disabled={!cleanSection(name)}
          onPress={() => {
            onAdd(name);
            setName('');
            setOpen(false);
          }}
        />
      </View>
      {!empty ? <Button small kind="ghost" label="Cancel" onPress={() => setOpen(false)} style={{ alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

function Tool({ label, a11y, onPress, disabled, small }: { label: string; a11y: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.tool, small && styles.toolSmall, disabled && { opacity: 0.3 }]}
      hitSlop={4}
    >
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

/** Songs to add to one section: the group's repertoire first, or search the whole library. Stays open to add several. */
function SongPicker({ group, items, section, onAdd }: { group: MyGroup; items: OrderItem[]; section: string; onAdd: (song: Song) => Promise<void> }) {
  const styles = useStyles();
  const colors = useColors();
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
    <View style={{ gap: 6 }}>
      <View>
        <Field label={`Find a song for ${section || 'this section'}`} value={query} onChangeText={setQuery} placeholder="Title, composer or words" autoCapitalize="none" returnKeyType="search" />
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
                  onAdd(song)
                    .catch(() => {})
                    .finally(() => setAdding(null));
                }}
              />
            )}
          </View>
        );
      })}
      {q && library.data && !library.data.length ? <Body muted>No songs match “{q}”. Share it from the Songs tab first.</Body> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  block: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  section: { fontFamily: fonts.heavy, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.redDeep },
  pencil: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textTransform: 'none' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
    outlineColor: colors.red,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line },
  ord: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.sand, textAlign: 'center', lineHeight: 26, fontFamily: fonts.heavy, fontSize: 12.5, color: colors.muted, overflow: 'hidden' },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  link: { fontFamily: fonts.heavy, fontSize: 14, color: colors.link },
  tools: { flexDirection: 'row', gap: 4 },
  tool: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  toolSmall: { width: 30, height: 30 },
  toolText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  addRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  addText: { fontFamily: fonts.heavy, fontSize: 14, color: colors.link },
  picker: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 8 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  searchIcon: { position: 'absolute', right: 14, bottom: 16 },
}));
