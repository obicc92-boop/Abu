/**
 * Scan a sheet (docs/scan-plan.md). Pick a PDF or photos of a sol-fa sheet;
 * Abụ finds the lines of music on each page (Haiku, through the Worker),
 * reads every line with its own small model in the browser, and has Haiku
 * check each reading against the picture; a line that still doesn't add up
 * is read again by the strong reader (Opus). Then the person checks each line against its picture,
 * fixes what was misread, plays it, and carries on to the song editor to
 * save it with the original sheet attached. Nothing is saved before that.
 */
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiError, type PickedFile, type ScanLineReading } from '@/api/client';
import { useSongPlayer } from '@/audio/use-song-player';
import { PlayButton } from '@/components/player-controls';
import { SolfaCheck } from '@/components/solfa-check';
import { Body, Button, Card, Chip, ErrorText, Kicker, Page, TopBar } from '@/components/ui';
import { setScanDraft } from '@/scan/draft';
import { joinLines, timeFor } from '@/scan/join';
import { readLineOwn } from '@/scan/own-reader';
import { cutLine, loadPages, MAX_PAGES, pageForFinding, scanningHere } from '@/scan/pages';
import { parseKey, parseSolfa } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TIMES = ['2/4', '3/4', '4/4', '6/8'];
/** Doh names the server accepts, by semitone. */
const KEY_PARAM = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const READING_AT_ONCE = 3;

interface Line {
  id: string;
  page: number;
  parts: string[];
  /** Rows of words in the line, for finding its rows. */
  words: number;
  blob: Blob;
  url: string;
  canvas: unknown;
  width: number;
  height: number;
  /** Abụ's own model's reading, before Haiku checks it. */
  draft: string;
  /** Who read it: Abụ's own reader checked by Haiku, or the strong reader. */
  via?: 'own' | 'strong';
  status: 'waiting' | 'reading' | 'read' | 'failed';
  text: string;
  doubts: { part: string; bar: number }[];
  error?: string;
  checked: boolean;
  skipped: boolean;
}

interface Heading {
  title: string;
  composer: string;
  key: string;
  time: string;
}

export default function ScanScreen() {
  const { status } = useSession();
  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { mode: 'sign-in' } }} />;
  if (!scanningHere) {
    return (
      <Page>
        <TopBar back title="Scan a sheet" />
        <Card>
          <Body>Scanning works in the web app for now. Open abu.adalingo.workers.dev in your phone’s browser to scan a sheet.</Body>
        </Card>
      </Page>
    );
  }
  return <Scanner />;
}

