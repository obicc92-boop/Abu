/**
 * Add a song, or edit one (?id=...). Type or paste the sol-fa and it's checked
 * as you type; preview and play it before saving; attach the original sheet
 * (PDF or photo). A song can be saved as sheet only. After scanning a sheet
 * (?from=scan) it opens with what was read and checked, and the sheet attached.
 * From Write it (?from=write) it's step 2 of 2, the page for writing the music,
 * after the song's details (src/app/write.tsx): it opens on a first line of
 * music with the sol-fa keys up, and what's written is kept until it's saved
 * (src/lib/new-song.ts). The page reads top to bottom as the work goes (owner's
 * request, 21 November 2026): the song (title, key, time, with Change), the
 * sol-fa, the preview, then what goes with saving it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Switch, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { api, type PickedFile, type Song } from '@/api/client';
import { useSongPlayer } from '@/audio/use-song-player';
import { PlayButton } from '@/components/player-controls';
import { Score } from '@/components/score';
import { SolfaCheck } from '@/components/solfa-check';
import { keysJustTouched, PhoneKeyboardBar, SolfaKeypad, type KeyPlace } from '@/components/solfa-keypad';
import { SongRows, type ActiveRow } from '@/components/song-rows';
import { keepCursor, placeCursor } from '@/lib/field-cursor';
import { applyKey, keyChangePlace, songLowMarksShown, songLowMarksTyped, withKeyChange, type Key, type Selection } from '@/lib/solfa-keys';
import { ChevronIcon } from '@/components/icons';
import { Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, Steps, TopBar } from '@/components/ui';
import { clearNewSong, hasMusic, isFirstPageOpen, NEW_SONG_PARTS, newSong, setNewSong, WRITE_STEPS, type NewSong } from '@/lib/new-song';
import { musicPiece, songPieces, withKeyBefore, withNewLine, withRow } from '@/lib/song-pieces';
import { TAG_GROUPS } from '@/lib/tags';
import { takePastedDraft } from '@/lib/paste-draft';
import { clearScanDraft, scanDraft, type ScanDraft } from '@/scan/draft';
import { tidyNotes } from '@/scan/line-text';
import { forgetScan } from '@/scan/saved';
import { KEY_NAMES, parseSolfa } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

const TIMES = ['2/4', '3/4', '4/4', '6/8'];
const MAX_SHEET_BYTES = 10 * 1024 * 1024;
const EXAMPLE = `[Verse]
S  d :- /d :t1 | l1:s1 /d :r  | m :- /- :-  |
W  All peo-ple that on earth do dwell,
A  s1:- /l1:s1 | m1:m1 /s1:t1 | d :- /- :-  |
T  m :- /f :r  | d :d  /m :r  | s :- /- :-  |
B  d1:- /f1:s1 | l1:m1 /d1:s1 | d1:- /- :-  |`;

export default function SongEditorScreen() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  // A song from a scan, or pasted on the Paste sol-fa screen (src/app/paste.tsx).
  const [draft] = useState(() => (id ? null : from === 'scan' ? scanDraft() : from === 'paste' ? takePastedDraft() : null));
  // A song being written from Write it: its details from step 1, and what's written so far.
  const [written] = useState(() => (!id && from === 'write' ? newSong() : null));
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
  return <Editor song={existing.data} draft={draft} pasted={from === 'paste'} written={written} />;
}

function Editor({ song, draft, pasted, written }: { song?: Song; draft: ScanDraft | null; pasted: boolean; written: NewSong | null }) {
  const styles = useStyles();
  const colors = useColors();
  const s = useSession();
  const queryClient = useQueryClient();
  const editing = !!song;
  const choirs = s.groups.filter((g) => g.type !== 'personal' && g.status === 'active');
  const defaultFrom = s.group && s.group.type !== 'personal' && s.group.status === 'active' ? s.group.id : null;

  const [title, setTitle] = useState(song?.title ?? draft?.title ?? written?.title ?? '');
  const [composer, setComposer] = useState(song?.composer ?? draft?.composer ?? written?.composer ?? '');
  const [doh, setDoh] = useState(song?.doh ?? draft?.doh ?? written?.doh ?? 0);
  const [time, setTime] = useState(song?.time_signature ?? draft?.time ?? written?.time ?? '4/4');
  const [tags, setTags] = useState<string[]>(song?.tags ?? []);
  // A new song from Write it starts with a line of music with a row for each part chosen, and the first row
  // ready to write in; carried on with, it's as it was left.
  const [fresh] = useState(() => !!written && !hasMusic(written.solfa));
  const [solfa, setSolfa] = useState(
    () => song?.solfa ?? draft?.solfa ?? (written ? (fresh ? withNewLine('', written.parts.length ? written.parts : NEW_SONG_PARTS) : written.solfa) : ''),
  );
  // Kept as it's written, until it's saved.
  useEffect(() => {
    if (written) setNewSong({ title, composer, doh, time, solfa });
  }, [written, title, composer, doh, time, solfa]);
  // The song's details: shown as a line with Change, or open to change them (open at first where there's no
  // title yet, and for a scan, whose title, key and time are to be checked).
  const [details, setDetails] = useState(() => (!!draft && !pasted) || !(song?.title ?? draft?.title ?? written?.title ?? '').trim());
  const [showTags, setShowTags] = useState(false);
  const [showSheet, setShowSheet] = useState(!!draft?.sheet);
  // The sol-fa is written in rows, one for each part by its colour, as on Check the reading (owner's request,
  // 20 November 2026), or as text ("Edit as text", for pasting). Either way with the sol-fa keypad; "ABC" swaps
  // in the phone's keyboard, with a bar over it to come back.
  const [asText, setAsText] = useState(false);
  const field = useRef<TextInputInstance | null>(null);
  const [writing, setWriting] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  // In rows: the row being typed in, and each row's field (by line of music and row).
  const [active, setActive] = useState<ActiveRow | null>(null);
  const rowFields = useRef(new Map<string, TextInputInstance | null>());
  const activeField = () => (active ? (rowFields.current.get(`${active.line}:${active.row}`) ?? null) : null);
  const activePart = (() => {
    if (!active) return null;
    const pieces = songPieces(solfa);
    const p = pieces[musicPiece(pieces, active.line)];
    return p?.kind === 'music' ? (p.rows[active.row]?.part ?? null) : null;
  })();
  /** The field being written in: the text box, or the row. */
  const current = () => (asText ? field.current : activeField());
  /** The text as a key left it, with the cursor where the key put it. */
  const write = (next: { text: string; sel: Selection }) => {
    setSolfa(next.text);
    setSel(next.sel);
    const f = field.current;
    if (f && !f.isFocused()) f.focus();
    requestAnimationFrame(() => placeCursor(f, next.sel));
  };
  const pressKey = (key: Key) => {
    if (asText) return write(applyKey(solfa, sel, key));
    if (!active) return;
    // A row: what it shows as typed, and the song's text with the row changed.
    const next = applyKey(active.value, sel, key);
    const pieces = songPieces(solfa);
    setActive({ ...active, value: next.text });
    setSolfa(withRow(solfa, musicPiece(pieces, active.line), active.row, activePart ? tidyNotes(next.text) : next.text));
    setSel(next.sel);
    const f = activeField();
    if (f && !f.isFocused()) f.focus();
    requestAnimationFrame(() => placeCursor(f, next.sel));
  };
  /** The phone's keyboard in place of the keypad, or back: the field is focused again to bring it up or put it away. */
  const switchKeys = (phone: boolean) => {
    const f = current();
    setKeyboard(phone);
    f?.blur();
    setTimeout(() => f?.focus(), 50);
  };
  const stopWriting = () => {
    current()?.blur();
    setWriting(false);
    setActive(null);
    setKeyboard(false);
  };
  // A key change (owner's request, 20 November 2026, made simpler the same evening): "Key" says plainly where it
  // starts (the first bar of the line of music being written, or in text, of the lines the cursor is in), and
  // the key there now; at the song's start it's the song's own key.
  const keyChange = {
    where: (): KeyPlace => {
      let upTo: number;
      if (asText) upTo = keyChangePlace(solfa, sel.start).at;
      else {
        const pieces = songPieces(solfa);
        const p = pieces[musicPiece(pieces, active?.line ?? 0)];
        upTo = p?.kind === 'music' ? solfa.split('\n').slice(0, p.from).join('\n').length : 0;
      }
      const before = parseSolfa(solfa.slice(0, upTo), { time, key: doh });
      const bars = Math.max(0, ...Object.values(before.events).flatMap((events) => events.map((e) => e.bar)));
      const now = before.keyChanges.at(-1)?.key ?? before.meta.key;
      return { bar: bars ? bars + 1 : null, doh: now?.name ?? KEY_NAMES[doh] };
    },
    pick: (name: string) => {
      const { bar } = keyChange.where();
      const songKey = () => setDoh(Math.max(0, KEY_NAMES.indexOf(name as (typeof KEY_NAMES)[number])));
      if (asText) {
        if (!bar) songKey();
        // The song's key: a key line already at the top is changed too, so the two agree.
        if (bar || keyChangePlace(solfa, sel.start).existing) write(withKeyChange(solfa, sel, name));
        return;
      }
      const pieces = songPieces(solfa);
      const at = musicPiece(pieces, active?.line ?? 0);
      if (!bar) {
        songKey();
        if (pieces[at - 1]?.kind === 'key') setSolfa(withKeyBefore(solfa, at, name));
        return;
      }
      setSolfa(withKeyBefore(solfa, at, name));
    },
  };
  const withKeys = writing && !keyboard;
  const [from, setFrom] = useState<string | null>(defaultFrom);
  const [addToRep, setAddToRep] = useState(true);
  const [picked, setPicked] = useState<PickedFile | null>(draft?.sheet ?? null);
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
      if (written) clearNewSong();
      if (draft) {
        clearScanDraft();
        // The scan is done with: no longer offered to carry on with.
        if (draft.scanId) void forgetScan(draft.scanId);
      }
      await queryClient.invalidateQueries({ queryKey: ['songs'] });
      await queryClient.invalidateQueries({ queryKey: ['repertoire'] });
      await queryClient.invalidateQueries({ queryKey: ['song', saved.id] });
      await queryClient.invalidateQueries({ queryKey: ['songForMe', saved.id] });
      const home = { pathname: '/song/[id]', params: { id: saved.id } } as const;
      // An edit goes back to the song's page it came from (fetched afresh), so Back from there leaves the song;
      // from Write it, step 1 is under this page: both make way for the song.
      if (editing && router.canGoBack()) router.back();
      else if (written && isFirstPageOpen()) {
        router.dismiss(2);
        router.push(home);
      } else router.replace(home);
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
  const why = !title.trim() ? 'Give the song a title to save it: tap Change at the top.' : blocked ? 'Fix the sol-fa problems above to save.' : null;

  return (
    <Page
      footer={
        asText ? (
          withKeys ? (
            <SolfaKeypad parts keyChange={keyChange} onKey={pressKey} onKeyboard={() => switchKeys(true)} onDone={stopWriting} />
          ) : writing && keyboard ? (
            <PhoneKeyboardBar onSolfaKeys={() => switchKeys(false)} onDone={stopWriting} />
          ) : undefined
        ) : active && activePart ? (
          keyboard ? (
            <PhoneKeyboardBar onSolfaKeys={() => switchKeys(false)} onDone={stopWriting} />
          ) : (
            <SolfaKeypad keyChange={keyChange} onKey={pressKey} onKeyboard={() => switchKeys(true)} onDone={stopWriting} />
          )
        ) : undefined
      }
    >
      <TopBar
        back
        title={editing ? 'Edit song' : written ? 'Write the music' : draft && !pasted ? 'Save the scanned song' : 'Add a song'}
        subtitle={
          editing
            ? song!.title
            : written
              ? 'Each part in its own row, with the sol-fa keys. Every bar is checked as you go.'
              : draft && !pasted
                ? 'Check the title, key and time, then save.'
                : pasted
                  ? 'Check what you pasted, then save.'
                  : 'Type or paste the sol-fa; it’s checked as you type.'
        }
      />
      {written ? <Steps at={2} names={WRITE_STEPS} /> : null}

      <Card>
        <View style={styles.headRow}>
          {details ? (
            <Kicker>The song</Kicker>
          ) : (
            <View style={styles.titleBox}>
              <Text style={[styles.songTitle, !title.trim() && styles.untitled]} numberOfLines={2}>
                {title.trim() || 'No title yet'}
              </Text>
              {composer.trim() ? (
                <Text style={styles.songSub} numberOfLines={1}>
                  {composer.trim()}
                </Text>
              ) : null}
            </View>
          )}
          <Button
            small
            kind="ghost"
            label={details ? 'Done' : 'Change'}
            onPress={() => setDetails(!details)}
            accessibilityLabel={details ? 'Done with the song’s details' : 'Change the title, key or time'}
          />
        </View>
        {details ? (
          <>
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
          </>
        ) : (
          <View style={styles.wrap}>
            <View style={styles.fact}>
              <Text style={styles.factText}>Doh is {KEY_NAMES[doh]}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factText}>{time}</Text>
            </View>
          </View>
        )}
      </Card>

      <Card>
        <View style={styles.headRow}>
          <Kicker>Sol-fa</Kicker>
          <View style={styles.links}>
            <Pressable onPress={() => setShowHelp(!showHelp)} accessibilityRole="button">
              <Text style={styles.link}>{showHelp ? 'Hide help' : 'Help'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                stopWriting();
                setAsText(!asText);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.link}>{asText ? 'Edit in rows' : 'Edit as text'}</Text>
            </Pressable>
          </View>
        </View>
        {showHelp ? <Help asText={asText} onExample={() => setSolfa(EXAMPLE)} /> : null}
        {!asText ? (
          <SongRows
            focusFirst={fresh}
            text={solfa}
            time={time}
            doh={doh}
            active={active}
            keyboard={keyboard}
            onActive={(row) => {
              if (row && (!active || active.line !== row.line || active.row !== row.row)) setKeyboard(false);
              setActive(row);
            }}
            onLeave={(line, row) => setActive((a) => (a && a.line === line && a.row === row ? null : a))}
            onChange={setSolfa}
            onSelection={setSel}
            onField={(line, row, f) => {
              rowFields.current.set(`${line}:${row}`, f);
            }}
          />
        ) : null}
        {asText ? <TextInput
          ref={field}
          // The parts' low octave marks shown as on a sheet, t₁ for t1; the text keeps t1.
          value={songLowMarksShown(solfa)}
          onChangeText={(t) => {
            const typed = songLowMarksTyped(t);
            setSolfa(typed);
            keepCursor(field.current, t, songLowMarksShown(typed));
          }}
          onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
          onFocus={() => {
            if (writing) return;
            setKeyboard(false);
            setWriting(true);
            // In sight above the keypad, once it's up.
            setTimeout(() => (field.current as unknown as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 150);
          }}
          onBlur={() => {
            // Left, unless it has the focus again straight away (switching keyboards), or the keys were just
            // touched (the focus goes back to it).
            setTimeout(() => {
              if (field.current?.isFocused()) return;
              if (keysJustTouched()) field.current?.focus();
              else stopWriting();
            }, 120);
          }}
          inputMode={withKeys ? 'none' : 'text'}
          showSoftInputOnFocus={!withKeys}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder={'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God on high'}
          placeholderTextColor={colors.placeholder}
          style={styles.solfa}
          accessibilityLabel="Sol-fa"
        /> : null}
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
        <Kicker>Before you save</Kicker>
        {!editing ? (
          <View style={styles.group}>
            <Text style={styles.label}>Shared by</Text>
            <View style={styles.wrap}>
              {choirs.map((g) => (
                <Chip key={g.id} label={g.name} on={from === g.id} onPress={() => setFrom(g.id)} />
              ))}
              <Chip label="Just me" on={from === null} onPress={() => setFrom(null)} />
            </View>
            <Body muted>
              {from ? 'Everyone in the group can fix the sol-fa later.' : 'Saved to My songs. Every song on SolfaScores is open to everyone.'}
            </Body>
            {canAddToRep ? (
              <View style={styles.toggle}>
                <Text style={styles.toggleText}>Add to our repertoire</Text>
                <Switch
                  value={addToRep}
                  onValueChange={setAddToRep}
                  accessibilityLabel="Add to our repertoire"
                  trackColor={{ false: colors.switchOff, true: colors.primary }}
                  thumbColor={colors.onPrimary}
                  {...({ activeThumbColor: colors.onPrimary } as object)}
                />
              </View>
            ) : null}
          </View>
        ) : null}
        <Folding label="Tags (optional)" value={tags.length ? tags.join(', ') : 'None yet'} open={showTags} onToggle={() => setShowTags(!showTags)}>
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
        </Folding>
        <Folding
          label="Original sheet (optional)"
          value={picked ? picked.name : song?.sheet_key && !removeSheet ? 'Attached' : 'None'}
          open={showSheet}
          onToggle={() => setShowSheet(!showSheet)}
        >
          <Body muted>A PDF or a photo of the printed sheet, so members can see the original. Up to 10 MB.</Body>
          {picked ? <Body>Attaching: {picked.name}</Body> : song?.sheet_key && !removeSheet ? <Body>A sheet is attached.</Body> : null}
          <View style={styles.wrap}>
            <Button small kind="ghost" label={picked || song?.sheet_key ? 'Choose another file' : 'Attach PDF or photo'} onPress={pick} />
            {picked ? <Button small kind="ghost" label="Don’t attach" onPress={() => setPicked(null)} /> : null}
            {!picked && song?.sheet_key && !removeSheet ? <Button small kind="danger" label="Remove the sheet" onPress={() => setRemoveSheet(true)} /> : null}
          </View>
          {pickError ? <ErrorText message={pickError} /> : null}
        </Folding>
      </Card>

      {save.error ? <ErrorText message={save.error.message} /> : null}
      <Button label={editing ? 'Save changes' : 'Save song'} onPress={() => save.mutate()} disabled={blocked} busy={save.isPending} style={styles.big} />
      {why ? <Body muted style={{ textAlign: 'center' }}>{why}</Body> : null}

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

/** A part of the page folded to one line (its name and what's chosen), opened with a tap. */
function Folding({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.folding}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={label} style={styles.foldHead}>
        <View style={styles.titleBox}>
          <Text style={styles.foldLabel}>{label}</Text>
          {!open ? (
            <Text style={styles.foldValue} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
        </View>
        <View style={open ? styles.chevronOpen : null}>
          <ChevronIcon color={colors.faint} />
        </View>
      </Pressable>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

function Help({ asText, onExample }: { asText: boolean; onExample: () => void }) {
  const styles = useStyles();
  const rules = [
    asText
      ? 'Start each line with the part: S, A, T, B or Solo. A W line under a part holds its words.'
      : 'Each line of music has a row for each part, by its colour, and rows of words under them. Tap a row to write in it with the sol-fa keys.',
    ': between beats, / for the half-bar accent, | between bars.',
    '. splits a beat in two (s.l); , splits a half beat (d.,r).',
    '- holds a note on; an empty beat or x is a rest.',
    'd\' is the high doh and t1 the low ti (d¹ and t₁ work too).',
    ...(asText ? ['[Verse] or [Chorus] on its own line starts a section.'] : []),
    asText
      ? 'Key change: tap Key on the keypad and pick the new doh. It starts at the first bar of the lines you’re in, and shows as “Doh is F”. (Bridge notes as printed, s=d, work too.)'
      : 'Key change: while writing in a line, tap Key on the keypad and pick the new doh. It starts at that line’s first bar.',
    'Write tenor as on the sheet; SolfaScores plays it an octave lower.',
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

const useStyles = makeStyles((colors) => ({
  group: { gap: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.link },
  links: { flexDirection: 'row', gap: 16 },
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
    outlineColor: colors.primary,
    // Rows don't wrap (bars stay lined up under each other); the box scrolls sideways instead.
    ...({ whiteSpace: 'pre', overflowX: 'auto' } as object),
  },
  help: { backgroundColor: colors.sand, borderRadius: 12, padding: 12, gap: 4 },
  helpText: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.ink },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleBox: { flex: 1, minWidth: 0 },
  songTitle: { fontFamily: fonts.heavy, fontSize: 19, lineHeight: 24, color: colors.ink },
  untitled: { color: colors.muted },
  songSub: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 1 },
  fact: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 5 },
  factText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  folding: { borderTopWidth: 1, borderTopColor: colors.line },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  foldLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  foldValue: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, marginTop: 1 },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  foldBody: { gap: 10, paddingBottom: 12 },
  big: { minHeight: 56 },
  toggleText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
}));
