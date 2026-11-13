/**
 * Scan a sheet (docs/scan-plan.md), in four steps:
 *
 * 1. Choose: take photos of the pages or choose a PDF or photos; the pages
 *    show as thumbnails to add to or remove before reading, with how many
 *    voice parts the sheet has.
 * 2. Reading, the app doing all it can before any AI:
 *    - a typed PDF is read from its own text (free, instant, exact);
 *    - on photos and scans, the lines are found by where the ink is and read
 *      by Abụ's own model in the browser, and rows of words are read by
 *      Cloudflare's reader (Abụ's model reads only notes);
 *    - a line that passes Abụ's checker is kept as read. Only a line that
 *      fails goes to an AI: Cloudflare's reader, then Claude if the Worker
 *      has a key (Haiku checks, Opus reads from scratch), and an AI's answer
 *      is kept only if it passes. Otherwise the person fixes the line.
 * 3. Check: one line at a time, the picture above each part's row (they
 *    scroll sideways together), problems under the row they're in, play,
 *    read again, leave out, and "Looks right".
 * 4. Finish: what's checked, then the song editor with the original sheet
 *    attached. Nothing is saved before Save.
 */
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type PickedFile, type ScanLineReading } from '@/api/client';
import { useSongPlayer } from '@/audio/use-song-player';
import { AgainIcon, CameraIcon, CheckIcon, CloseIcon, FileIcon, PlusIcon, ScanIcon, ZoomIcon } from '@/components/icons';
import { PlayButton } from '@/components/player-controls';
import { Body, Button, Card, Chip, ErrorText, Kicker, MAX_WIDTH, Page, TopBar } from '@/components/ui';
import { setScanDraft } from '@/scan/draft';
import { joinLines, timeFor } from '@/scan/join';
import { joinLine, problemsByPart, splitLine, tidyTitle, withoutNameColumn, withWords, wordsOf, type LineRow, type LineWords } from '@/scan/line-text';
import { findLinesOwn, readLineOwn } from '@/scan/own-reader';
import { cutLine, loadPages, MAX_PAGES, pageForFinding, scanningHere, takePhoto } from '@/scan/pages';
import { readTypedSheet, type PageText } from '@/scan/pdf-text';
import type { Box, FoundLine } from '@/scan/types';
import { parseKey, parseSolfa, partName } from '@/solfa';
import { useSession } from '@/state/session';
import { colors, fonts, partColor, partLetter } from '@/theme/tokens';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TIMES = ['2/4', '3/4', '4/4', '6/8'];
/** Doh names the server accepts, by semitone. */
const KEY_PARAM = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const READING_AT_ONCE = 3;
/** Voice parts in each line, for photos and scans (0: Abụ works it out). Most choir sheets are SATB. */
const PART_CHOICES: { n: number; label: string }[] = [
  { n: 4, label: '4 · SATB' },
  { n: 3, label: '3' },
  { n: 2, label: '2' },
  { n: 1, label: '1' },
  { n: 0, label: 'Not sure' },
];
const BLANK_PAGE: PageText = { width: 1, height: 1, chars: [], segs: [], across: [], music: 0, pictured: 1 };

/** The AI readers the Worker has, in the order they're tried. */
interface Readers {
  cloudflare: boolean;
  anthropic: boolean;
}
/** Width of a character in the rows' monospace type, for sizing them so they never wrap. */
const CHAR = 8.6;
const ROW_HEIGHT = 42;