function Scanner() {
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [heading, setHeading] = useState<Heading>({ title: '', composer: '', key: '', time: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const [current, setCurrent] = useState(0);
  const [time, setTime] = useState('4/4');
  const allowance = useQuery({ queryKey: ['scanAllowance'], queryFn: api.scanAllowance, enabled: phase === 'pick' });

  const update = (id: string, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const doh = parseKey(heading.key)?.semitone ?? 0;

  const pick = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: TYPES, multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const files = result.assets;
    const bad = files.find((a) => !TYPES.includes(a.mimeType ?? ''));
    if (bad) return setError('Choose a PDF, or photos (JPEG, PNG or WebP).');
    if (files.some((a) => (a.size ?? 0) > MAX_FILE_BYTES)) return setError('A file is over 20 MB. Try a smaller photo or PDF.');
    if (files.length > 1 && files.some((a) => a.mimeType === 'application/pdf')) return setError('Choose one PDF, or one or more photos.');
    const chosen = files.map((a) => ({ name: a.name, type: a.mimeType ?? '', size: a.size, uri: a.uri, file: a.file }));
    setPicked(chosen);
    await read(chosen);
  };

  /** Reads a line; the text, or null when it failed. Throws only when today's allowance is used up. */
  /**
   * Reads a line: Haiku checks Abụ's own model's reading, and if that still doesn't add up (or there's no
   * reading, or `strong` is asked for) the strong reader reads it from scratch. Throws only when today's
   * allowance is used up.
   */
  const readOne = async (line: Line, head: Heading, time: string, strong = false): Promise<string | null> => {
    update(line.id, { status: 'reading', error: undefined });
    try {
      const semitone = parseKey(head.key)?.semitone;
      const opts = { parts: line.parts, time: time || undefined, key: semitone === undefined ? undefined : KEY_PARAM[semitone] };
      let r: ScanLineReading | null = null;
      let via: Line['via'] = 'strong';
      if (!strong && line.draft) {
        try {
          r = await api.scanCheck(line.blob, { ...opts, draft: line.draft });
          via = 'own';
          if (parseSolfa(r.text, { time }).errors.length) r = null;
        } catch (e) {
          if (e instanceof ApiError && e.status === 429) throw e;
          r = null; // the check failed: the strong reader reads it instead
        }
      }
      if (!r) {
        r = await api.scanLine(line.blob, opts);
        via = 'strong';
      }
      update(line.id, { status: 'read', text: r.text, doubts: r.doubts, checked: false, via });
      return r.text;
    } catch (e) {
      update(line.id, { status: 'failed', error: (e as Error).message });
      if (e instanceof ApiError && e.status === 429) throw e;
      return null;
    }
  };

  const read = async (files: PickedFile[]) => {
    setPhase('reading');
    setLines([]);
    setNote(null);
    try {
      setProgress('Opening the sheet…');
      const blobs = await Promise.all(files.map(async (f) => ({ file: f.file ?? (await (await fetch(f.uri)).blob()), type: f.type })));
      const { pages, more } = await loadPages(blobs);
      if (more) setNote(`Only the first ${MAX_PAGES} pages are read at a time.`);
      const found: Line[] = [];
      let head: Heading = { title: '', composer: '', key: '', time: '' };
      for (let p = 0; p < pages.length; p++) {
        setProgress(pages.length > 1 ? `Finding the lines of music on page ${p + 1} of ${pages.length}…` : 'Finding the lines of music…');
        const small = await pageForFinding(pages[p]);
        const page = await api.scanPage(small.blob, small.width, small.height);
        // The first page's heading; later pages fill in what it left out.
        head = { title: head.title || page.title, composer: head.composer || page.composer, key: head.key || page.key, time: head.time || page.time };
        for (const l of page.lines) {
          const box = { top: l.top * small.scale, bottom: l.bottom * small.scale, left: l.left * small.scale, right: l.right * small.scale };
          const cut = await cutLine(pages[p], box);
          found.push({ id: `${p}-${found.length}`, page: p + 1, parts: l.parts, words: l.words, ...cut, draft: '', status: 'waiting', text: '', doubts: [], checked: false, skipped: false });
        }
        setLines([...found]);
      }
      if (!found.length) {
        setPhase('pick');
        return setError('No lines of sol-fa were found on this sheet. Try a clearer, straighter photo of the whole page.');
      }
      setHeading(head);
      // Abụ's own reader first, on the phone (free); if it can't load, the strong reader reads every line.
      for (let i = 0; i < found.length; i++) {
        setProgress(`Reading line ${i + 1} of ${found.length}…`);
        try {
          found[i].draft = (await readLineOwn(found[i].canvas, found[i].parts, found[i].words)).text;
        } catch {
          found[i].draft = '';
        }
      }
      // The time, as printed or from the bars Abụ's reader found.
      const songTime = timeFor(head.time, found.map((l) => l.draft).filter(Boolean));
      setProgress(`Checking ${found.length} line${found.length === 1 ? '' : 's'} of music…`);
      let next = 0;
      let stopped = false;
      const texts: string[] = [];
      const worker = async () => {
        while (!stopped && next < found.length) {
          const line = found[next++];
          try {
            const text = await readOne(line, head, songTime);
            if (text) texts.push(text);
          } catch (e) {
            // Out of today's allowance: no use trying the other lines.
            stopped = true;
            setNote((e as Error).message);
          }
        }
      };
      await Promise.all(Array.from({ length: READING_AT_ONCE }, worker));
      setTime(timeFor(head.time, texts.length ? texts : found.map((l) => l.draft)));
      setCurrent(0);
      setPhase('review');
    } catch (e) {
      setPhase('pick');
      setError((e as Error).message || 'That sheet couldn’t be opened. Try another file.');
    }
  };

  const finish = () => {
    const kept = lines.filter((l) => !l.skipped && l.text.trim()).map((l) => l.text);
    const sheet = picked[0] ?? null;
    setScanDraft({ title: heading.title, composer: heading.composer, doh, time, solfa: joinLines(kept, time), sheet });
    router.push({ pathname: '/song-editor', params: { from: 'scan' } });
  };

  if (phase === 'pick') {
    return (
      <Page>
        <TopBar back title="Scan a sheet" subtitle="Abụ reads the sol-fa; you check it before saving." />
        <Card>
          <Kicker>How it works</Kicker>
          <Body>1. Choose a PDF of the sheet, or photos of its pages (flat, straight, in good light).</Body>
          <Body>2. Abụ finds each line of music and reads it. This takes a minute or two.</Body>
          <Body>3. You check every line against the picture, fix anything misread, and play it to hear it.</Body>
          <Body>4. Then save it as a song, with the original sheet attached.</Body>
          <Button label="Choose a PDF or photos" onPress={pick} />
          {error ? <ErrorText message={error} /> : null}
          {allowance.data ? (
            <Body muted>
              Today you can scan {allowance.data.pages} more page{allowance.data.pages === 1 ? '' : 's'}.
            </Body>
          ) : null}
        </Card>
        <Card tone="sand">
          <Body muted>Typed sheets read best. Handwritten ones work too, but expect more to fix. Up to {MAX_PAGES} pages at a time.</Body>
        </Card>
      </Page>
    );
  }

  if (phase === 'reading') {
    const read = lines.filter((l) => l.status === 'read').length;
    return (
      <Page>
        <TopBar title="Reading the sheet" subtitle={progress} />
        {note ? <Body muted>{note}</Body> : null}
        {lines.length ? (
          <Card>
            <Kicker>
              {read} of {lines.length} lines read
            </Kicker>
            {lines.map((l, i) => (
              <View key={l.id} style={styles.progressRow}>
                <Image source={{ uri: l.url }} style={[styles.thumb, { aspectRatio: l.width / l.height }]} resizeMode="contain" accessibilityLabel={`Line ${i + 1}`} />
                <Text style={[styles.progressText, l.status === 'failed' && { color: colors.red }]}>
                  {l.status === 'read' ? '✓' : l.status === 'reading' ? 'Reading…' : l.status === 'failed' ? '!' : ''}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Page>
    );
  }

  return (
    <Review
      lines={lines}
      current={current}
      setCurrent={setCurrent}
      heading={heading}
      time={time}
      setTime={setTime}
      doh={doh}
      update={update}
      readAgain={(l) => readOne(l, heading, time, true).catch(() => null)}
      note={note}
      onFinish={finish}
    />
  );
}

interface ReviewProps {
  lines: Line[];
  current: number;
  setCurrent(i: number): void;
  heading: Heading;
  time: string;
  setTime(t: string): void;
  doh: number;
  update(id: string, patch: Partial<Line>): void;
  readAgain(line: Line): Promise<string | null>;
  note: string | null;
  onFinish(): void;
}

function Review({ lines, current, setCurrent, heading, time, setTime, doh, update, readAgain, note, onFinish }: ReviewProps) {
  const line = lines[current];
  const [zoom, setZoom] = useState(true);
  const [width, setWidth] = useState(0);
  const parsed = useMemo(() => parseSolfa(line.text, { time, key: doh }), [line.text, time, doh]);
  const empty = !line.text.trim();
  const player = useSongPlayer(empty || parsed.errors.length ? null : parsed, doh);
  const last = current === lines.length - 1;
  const left = lines.filter((l) => !l.checked && !l.skipped).length;
  const keyName = (k: string) => (parseKey(k) ? k : '');
  // Rows never wrap, so bars stay lined up under each other: the box is as wide as the longest row (and scrolls).
  const textWidth = Math.max(width, ...line.text.split('\n').map((l) => l.length * 8.5 + 34));

  // The picture: tall enough to read the sol-fa (scroll sideways), or fitted to the screen.
  const imgHeight = zoom ? 190 : Math.max(60, (width * line.height) / line.width);
  const imgWidth = zoom ? (imgHeight * line.width) / line.height : width;

  // Moving to another line changes the song, and the player stops by itself.
  const go = (i: number) => setCurrent(Math.max(0, Math.min(lines.length - 1, i)));
  const looksRight = () => {
    update(line.id, { checked: true, skipped: false });
    if (last) onFinish();
    else go(current + 1);
  };

  return (
    <Page>
      <TopBar back title={`Line ${current + 1} of ${lines.length}`} subtitle={`Page ${line.page}. Check it against the picture, then press “Looks right”.`} />
      {note ? <Body muted>{note}</Body> : null}

      <ScrollView horizontal contentContainerStyle={styles.strip} showsHorizontalScrollIndicator={false}>
        {lines.map((l, i) => {
          const mark = l.skipped ? '–' : l.status === 'failed' ? '!' : l.checked ? '✓' : String(i + 1);
          return (
            <Pressable
              key={l.id}
              onPress={() => go(i)}
              accessibilityRole="button"
              accessibilityLabel={`Line ${i + 1}${l.checked ? ', checked' : ''}`}
              style={[styles.dot, i === current && styles.dotOn, l.checked && styles.dotDone]}
            >
              <Text style={[styles.dotText, i === current && { color: colors.white }]}>{mark}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Card>
        <View style={styles.headRow}>
          <Kicker>The sheet</Kicker>
          <Pressable onPress={() => setZoom(!zoom)} accessibilityRole="button">
            <Text style={styles.link}>{zoom ? 'Fit to screen' : 'Zoom in'}</Text>
          </Pressable>
        </View>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Image source={{ uri: line.url }} style={{ width: imgWidth || 1, height: imgHeight }} resizeMode="contain" accessibilityLabel={`The sheet, line ${current + 1}`} />
          </ScrollView>
        </View>
      </Card>

      <Card>
        <View style={styles.headRow}>
          <Kicker>What Abụ read</Kicker>
          {!empty && !parsed.errors.length ? <PlayButton playing={player.playing} onPress={player.togglePlay} size={42} /> : null}
        </View>
        {line.status === 'failed' ? <ErrorText message={line.error ?? 'This line couldn’t be read.'} /> : null}
        {line.via ? <Text style={styles.small}>{line.via === 'own' ? 'Read by Abụ’s own reader, checked by Haiku.' : 'Read by the strong reader.'}</Text> : null}
        {line.doubts.length ? (
          <Body muted>
            Check these first: {line.doubts.map((d) => `${d.part === 'Solo' ? 'solo' : d.part} bar ${d.bar}`).join(', ')}.
          </Body>
        ) : null}
        <ScrollView horizontal>
          <TextInput
            value={line.text}
            onChangeText={(text) => update(line.id, { text, checked: false })}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder={'S  d :r /m :f |\nW  Glo-ry to God'}
            placeholderTextColor="#B3A39A"
            style={[styles.solfa, { width: Math.max(280, textWidth) }]}
            accessibilityLabel={`Sol-fa for line ${current + 1}`}
          />
        </ScrollView>
        <SolfaCheck parsed={parsed} empty={empty} />
        {player.message ? <Body muted>{player.message}</Body> : null}
        <View style={styles.wrap}>
          <Button
            small
            kind="ghost"
            label={line.status === 'reading' ? 'Reading…' : 'Read it again (strong reader)'}
            busy={line.status === 'reading'}
            onPress={() => readAgain(line)}
          />
          <Button
            small
            kind="ghost"
            label={line.skipped ? 'Keep this line' : 'Leave this line out'}
            onPress={() => update(line.id, { skipped: !line.skipped, checked: false })}
          />
        </View>
      </Card>

      <View style={styles.wrap}>
        {current > 0 ? <Button kind="ghost" label="Back" onPress={() => go(current - 1)} /> : null}
        <Button label={last ? 'Looks right: finish' : 'Looks right'} onPress={looksRight} style={{ flex: 1 }} />
      </View>

      <Card tone="sand">
        <Kicker>The whole song</Kicker>
        <View style={styles.group}>
          <Text style={styles.label}>Time</Text>
          <View style={styles.wrap}>
            {TIMES.map((t) => (
              <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} />
            ))}
          </View>
        </View>
        <Body muted>
          {heading.title ? `“${heading.title}”` : 'No title found'}
          {keyName(heading.key) ? `, doh is ${heading.key}` : ''}. You can change these when you save.
        </Body>
        {!keyName(heading.key) ? <Text style={styles.small}>No key was found on the sheet: it plays in C until you choose one when saving.</Text> : null}
        <Button kind="ghost" label={left ? `Save now (${left} line${left === 1 ? '' : 's'} not checked)` : 'Continue to save'} onPress={onFinish} />
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { flex: 1, height: 44, backgroundColor: colors.white, borderRadius: 6 },
  progressText: { width: 64, fontFamily: fonts.bold, fontSize: 13, color: colors.ok, textAlign: 'right' },
  strip: { gap: 6, paddingVertical: 2 },
  dot: { minWidth: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: colors.white },
  dotOn: { backgroundColor: colors.red, borderColor: colors.red },
  dotDone: { borderColor: colors.ok },
  dotText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.red },
  solfa: {
    minHeight: 150,
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { gap: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
