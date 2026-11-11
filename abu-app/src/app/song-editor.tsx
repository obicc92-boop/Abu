/**
 * Add a song, or edit one (?id=...). Type or paste the sol-fa and it's checked
 * as you type; preview and play it before saving; attach the original sheet
 * (PDF or photo). A song can be saved as sheet only.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api, type PickedFile, type Song } from '@/api/client';
import { useSongPlayer } from '@/audio/use-song-player';
import { PlayButton } from '@/components/player-controls';
import { Score } from '@/components/score';
import { SolfaCheck } from '@/components/solfa-check';
import { Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { TAG_GROUPS } from '@/lib/tags';
import { KEY_NAMES, parseSolfa } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

const TIMES = ['2/4', '3/4', '4/4', '6/8'];
const MAX_SHEET_BYTES = 10 * 1024 * 1024;
const EXAMPLE = `[Verse]
S  d :- /d :t1 | l1:s1 /d :r  | m :- /- :-  |
W  All peo-ple that on earth do dwell,
A  s1:- /l1:s1 | m1:m1 /s1:t1 | d :- /- :-  |
T  m :- /f :r  | d :d  /m :r  | s :- /- :-  |
B  d1:- /f1:s1 | l1:m1 /d1:s1 | d1:- /- :-  |`;

export default function SongEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { status } = useSession();
  const existing = useQuery({ queryKey: ['song', id], queryFn: () => api.song(id!), enabled: !!id });
  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { mode: 'sign-in' } }} />;
  if (id && !existing.data) {
    return (
      <Page>
        <TopBar back title="Edit song" />
        {existing.error ? <ErrorText message={existing.error.message} /> : <Loading />}
      </Page>
    );
  }
  return <Editor song={existing.data} />;
}

function Editor({ song }: { song?: Song }) {
  const s = useSession();
  const queryClient = useQueryClient();
  const editing = !!song;
  const choirs = s.groups.filter((g) => g.type !== 'personal' && g.status === 'active');
  const defaultFrom = s.group && s.group.type !== 'personal' && s.group.status === 'active' ? s.group.id : null;

  const [title, setTitle] = useState(song?.title ?? '');
  const [composer, setComposer] = useState(song?.composer ?? '');
  const [doh, setDoh] = useState(song?.doh ?? 0);
  const [time, setTime] = useState(song?.time_signature ?? '4/4');
  const [tags, setTags] = useState<string[]>(song?.tags ?? []);
  const [solfa, setSolfa] = useState(song?.solfa ?? '');
  const [from, setFrom] = useState<string | null>(defaultFrom);
  const [addToRep, setAddToRep] = useState(true);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [removeSheet, setRemoveSheet] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Check as you type, without slowing typing down.
  const text = useDeferredValue(solfa);
  const parsed = useMemo(() => parseSolfa(text, { time, key: doh }), [text, time, doh]);
  const empty = !text.trim();
  const player = useSongPlayer(empty || parsed.errors.length ? null : parsed, doh);

  const fromGroup = choirs.find((g) => g.id === from);
  const canAddToRep = !editing && fromGroup?.role === 'leader';

  const save = useMutation({
    mutationFn: async () => {
      const input = { title: title.trim(), composer: composer.trim(), doh, time_signature: time, tags, solfa };
      const saved = editing ? await api.editSong(song!.id, input) : await api.shareSong({ ...input, shared_from_group: from });
      if (removeSheet && !picked) await api.removeSheet(saved.id);
      if (picked) await api.attachSheet(saved.id, picked);
      if (!editing) {
        if (fromGroup && canAddToRep && addToRep) await api.addToRepertoire(fromGroup.id, saved.id);
        else if (!from && s.personal) await api.addToRepertoire(s.personal.id, saved.id);
      }
      return saved;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['songs'] });
      await queryClient.invalidateQueries({ queryKey: ['repertoire'] });
      await queryClient.invalidateQueries({ queryKey: ['song', saved.id] });
      await queryClient.invalidateQueries({ queryKey: ['songForMe', saved.id] });
      router.replace({ pathname: '/song/[id]', params: { id: saved.id } });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSong(song!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['songs'] });
      router.replace('/songs');
    },
  });

  const pick = async () => {
    setPickError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const a = result.assets[0];
    const type = a.mimeType ?? '';
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(type)) return setPickError('Attach a PDF, or a photo (JPEG, PNG or WebP).');
    if ((a.size ?? 0) > MAX_SHEET_BYTES) return setPickError('That file is over 10 MB. Try a smaller photo or PDF.');
    setPicked({ name: a.name, type, size: a.size, uri: a.uri, file: a.file });
    setRemoveSheet(false);
  };

  const blocked = !title.trim() || (!empty && parsed.errors.length > 0);

  return (
    <Page>
      <TopBar back title={editing ? 'Edit song' : 'Add a song'} subtitle={editing ? song!.title : 'Type or paste the sol-fa; it’s checked as you type.'} />

      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Ekele Diri Chukwu" />
        <Field label="Composer or arranger (optional)" value={composer} onChangeText={setComposer} placeholder="e.g. Arr. N. Eze" />
        <View style={styles.group}>
          <Text style={styles.label}>Key (doh is)</Text>
          <View style={styles.wrap}>
            {KEY_NAMES.map((k, i) => (
              <Chip key={k} label={k} on={doh === i} onPress={() => setDoh(i)} />
            ))}
          </View>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Time</Text>
          <View style={styles.wrap}>
            {TIMES.map((t) => (
              <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} />
            ))}
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.headRow}>
          <Kicker>Sol-fa</Kicker>
          <Pressable onPress={() => setShowHelp(!showHelp)} accessibilityRole="button">
            <Text style={styles.link}>{showHelp ? 'Hide help' : 'How to write it'}</Text>
          </Pressable>
        </View>
        {showHelp ? <Help onExample={() => setSolfa(EXAMPLE)} /> : null}
        <TextInput
          value={solfa}
          onChangeText={setSolfa}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder={'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God on high'}
          placeholderTextColor="#B3A39A"
          style={styles.solfa}
          accessibilityLabel="Sol-fa"
        />
        <SolfaCheck parsed={parsed} empty={empty} />
      </Card>

      {!empty && parsed.errors.length === 0 ? (
        <Card>
          <View style={styles.headRow}>
            <Kicker>Preview</Kicker>
            <PlayButton playing={player.playing} onPress={player.togglePlay} size={46} />
          </View>
          {player.message ? <Body muted>{player.message}</Body> : null}
          <Score song={parsed} activeBeat={player.beat} />
        </Card>
      ) : null}

      <Card>
        <Kicker>Tags</Kicker>
        {TAG_GROUPS.map((g) => (
          <View key={g.label} style={styles.group}>
            <Text style={styles.label}>{g.label}</Text>
            <View style={styles.wrap}>
              {g.tags.map((t) => (
                <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
              ))}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Kicker>Original sheet (optional)</Kicker>
        <Body muted>A PDF or a photo of the printed sheet, so members can see the original. Up to 10 MB.</Body>
        {picked ? (
          <Body>Attaching: {picked.name}</Body>
        ) : song?.sheet_key && !removeSheet ? (
          <Body>A sheet is attached.</Body>
        ) : null}
        <View style={styles.wrap}>
          <Button small kind="ghost" label={picked || song?.sheet_key ? 'Choose another file' : 'Attach PDF or photo'} onPress={pick} />
          {picked ? <Button small kind="ghost" label="Don’t attach" onPress={() => setPicked(null)} /> : null}
          {!picked && song?.sheet_key && !removeSheet ? <Button small kind="danger" label="Remove the sheet" onPress={() => setRemoveSheet(true)} /> : null}
        </View>
        {pickError ? <ErrorText message={pickError} /> : null}
      </Card>

      {!editing ? (
        <Card>
          <Kicker>Shared by</Kicker>
          <View style={styles.wrap}>
            {choirs.map((g) => (
              <Chip key={g.id} label={g.name} on={from === g.id} onPress={() => setFrom(g.id)} />
            ))}
            <Chip label="Just me" on={from === null} onPress={() => setFrom(null)} />
          </View>
          <Body muted>
            {from ? 'Everyone in the group can fix the sol-fa later.' : 'Saved to My songs. Every song on Abụ is open to everyone.'}
          </Body>
          {canAddToRep ? (
            <View style={styles.toggle}>
              <Text style={styles.toggleText}>Add to our repertoire</Text>
              <Switch
                value={addToRep}
                onValueChange={setAddToRep}
                accessibilityLabel="Add to our repertoire"
                trackColor={{ false: colors.switchOff, true: colors.red }}
                thumbColor={colors.white}
                {...({ activeThumbColor: colors.white } as object)}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {save.error ? <ErrorText message={save.error.message} /> : null}
      <Button label={editing ? 'Save changes' : 'Save song'} onPress={() => save.mutate()} disabled={blocked} busy={save.isPending} />
      {blocked && title.trim() ? <Body muted style={{ textAlign: 'center' }}>Fix the sol-fa problems above to save.</Body> : null}

      {editing ? (
        confirmDelete ? (
          <Card tone="sand">
            <Body>Delete “{song!.title}” for everyone? This can’t be undone.</Body>
            {remove.error ? <ErrorText message={remove.error.message} /> : null}
            <View style={styles.wrap}>
              <Button small kind="danger" label="Yes, delete it" onPress={() => remove.mutate()} busy={remove.isPending} />
              <Button small kind="ghost" label="Keep it" onPress={() => setConfirmDelete(false)} />
            </View>
          </Card>
        ) : (
          <Button kind="danger" label="Delete this song" onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </Page>
  );
}

function Help({ onExample }: { onExample: () => void }) {
  const rules = [
    'Start each line with the part: S, A, T, B or Solo. A W line under a part holds its words.',
    ': between beats, / for the half-bar accent, | between bars.',
    '. splits a beat in two (s.l); , splits a half beat (d.,r).',
    '- holds a note on; an empty beat or x is a rest.',
    'd\' is the high doh and t1 the low ti (d¹ and t₁ work too).',
    '[Verse] or [Chorus] on its own line starts a section.',
    'Write tenor as on the sheet; Abụ plays it an octave lower.',
  ];
  return (
    <View style={styles.help}>
      {rules.map((r) => (
        <Text key={r} style={styles.helpText}>
          • {r}
        </Text>
      ))}
      <Button small kind="ghost" label="Fill in an example" onPress={onExample} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.red },
  solfa: {
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.sand,
    padding: 12,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
    textAlignVertical: 'top',
    outlineColor: colors.red,
  },
  help: { backgroundColor: colors.sand, borderRadius: 12, padding: 12, gap: 4 },
  helpText: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.ink },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
});