interface Line {
  id: string;
  /** The page it's on, counting from 1 (and from 0 in `pageIndex`). */
  page: number;
  pageIndex: number;
  parts: string[];
  /** Rows of words in the line, for finding its rows. */
  words: number;
  /** Where its rows of words are on the page (photos and scans), to read them. */
  wordRows: FoundLine['wordRows'];
  /** Its words, kept in place under their parts whoever reads the notes. */
  wordTexts: LineWords[];
  blob: Blob;
  url: string;
  canvas: unknown;
  width: number;
  height: number;
  /** What the app read itself: from the PDF's text, or with Abụ's own model. */
  draft: string;
  /** Who read it: the PDF's text, Abụ's own reader, or an AI that corrected it. */
  via?: 'text' | 'own' | 'cloudflare' | 'haiku' | 'strong';
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

/** A chosen file, with a picture of it for the tray (photos only). */
interface Chosen extends PickedFile {
  preview?: string;
}

type Stage = 'finding' | 'reading' | 'checking';

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
  const [phase, setPhase] = useState<'choose' | 'reading' | 'check' | 'finish'>('choose');
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('finding');
  const [done, setDone] = useState({ n: 0, of: 1 });
  const [note, setNote] = useState<string | null>(null);
  const [heading, setHeading] = useState<Heading>({ title: '', composer: '', key: '', time: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const [current, setCurrent] = useState(0);
  const [time, setTime] = useState('4/4');
  const [partsWanted, setPartsWanted] = useState(4);
  const [readers, setReaders] = useState<Readers>({ cloudflare: false, anthropic: false });
  const allowance = useQuery({ queryKey: ['scanAllowance'], queryFn: api.scanAllowance, enabled: phase === 'choose' });

  const update = (id: string, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const doh = parseKey(heading.key)?.semitone ?? 0;
  const hasPdf = chosen.some((c) => c.type === 'application/pdf');

  const add = (files: Chosen[]) => {
    setError(null);
    if (files.some((f) => !TYPES.includes(f.type))) return setError('Choose a PDF, or photos (JPEG, PNG or WebP).');
    if (files.some((f) => (f.size ?? 0) > MAX_FILE_BYTES)) return setError('A file is over 20 MB. Try a smaller photo or PDF.');
    const all = [...chosen, ...files];
    if (all.length > 1 && all.some((f) => f.type === 'application/pdf')) return setError('Choose one PDF, or photos of the pages (not both).');
    if (all.length > MAX_PAGES) return setError(`Up to ${MAX_PAGES} pages at a time.`);
    setChosen(all.map((f) => ({ ...f, preview: f.preview ?? (f.type.startsWith('image/') && f.file ? URL.createObjectURL(f.file) : undefined) })));
  };

  const choose = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: TYPES, multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    add(result.assets.map((a) => ({ name: a.name, type: a.mimeType ?? '', size: a.size, uri: a.uri, file: a.file })));
  };

  const photo = async () => {
    const file = await takePhoto();
    if (file) add([{ name: file.name || `Page ${chosen.length + 1}.jpg`, type: file.type || 'image/jpeg', size: file.size, uri: '', file }]);
  };

  /**
   * A line's reading, with AI only as the last resort. A reading that passes Abụ's checker is kept as it is
   * (the AIs broke more right lines than they fixed when sent every line). One that fails, or one the
   * person asks to read again, goes to Cloudflare's reader, then Claude if the Worker has a key (Haiku
   * checks it, Opus reads it from scratch); an answer is kept only if it passes. Otherwise the line keeps
   * the app's own reading for the person to fix. Throws only when today's allowance is used up.
   */
  const readOne = async (line: Line, head: Heading, songTime: string, ai: Readers, again = false): Promise<string> => {
    const passes = (t: string) => splitLine(t).some((r) => r.part && r.text.trim()) && !parseSolfa(t, { time: songTime }).errors.length;
    let own = withWords(line.draft, line.wordTexts);
    // Free repairs first: a column of part names read as notes.
    const named = !passes(own) && withoutNameColumn(own);
    if (named && passes(named)) own = named;
    if (!again && passes(own)) {
      update(line.id, { status: 'read', text: own, checked: false });
      return own;
    }
    update(line.id, { status: 'reading', error: undefined });
    const semitone = parseKey(head.key)?.semitone;
    const opts = { parts: line.parts, time: songTime || undefined, key: semitone === undefined ? undefined : KEY_PARAM[semitone] };
    const draft = (again && line.text) || own;
    const tries: [NonNullable<Line['via']>, () => Promise<ScanLineReading>][] = [];
    if (ai.cloudflare && draft.trim()) tries.push(['cloudflare', () => api.scanFix(line.blob, { ...opts, draft })]);
    if (ai.anthropic && draft.trim()) tries.push(['haiku', () => api.scanCheck(line.blob, { ...opts, draft })]);
    if (ai.anthropic) tries.push(['strong', () => api.scanLine(line.blob, opts)]);
    let problem = '';
    for (const [via, ask] of tries) {
      try {
        const r = await ask();
        const text = withWords(r.text, line.wordTexts);
        if (passes(text)) {
          update(line.id, { status: 'read', text, doubts: r.doubts, checked: false, via });
          return text;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 429) {
          update(line.id, { status: draft.trim() ? 'read' : 'failed', text: draft, error: e.message });
          throw e;
        }
        problem = (e as Error).message;
      }
    }
    // Nothing better: the line keeps the app's own reading, for the person to fix.
    const text = again ? draft : own;
    update(line.id, {
      status: text.trim() ? 'read' : 'failed',
      text,
      checked: false,
      error: text.trim() ? undefined : problem || 'This line couldn’t be read. Type it in, or leave it out.',
    });
    return text;
  };

  const read = async () => {
    setPhase('reading');
    setLines([]);
    setNote(null);
    setStage('finding');
    setDone({ n: 0, of: 1 });
    try {
      const ai: Readers = (await api.scanAllowance().catch(() => null))?.readers ?? { cloudflare: false, anthropic: false };
      setReaders(ai);
      const blobs = await Promise.all(chosen.map(async (f) => ({ file: f.file ?? (await (await fetch(f.uri)).blob()), type: f.type })));
      const { pages, more } = await loadPages(blobs);
      if (more) setNote(`Only the first ${MAX_PAGES} pages are read at a time.`);
      const found: Line[] = [];
      let head: Heading = { title: '', composer: '', key: '', time: '' };
      const add = async (p: number, box: Box, l: { parts: string[]; words: number; wordRows?: FoundLine['wordRows']; text?: string }) => {
        const cut = await cutLine(pages[p], box);
        const text = l.text ?? '';
        const wordRows = l.wordRows ?? [];
        found.push({
          id: `${p}-${found.length}`,
          page: p + 1,
          pageIndex: p,
          parts: l.parts,
          words: l.words,
          wordRows,
          wordTexts: text ? wordsOf(text) : wordRows.map((w) => ({ after: w.after, text: '' })),
          ...cut,
          draft: text,
          via: text ? 'text' : 'own',
          status: text ? 'read' : 'waiting',
          text,
          doubts: [],
          checked: false,
          skipped: false,
        });
      };

      // 1. A typed PDF: read from its own text. A page that's one big picture (a scan) is read as a picture.
      const texts = pages.map((p) => (p.text && p.text.pictured <= 0.5 ? p.text : null));
      const typed = texts.some(Boolean) ? readTypedSheet(texts.map((t) => t ?? BLANK_PAGE)) : null;
      const typedLines = typed && !typed.staff ? typed.lines : [];
      if (typed && typedLines.length) head = { title: typed.title, composer: '', key: typed.key, time: typed.time };
      setDone({ n: 0, of: pages.length });
      for (let p = 0; p < pages.length; p++) {
        const onPage = typedLines.filter((l) => l.page === p);
        if (onPage.length) {
          const s = pages[p].pointScale ?? 1;
          for (const l of onPage) await add(p, { left: l.box[0] * s, top: l.box[1] * s, right: l.box[2] * s, bottom: l.box[3] * s }, l);
        } else {
          // 2. A photo or scanned page: the lines found by where the ink is, with Abụ's own model.
          let onPicture: FoundLine[] = [];
          try {
            const found = await findLinesOwn(pages[p].canvas, partsWanted);
            // A tilted photo comes back straightened: its lines are cut from that.
            pages[p] = { ...pages[p], canvas: found.page };
            onPicture = found.lines;
          } catch {
            // Abụ's reader didn't load: Claude finds the lines if it can.
          }
          if (!onPicture.length && ai.anthropic) {
            // 3. The last resort: Claude finds the lines.
            const small = await pageForFinding(pages[p]);
            const page = await api.scanPage(small.blob, small.width, small.height);
            head = { title: head.title || page.title, composer: head.composer || page.composer, key: head.key || page.key, time: head.time || page.time };
            onPicture = page.lines.map((l) => ({ box: { top: l.top * small.scale, bottom: l.bottom * small.scale, left: l.left * small.scale, right: l.right * small.scale }, parts: l.parts, words: l.words, wordRows: [] }));
          }
          for (const l of onPicture) await add(p, l.box, l);
        }
        setLines([...found]);
        setDone({ n: p + 1, of: pages.length });
      }
      if (!found.length) {
        setPhase('choose');
        return setError('No lines of sol-fa were found on this sheet. Try a clearer, straighter photo of the whole page.');
      }
      setHeading(head);

      // Abụ's own model reads the lines found in pictures, in the browser (free).
      setStage('reading');
      const waiting = found.filter((l) => l.status === 'waiting');
      for (let i = 0; i < waiting.length; i++) {
        setDone({ n: i, of: waiting.length });
        try {
          waiting[i].draft = (await readLineOwn(waiting[i].canvas, waiting[i].parts, waiting[i].words)).text;
        } catch {
          waiting[i].draft = '';
        }
      }
      // Rows of words in pictures: Abụ's model reads only notes, so Cloudflare's reader reads them.
      if (ai.cloudflare) {
        const rows = waiting.flatMap((l) => l.wordRows.map((w, k) => ({ l, w, k })));
        let next = 0;
        const worker = async () => {
          while (next < rows.length) {
            const { l, w, k } = rows[next++];
            try {
              const cut = await cutLine(pages[l.pageIndex], w.box);
              URL.revokeObjectURL(cut.url);
              l.wordTexts[k] = { after: w.after, text: (await api.scanWords(cut.blob)).words };
            } catch {
              // No words for this row: the person can type them.
            }
          }
        };
        await Promise.all(Array.from({ length: READING_AT_ONCE }, worker));
      }

      // The time, as printed or from the bars read; then lines that fail the checker get AI help.
      const songTime = timeFor(head.time, found.map((l) => l.draft).filter(Boolean));
      setStage('checking');
      setDone({ n: 0, of: found.length });
      let next = 0;
      let finished = 0;
      let stopped = false;
      const read: string[] = [];
      const worker = async () => {
        while (!stopped && next < found.length) {
          const line = found[next++];
          try {
            const text = await readOne(line, head, songTime, ai);
            if (text) read.push(text);
          } catch (e) {
            // Out of today's allowance: the other lines keep what the app read.
            stopped = true;
            setNote((e as Error).message);
          }
          setDone({ n: ++finished, of: found.length });
        }
      };
      await Promise.all(Array.from({ length: READING_AT_ONCE }, worker));
      if (stopped) for (const l of found.slice(next)) update(l.id, { status: l.draft.trim() ? 'read' : 'failed', text: withWords(l.draft, l.wordTexts) });
      setTime(timeFor(head.time, read.length ? read : found.map((l) => l.draft)));
      setCurrent(0);
      setPhase('check');
    } catch (e) {
      setPhase('choose');
      setError((e as Error).message || 'That sheet couldn’t be opened. Try another file.');
    }
  };

  const save = () => {
    const kept = lines.filter((l) => !l.skipped && l.text.trim()).map((l) => l.text);
    setScanDraft({ title: tidyTitle(heading.title), composer: heading.composer, doh, time, solfa: joinLines(kept, time), sheet: chosen[0] ?? null });
    router.push({ pathname: '/song-editor', params: { from: 'scan' } });
  };

  if (phase === 'choose') {
    return (
      <ChooseStep
        chosen={chosen}
        hasPdf={hasPdf}
        error={error}
        pagesLeft={allowance.data?.pages}
        partsWanted={partsWanted}
        setPartsWanted={setPartsWanted}
        onPhoto={photo}
        onChoose={choose}
        onRemove={(i) => setChosen(chosen.filter((_, k) => k !== i))}
        onRead={read}
      />
    );
  }
  if (phase === 'reading') return <ReadingStep stage={stage} done={done} lines={lines} note={note} />;
  if (phase === 'finish') {
    return (
      <FinishStep
        lines={lines}
        heading={heading}
        time={time}
        setTime={setTime}
        attached={chosen[0]?.name}
        onOpen={(i) => {
          setCurrent(i);
          setPhase('check');
        }}
        onSave={save}
      />
    );
  }
  return (
    <CheckStep
      lines={lines}
      current={current}
      setCurrent={setCurrent}
      time={time}
      setTime={setTime}
      doh={doh}
      note={note}
      update={update}
      canReadAgain={readers.cloudflare || readers.anthropic}
      readAgain={(l) => readOne(l, heading, time, readers, true).catch(() => null)}
      onFinish={() => setPhase('finish')}
    />
  );
}

/* ---------- 1. Choose the pages ---------- */

function ChooseStep(props: {
  chosen: Chosen[];
  hasPdf: boolean;
  error: string | null;
  pagesLeft?: number;
  partsWanted: number;
  setPartsWanted(n: number): void;
  onPhoto(): void;
  onChoose(): void;
  onRemove(i: number): void;
  onRead(): void;
}) {
  const { chosen, hasPdf, error, pagesLeft } = props;
  return (
    <Page>
      <TopBar back title="Scan a sheet" />
      {!chosen.length ? (
        <>
          <Card style={styles.hero}>
            <ScanIcon color={colors.red} />
            <Text style={styles.heroTitle}>Turn a sol-fa sheet into a song</Text>
            <View style={styles.steps}>
              {['Photograph or choose the sheet', 'Abụ reads every line', 'You check it, then save'].map((s, i) => (
                <View key={s} style={styles.step}>
                  <View style={styles.stepNo}>
                    <Text style={styles.stepNoText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </View>
          </Card>
          <IconButton icon={<CameraIcon color={colors.white} />} label="Take a photo" onPress={props.onPhoto} />
          <IconButton icon={<FileIcon color={colors.ink} />} label="Choose a PDF or photos" kind="ghost" onPress={props.onChoose} />
          {error ? <ErrorText message={error} /> : null}
          <Text style={styles.tip}>Best results: the whole page, flat and straight, in good light. Typed sheets read best; handwritten ones need more checking.</Text>
        </>
      ) : (
        <>
          <Card>
            <View style={styles.rowBetween}>
              <Kicker>{hasPdf ? 'Your PDF' : `Your pages (${chosen.length})`}</Kicker>
              <Text style={styles.muted}>Up to {MAX_PAGES} pages</Text>
            </View>
            <View style={styles.tray}>
              {chosen.map((c, i) => (
                <View key={`${c.name}-${i}`} style={styles.thumb}>
                  {c.preview ? (
                    <Image source={{ uri: c.preview }} style={styles.thumbImg} resizeMode="cover" accessibilityLabel={`Page ${i + 1}`} />
                  ) : (
                    <View style={[styles.thumbImg, styles.thumbFile]}>
                      <FileIcon color={colors.muted} size={28} />
                      <Text style={styles.thumbName} numberOfLines={3}>
                        {c.name}
                      </Text>
                    </View>
                  )}
                  {!hasPdf ? <Text style={styles.thumbNo}>{i + 1}</Text> : null}
                  <Pressable onPress={() => props.onRemove(i)} accessibilityRole="button" accessibilityLabel={`Remove ${hasPdf ? c.name : `page ${i + 1}`}`} hitSlop={6} style={styles.thumbRemove}>
                    <CloseIcon color={colors.white} size={12} />
                  </Pressable>
                </View>
              ))}
              {!hasPdf && chosen.length < MAX_PAGES ? (
                <Pressable onPress={props.onPhoto} accessibilityRole="button" accessibilityLabel="Add a page" style={[styles.thumb, styles.addTile]}>
                  <PlusIcon color={colors.red} />
                  <Text style={styles.addText}>Add a page</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
          <Card>
            <Kicker>Voice parts in each line</Kicker>
            <View style={styles.wrap}>
              {PART_CHOICES.map((c) => (
                <Chip key={c.n} label={c.label} on={props.partsWanted === c.n} onPress={() => props.setPartsWanted(c.n)} />
              ))}
            </View>
            <Text style={styles.small}>For photos and scans. A typed PDF is read from its own text.</Text>
          </Card>
          {error ? <ErrorText message={error} /> : null}
          <Button label="Read the sheet" onPress={props.onRead} />
          <Text style={styles.tip}>Abụ reads the sheet itself, and asks an AI only about lines it can’t get right. Then you check each line before anything is saved.</Text>
        </>
      )}
      {pagesLeft !== undefined ? <Text style={[styles.tip, { textAlign: 'center' }]}>You can scan {pagesLeft} more page{pagesLeft === 1 ? '' : 's'} today.</Text> : null}
    </Page>
  );
}

function IconButton({ icon, label, onPress, kind = 'primary' }: { icon: ReactNode; label: string; onPress(): void; kind?: 'primary' | 'ghost' }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.iconButton, kind === 'ghost' && styles.iconButtonGhost, pressed && { opacity: 0.85 }]}>
      {icon}
      <Text style={[styles.iconButtonText, kind === 'ghost' && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- 2. Reading ---------- */

const STAGES: { key: Stage; label: string }[] = [
  { key: 'finding', label: 'Finding the lines' },
  { key: 'reading', label: 'Reading' },
  { key: 'checking', label: 'Checking' },
];

function ReadingStep({ stage, done, lines, note }: { stage: Stage; done: { n: number; of: number }; lines: Line[]; note: string | null }) {
  const at = STAGES.findIndex((s) => s.key === stage);
  const share = (at + Math.min(1, done.n / Math.max(1, done.of))) / STAGES.length;
  return (
    <Page>
      <TopBar title="Reading your sheet" subtitle="About a minute. Keep this screen open." />
      <Card>
        <View style={styles.barWide}>
          <View style={[styles.barFill, { width: `${Math.max(4, Math.round(share * 100))}%` }]} />
        </View>
        <View style={styles.stages}>
          {STAGES.map((s, i) => (
            <View key={s.key} style={styles.stage}>
              <View style={[styles.stageDot, i < at && styles.stageDone, i === at && styles.stageNow]}>
                {i < at ? <CheckIcon color={colors.white} size={12} /> : i === at ? <ActivityIndicator size="small" color={colors.white} /> : null}
              </View>
              <Text style={[styles.stageText, i === at && { color: colors.ink }]}>{s.label}</Text>
            </View>
          ))}
        </View>
        {note ? <Text style={styles.tip}>{note}</Text> : null}
      </Card>
      {lines.length ? (
        <Card>
          <Kicker>
            {lines.length} line{lines.length === 1 ? '' : 's'} of music
          </Kicker>
          {lines.map((l, i) => (
            <View key={l.id} style={styles.progressRow}>
              <Text style={styles.progressNo}>{i + 1}</Text>
              <Image source={{ uri: l.url }} style={[styles.progressImg, { aspectRatio: l.width / l.height }]} resizeMode="contain" accessibilityLabel={`Line ${i + 1}`} />
              <View style={styles.progressMark}>
                {l.status === 'read' ? (
                  <CheckIcon color={colors.ok} />
                ) : l.status === 'reading' ? (
                  <ActivityIndicator size="small" color={colors.red} />
                ) : l.status === 'failed' ? (
                  <Text style={styles.failMark}>!</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Page>
  );
}

/* ---------- 3. Check each line ---------- */

interface CheckProps {
  lines: Line[];
  current: number;
  setCurrent(i: number): void;
  time: string;
  setTime(t: string): void;
  doh: number;
  note: string | null;
  update(id: string, patch: Partial<Line>): void;
  canReadAgain: boolean;
  readAgain(line: Line): Promise<string | null>;
  onFinish(): void;
}

const READ_BY: Record<NonNullable<Line['via']>, string> = {
  text: 'Read from the PDF’s own text.',
  own: 'Read by Abụ’s own reader.',
  cloudflare: 'Read by Abụ’s own reader, corrected by Cloudflare’s AI.',
  haiku: 'Read by Abụ’s own reader, corrected by Claude.',
  strong: 'Read by Claude.',
};

function CheckStep({ lines, current, setCurrent, time, setTime, doh, note, update, canReadAgain, readAgain, onFinish }: CheckProps) {
  const line = lines[current];
  const [zoom, setZoom] = useState(true);
  const [width, setWidth] = useState(0);
  const [showTimes, setShowTimes] = useState(false);
  const rows = useMemo(() => splitLine(line.text), [line.text]);
  const parsed = useMemo(() => parseSolfa(line.text, { time, key: doh }), [line.text, time, doh]);
  const empty = !rows.some((r) => r.part && r.text.trim());
  const player = useSongPlayer(empty || parsed.errors.length ? null : parsed, doh);
  const { byPart, other } = problemsByPart(
    parsed.errors.map((e) => e.message),
    rows.flatMap((r) => (r.part ? [r.part] : [])),
  );
  const checked = lines.filter((l) => l.checked || l.skipped).length;

  // The picture: tall enough to read (scroll sideways), or the whole line at once.
  const imgHeight = zoom ? 170 : Math.max(48, ((width || 1) * line.height) / line.width);
  const imgWidth = zoom ? (imgHeight * line.width) / line.height : width;
  const textWidth = Math.max(width - 44, ...rows.map((r) => r.text.length * CHAR + 28));

  // The picture and the rows scroll sideways together, so bars stay roughly lined up.
  const picture = useRef<ScrollViewInstance>(null);
  const reading = useRef<ScrollViewInstance>(null);
  const quietUntil = useRef({ picture: 0, reading: 0 });
  /** Called from a scroll event: moves the other one to the same share of its width. */
  function follow(from: 'picture' | 'reading', e: NativeSyntheticEvent<NativeScrollEvent>) {
    const now = Date.now();
    if (now < quietUntil.current[from]) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const share = contentOffset.x / Math.max(1, contentSize.width - layoutMeasurement.width);
    const x = (other: number, view: number) => Math.max(0, share * (other - view));
    if (from === 'picture') {
      quietUntil.current.reading = now + 120;
      reading.current?.scrollTo({ x: x(textWidth, width - 44), animated: false });
    } else {
      quietUntil.current.picture = now + 120;
      picture.current?.scrollTo({ x: x(imgWidth, width), animated: false });
    }
  }

  const setRow = (i: number, text: string) => {
    const next: LineRow[] = rows.map((r, k) => (k === i ? { ...r, text } : r));
    update(line.id, { text: joinLine(next), checked: false });
  };
  const go = (i: number) => setCurrent(Math.max(0, Math.min(lines.length - 1, i)));
  const looksRight = () => {
    update(line.id, { checked: true, skipped: false });
    if (current === lines.length - 1) onFinish();
    else go(current + 1);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TopBar
          title="Check the reading"
          subtitle={`Line ${current + 1} of ${lines.length} · page ${line.page}`}
          right={
            <Pressable onPress={() => setShowTimes(!showTimes)} accessibilityRole="button" accessibilityLabel={`Time ${time}. Change`} style={styles.timeChip}>
              <Text style={styles.timeChipText}>Time {time}</Text>
            </Pressable>
          }
        />
        {showTimes ? (
          <View style={styles.wrap}>
            {TIMES.map((t) => (
              <Chip
                key={t}
                label={t}
                on={time === t}
                onPress={() => {
                  setTime(t);
                  setShowTimes(false);
                }}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.progress}>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round((checked / lines.length) * 100)}%` }]} />
          </View>
          <Text style={styles.muted}>
            {checked} of {lines.length} checked
          </Text>
        </View>
        <ScrollView horizontal contentContainerStyle={styles.dots} showsHorizontalScrollIndicator={false}>
          {lines.map((l, i) => {
            const on = i === current;
            return (
              <Pressable
                key={l.id}
                onPress={() => go(i)}
                accessibilityRole="button"
                accessibilityLabel={`Line ${i + 1}${l.checked ? ', checked' : l.skipped ? ', left out' : ''}`}
                style={[styles.dot, l.checked && styles.dotDone, l.skipped && styles.dotSkipped, on && styles.dotOn]}
              >
                {l.checked && !on ? <CheckIcon color={colors.ok} size={14} /> : <Text style={[styles.dotText, on && { color: colors.white }]}>{l.status === 'failed' ? '!' : i + 1}</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        {note ? <Text style={styles.tip}>{note}</Text> : null}

        <Card style={styles.flush}>
          <View style={[styles.rowBetween, styles.pad]}>
            <Kicker>The sheet</Kicker>
            <Pressable onPress={() => setZoom(!zoom)} accessibilityRole="button" accessibilityLabel={zoom ? 'Show the whole line' : 'Zoom in'} hitSlop={8} style={styles.iconOnly}>
              <ZoomIcon color={colors.muted} out={zoom} />
            </Pressable>
          </View>
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <ScrollView ref={picture} horizontal onScroll={(e) => follow('picture', e)} scrollEventThrottle={16} showsHorizontalScrollIndicator={false}>
              <Image source={{ uri: line.url }} style={{ width: imgWidth || 1, height: imgHeight }} resizeMode="contain" accessibilityLabel={`The sheet, line ${current + 1}`} />
            </ScrollView>
          </View>
        </Card>

        <Card style={styles.flush}>
          <View style={[styles.rowBetween, styles.pad]}>
            <View>
              <Kicker>What Abụ read</Kicker>
              <Text style={styles.small}>Tap a row to fix it.</Text>
            </View>
            {!empty && !parsed.errors.length ? <PlayButton playing={player.playing} onPress={player.togglePlay} size={42} /> : null}
          </View>
          {line.status === 'failed' ? (
            <View style={styles.pad}>
              <ErrorText message={line.error ?? 'This line couldn’t be read.'} />
            </View>
          ) : null}
          <View style={styles.rowsBox}>
            <View style={styles.tags}>
              {rows.map((r, i) => (
                <View key={i} style={styles.tagCell}>
                  {r.part ? (
                    <View style={[styles.tag, { backgroundColor: partColor(r.part) }]}>
                      <Text style={styles.tagText}>{partLetter(r.part)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.wordsTag}>W</Text>
                  )}
                </View>
              ))}
            </View>
            <ScrollView ref={reading} horizontal onScroll={(e) => follow('reading', e)} scrollEventThrottle={16} keyboardShouldPersistTaps="handled">
              <View style={{ width: textWidth }}>
                {rows.map((r, i) => (
                  <TextInput
                    key={i}
                    value={r.text}
                    onChangeText={(t) => setRow(i, t)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    style={[styles.rowInput, !r.part && styles.wordsInput, r.part && byPart[r.part] && styles.rowInputBad]}
                    accessibilityLabel={`${r.part ? partName(r.part) : 'Words'}, line ${current + 1}`}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
          <View style={[styles.pad, { gap: 6 }]}>
            {Object.entries(byPart).map(([part, messages]) => (
              <Text key={part} style={styles.problem}>
                <Text style={{ color: partColor(part), fontFamily: fonts.heavy }}>{partName(part)}: </Text>
                {messages.join(' ')}
              </Text>
            ))}
            {other.map((m) => (
              <Text key={m} style={styles.problem}>
                {m}
              </Text>
            ))}
            {line.doubts.length ? (
              <View style={styles.wrap}>
                {line.doubts.map((d) => (
                  <View key={`${d.part}-${d.bar}`} style={styles.doubt}>
                    <Text style={styles.doubtText}>
                      Check {partName(d.part).toLowerCase()} bar {d.bar}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {!empty && !parsed.errors.length ? (
              <View style={styles.okRow}>
                <CheckIcon color={colors.ok} size={16} />
                <Text style={styles.okText}>Every bar adds up. Play it to hear that the notes are right.</Text>
              </View>
            ) : null}
            {player.message ? <Text style={styles.small}>{player.message}</Text> : null}
          </View>
          <View style={[styles.toolbar, styles.pad]}>
            {canReadAgain ? (
              <Pressable onPress={() => readAgain(line)} disabled={line.status === 'reading'} accessibilityRole="button" accessibilityLabel="Ask the AI to read it again" style={styles.tool}>
                {line.status === 'reading' ? <ActivityIndicator size="small" color={colors.muted} /> : <AgainIcon color={colors.muted} />}
                <Text style={styles.toolText}>{line.status === 'reading' ? 'Reading…' : 'Ask the AI'}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => update(line.id, { skipped: !line.skipped, checked: false })} accessibilityRole="button" style={styles.tool}>
              <CloseIcon color={colors.muted} size={14} />
              <Text style={styles.toolText}>{line.skipped ? 'Keep this line' : 'Leave this line out'}</Text>
            </Pressable>
          </View>
          {line.via ? <Text style={[styles.small, styles.pad, { paddingTop: 0 }]}>{READ_BY[line.via]}</Text> : null}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <Button kind="ghost" label="Back" onPress={() => go(current - 1)} disabled={current === 0} style={{ minWidth: 92 }} />
          <Button label={line.skipped ? 'Next line' : 'Looks right'} onPress={line.skipped ? () => (current === lines.length - 1 ? onFinish() : go(current + 1)) : looksRight} style={{ flex: 1 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ---------- 4. Finish ---------- */

function FinishStep(props: { lines: Line[]; heading: Heading; time: string; setTime(t: string): void; attached?: string; onOpen(i: number): void; onSave(): void }) {
  const { lines, heading, time, attached } = props;
  const checked = lines.filter((l) => l.checked).length;
  const skipped = lines.filter((l) => l.skipped).length;
  const left = lines.length - checked - skipped;
  const firstLeft = lines.findIndex((l) => !l.checked && !l.skipped);
  return (
    <Page>
      <TopBar title={left ? 'Almost there' : 'Ready to save'} subtitle={tidyTitle(heading.title) || 'Your scanned song'} />
      <Card>
        <View style={styles.summary}>
          <Summary n={checked} label="checked" color={colors.ok} />
          <Summary n={left} label="not checked" color={left ? colors.gold : colors.muted} />
          <Summary n={skipped} label="left out" color={colors.muted} />
        </View>
        <View style={{ gap: 6 }}>
          {lines.map((l, i) => (
            <Pressable key={l.id} onPress={() => props.onOpen(i)} accessibilityRole="button" accessibilityLabel={`Line ${i + 1}`} style={styles.summaryRow}>
              <Text style={styles.progressNo}>{i + 1}</Text>
              <Image source={{ uri: l.url }} style={[styles.progressImg, { aspectRatio: l.width / l.height }, l.skipped && { opacity: 0.35 }]} resizeMode="contain" />
              <View style={styles.progressMark}>{l.checked ? <CheckIcon color={colors.ok} /> : l.skipped ? <CloseIcon color={colors.muted} size={13} /> : <Text style={[styles.failMark, { color: colors.gold }]}>•</Text>}</View>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card>
        <Kicker>Time</Kicker>
        <View style={styles.wrap}>
          {TIMES.map((t) => (
            <Chip key={t} label={t} on={time === t} onPress={() => props.setTime(t)} />
          ))}
        </View>
        {attached ? <Text style={styles.small}>The original sheet ({attached}) will be attached to the song.</Text> : null}
      </Card>
      {left ? <Button kind="ghost" label={`Check line ${firstLeft + 1}`} onPress={() => props.onOpen(firstLeft)} /> : null}
      <Button label="Save the song" onPress={props.onSave} />
      <Text style={[styles.tip, { textAlign: 'center' }]}>Next you can check the title and key, then save.</Text>
    </Page>
  );
}

function Summary({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryN, { color }]}>{n}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  body: { padding: 16, paddingBottom: 110, gap: 12, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  heroTitle: { fontFamily: fonts.heavy, fontSize: 19, color: colors.ink, textAlign: 'center' },
  steps: { gap: 8, alignSelf: 'stretch', paddingHorizontal: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.redTint, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.redDeep },
  stepText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  iconButton: { minHeight: 54, borderRadius: 12, backgroundColor: colors.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  iconButtonGhost: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line },
  iconButtonText: { fontFamily: fonts.heavy, fontSize: 15.5, color: colors.white },
  tip: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  muted: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.muted },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 96, height: 128, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.board },
  thumbImg: { width: '100%', height: '100%' },
  thumbFile: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, backgroundColor: colors.sand },
  thumbName: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted, textAlign: 'center' },
  thumbNo: { position: 'absolute', left: 6, bottom: 6, fontFamily: fonts.heavy, fontSize: 12, color: colors.white, backgroundColor: 'rgba(34,22,15,0.7)', borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden' },
  thumbRemove: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(34,22,15,0.75)', alignItems: 'center', justifyContent: 'center' },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.red, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.red },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.board, overflow: 'hidden', flex: 1 },
  barWide: { height: 8, borderRadius: 4, backgroundColor: colors.board, overflow: 'hidden', alignSelf: 'stretch' },
  barFill: { height: '100%', backgroundColor: colors.red, borderRadius: 4 },
  stages: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  stage: { flex: 1, alignItems: 'center', gap: 6 },
  stageDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  stageNow: { backgroundColor: colors.red },
  stageDone: { backgroundColor: colors.ok },
  stageText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.muted, textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressNo: { width: 18, fontFamily: fonts.heavy, fontSize: 12.5, color: colors.muted, textAlign: 'right' },
  progressImg: { flex: 1, height: 42, backgroundColor: colors.white, borderRadius: 6, borderWidth: 1, borderColor: colors.line },
  progressMark: { width: 24, alignItems: 'center' },
  failMark: { fontFamily: fonts.heavy, fontSize: 16, color: colors.red },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeChip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 6 },
  timeChipText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
  dots: { gap: 6, paddingVertical: 2 },
  dot: { minWidth: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  dotOn: { backgroundColor: colors.red, borderColor: colors.red },
  dotDone: { borderColor: colors.ok },
  dotSkipped: { opacity: 0.4 },
  dotText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink },
  flush: { padding: 0, gap: 0, overflow: 'hidden' },
  pad: { paddingHorizontal: 14, paddingVertical: 10 },
  iconOnly: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  rowsBox: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.sand },
  tags: { width: 44, borderRightWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  tagCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  tag: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontFamily: fonts.heavy, fontSize: 12.5, color: colors.white },
  wordsTag: { fontFamily: fonts.heavy, fontSize: 12.5, color: colors.muted },
  rowInput: {
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
    fontFamily: fonts.mono,
    fontSize: 14.5,
    color: colors.ink,
    borderBottomWidth: 1,
    borderColor: colors.line,
    outlineColor: colors.red,
  },
  rowInputBad: { backgroundColor: colors.redTint },
  wordsInput: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, color: colors.muted },
  problem: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.redDeep },
  doubt: { borderRadius: 999, backgroundColor: '#FBF0DA', paddingHorizontal: 10, paddingVertical: 4 },
  doubtText: { fontFamily: fonts.bold, fontSize: 12.5, color: '#8A5A06' },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  okText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ok, flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderColor: colors.line },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 8 },
  toolText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(247,241,237,0.96)', borderTopWidth: 1, borderColor: colors.line },
  footerInner: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  summary: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  summaryCell: { alignItems: 'center', gap: 2 },
  summaryN: { fontFamily: fonts.heavy, fontSize: 26 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
