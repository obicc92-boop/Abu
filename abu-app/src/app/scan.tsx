/**
 * Scan a sheet (docs/scan-plan.md), in four steps:
 *
 * 1. Choose: take photos of the pages or choose a PDF or photos; the pages
 *    show as thumbnails to add to or remove before reading, with whether the
 *    sheet is handwritten or typed and how many voice parts it has.
 * 2. Reading, the app doing all it can before any AI:
 *    - a typed PDF is read from its own text (free, instant, exact);
 *    - on photos and scans, the lines are found by where the ink is and read
 *      by SolfaScores' own model in the browser, and rows of words are read by
 *      Cloudflare's reader (SolfaScores' model reads only notes); a boxed
 *      sheet (each bar in a box of its own, the parts stacked in it) is read
 *      box by box (scan/boxes.ts), its words in pieces put side by side;
 *    - a line that passes SolfaScores' checker is kept as read. Only a line that
 *      fails goes to an AI: Cloudflare's reader, then Claude if the Worker
 *      has a key (Haiku checks a typed sheet's line, Opus reads from
 *      scratch; a handwritten sheet's line skips Haiku, which rarely helps
 *      with handwriting), and an AI's answer is kept only if it passes.
 *      Otherwise the person fixes the line.
 *    The person says whether the sheet is handwritten or typed: a
 *    handwritten PDF is read from its pictures even if it has text (a
 *    scanner's guess at the writing).
 * 3. Check: one line at a time, the picture above each part's row (they
 *    scroll sideways together), the parts' bars numbered and lined up, each
 *    bar that doesn't add up marked with its beats, problems under the rows,
 *    play, read again, leave out, and "Looks right".
 * 4. Finish: what's checked, then the song editor with the original sheet
 *    attached. Nothing is saved before Save.
 */
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type PickedFile, type ScanLineReading } from '@/api/client';
import { useSongPlayer } from '@/audio/use-song-player';
import { AgainIcon, CameraIcon, CheckIcon, CloseIcon, FileIcon, PlusIcon, ScanIcon, ZoomIcon } from '@/components/icons';
import { PlayButton } from '@/components/player-controls';
import { SolfaKeypad } from '@/components/solfa-keypad';
import { Body, Button, Card, Chip, ErrorText, Kicker, MAX_WIDTH, Page, TopBar } from '@/components/ui';
import { barNumbers, checkRows } from '@/scan/bar-check';
import { setScanDraft } from '@/scan/draft';
import { forgetScan, listScans, openScan, saveScan, type SavedScan } from '@/scan/saved';
import { joinLines, timeFor } from '@/scan/join';
import { alignedRows, barColumns, bestFree, changedShare, joinLine, keepsParts, namesNotWords, problemsByPart, splitLine, tidyNotes, tidyTitle, withBarsInStep, withWords, wordsOf, wordsPreferring, wordsUnderNotes, type LineRow, type LineWords } from '@/scan/line-text';
import { applyKey, type Key, type Selection } from '@/lib/solfa-keys';
import { findLinesOwn, readLineOwn } from '@/scan/own-reader';
import { cutLine, cutPieces, loadPages, MAX_PAGES, pageForFinding, scanningHere, takePhoto } from '@/scan/pages';
import { readTypedSheet, type PageText } from '@/scan/pdf-text';
import type { Box, FoundLine } from '@/scan/types';
import { parseKey, parseSolfa, parseTime, partName } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors, usePartInk } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TIMES = ['2/4', '3/4', '4/4', '6/8'];
/** Doh names the server accepts, by semitone. */
const KEY_PARAM = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const READING_AT_ONCE = 3;
/** Voice parts in each line, for photos and scans (0: SolfaScores works it out). Most choir sheets are SATB. */
const PART_CHOICES: { n: number; label: string }[] = [
  { n: 4, label: '4 · SATB' },
  { n: 3, label: '3' },
  { n: 2, label: '2' },
  { n: 1, label: '1' },
  { n: 0, label: 'Not sure' },
];
/** How a sheet is written, as the person says. */
type Written = 'hand' | 'typed';
const WRITTEN_CHOICES: { w: Written; label: string }[] = [
  { w: 'hand', label: 'Handwritten' },
  { w: 'typed', label: 'Typed' },
];
const BLANK_PAGE: PageText = { width: 1, height: 1, chars: [], segs: [], across: [], music: 0, pictured: 1 };

/** The AI readers the Worker has, in the order they're tried. */
interface Readers {
  cloudflare: boolean;
  anthropic: boolean;
}
/** Width of a character in the rows' monospace type (0.6 of its size), until it's measured on the screen. */
const CHAR = 8.7;
const ROW_HEIGHT = 42;
/** One character of the words, in note columns (the words' type is narrower than the notes'). */
const WORDS_CHAR = 0.8;
/** Room under the rows for the sol-fa keypad, so the row being fixed can be scrolled above it. */
const KEYPAD_ROOM = 330;
/** Space before a row's first character. */
const ROW_PAD = 12;
/** How thick the bar lines drawn through the rows are: enough to cover the typed "|" beneath. */
const BAR_LINE = 2;
/** What's measured for that width: long, so rounding hardly matters. */
const MEASURED = '0'.repeat(100);
/** The strip of bar numbers above the rows. */
const NUMBERS_HEIGHT = 18;

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
  /** What the app read itself: from the PDF's text, or with SolfaScores' own model. */
  draft: string;
  /** From a PDF's text: the same with the parts' bar lines lined up by where they're printed, tried if `draft` fails. */
  lined?: string;
  /** Who read it: the PDF's text, SolfaScores' own reader, or an AI that corrected it. */
  via?: 'text' | 'own' | 'cloudflare' | 'haiku' | 'strong';
  /** On a sheet the person said is handwritten. */
  handwritten: boolean;
  status: 'waiting' | 'reading' | 'read' | 'failed';
  text: string;
  doubts: { part: string; bar: number }[];
  error?: string;
  checked: boolean;
  skipped: boolean;
}

/** A line as an unfinished scan keeps it: everything but its picture (kept apart) and the canvas it was read from. */
type SavedLine = Omit<Line, 'blob' | 'url' | 'canvas'>;

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
          <Body>Scanning works in the web app for now. Open solfascores.com in your phone’s browser to scan a sheet.</Body>
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
  // How the sheet is written, as the person says: it decides how it's read and which AIs help.
  const [written, setWritten] = useState<Written | null>(null);
  const [readers, setReaders] = useState<Readers>({ cloudflare: false, anthropic: false });
  // The scan as it's checked, saved on the phone as it changes, to carry on with after leaving (scan/saved.ts).
  const [scanId, setScanId] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<SavedScan<SavedLine>[]>([]);
  useEffect(() => {
    if (phase === 'choose') listScans<SavedLine>().then(setUnfinished);
  }, [phase]);
  // Saved a moment after each change, and straight away on leaving the screen or the page (a back press).
  const unsaved = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!scanId || (phase !== 'check' && phase !== 'finish') || !lines.length) {
      unsaved.current = null;
      return;
    }
    const save = () => {
      unsaved.current = null;
      const sheet = chosen[0];
      void saveScan<SavedLine>(
        {
          id: scanId,
          savedAt: Date.now(),
          phase,
          current,
          heading,
          time,
          lines: lines.map(({ blob: _blob, url: _url, canvas: _canvas, ...l }) => l),
          sheet: sheet?.file ? { name: sheet.name, type: sheet.type, size: sheet.size } : null,
        },
        Object.fromEntries(lines.map((l) => [l.id, l.blob])),
        sheet?.file ?? null,
      );
    };
    unsaved.current = save;
    const wait = setTimeout(save, 600);
    return () => clearTimeout(wait);
  }, [scanId, phase, current, heading, time, lines, chosen]);
  useEffect(() => {
    const flush = () => unsaved.current?.();
    const page = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
    page?.addEventListener('pagehide', flush);
    return () => {
      page?.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  /** Carries on with an unfinished scan where it was left. */
  const carryOn = async (id: string) => {
    const got = await openScan<SavedLine>(id);
    if (!got) {
      setUnfinished(await listScans<SavedLine>());
      return setError('That scan couldn’t be opened. Scan the sheet again.');
    }
    const restored: Line[] = got.scan.lines.map((l) => {
      const blob = got.pictures[l.id] ?? new Blob();
      // A line still being read when the scan was left keeps what was read.
      const status = l.status === 'reading' || l.status === 'waiting' ? (l.text.trim() ? 'read' : 'failed') : l.status;
      return { ...l, blob, url: URL.createObjectURL(blob), canvas: null, status };
    });
    setReaders((await api.scanAllowance().catch(() => null))?.readers ?? { cloudflare: false, anthropic: false });
    setChosen(got.scan.sheet && got.sheet ? [{ ...got.scan.sheet, uri: URL.createObjectURL(got.sheet), file: got.sheet }] : []);
    setHeading(got.scan.heading);
    setTime(got.scan.time);
    setLines(restored);
    setCurrent(Math.max(0, Math.min(got.scan.current, restored.length - 1)));
    setScanId(id);
    setPhase(got.scan.phase);
  };
  const forget = async (id: string) => {
    await forgetScan(id);
    setUnfinished(await listScans<SavedLine>());
  };
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
   * A line's reading, with AI only as the last resort. A reading that passes SolfaScores' checker is kept as it is
   * (the AIs broke more right lines than they fixed when sent every line). One that fails, or one the
   * person asks to read again, goes to Cloudflare's reader, then Claude if the Worker has a key (Haiku
   * checks a typed sheet's line, Opus reads it from scratch). A handwritten sheet's line skips Haiku: on the
   * owner's handwritten sheet Haiku made 1 of 9 failing lines add up where Opus made all 9 (owner's call,
   * 20 November 2026). An answer is kept only if it passes and keeps every part
   * (`keepsParts`). Otherwise the line keeps
   * the app's own reading for the person to fix. Throws only when today's allowance is used up.
   */
  /**
   * A handwritten sheet's line that adds up without Opus, with Opus's copy of its words (given its notes as
   * read): Cloudflare's reader reads handwritten words poorly (owner's call, 20 November 2026). The app's words
   * stay under a part Opus gave none for, and all of them if it can't be asked.
   */
  const withOpusWords = async (line: Line, text: string, ai: Readers): Promise<string> => {
    if (!line.handwritten || !ai.anthropic) return text;
    try {
      const notes = joinLine(splitLine(text).filter((r) => r.part));
      const { words } = await api.scanLineWords(line.blob, { parts: line.parts, notes });
      return words.length ? withWords(text, wordsPreferring(words, wordsOf(text))) : text;
    } catch {
      return text;
    }
  };

  const readOne = async (line: Line, head: Heading, songTime: string, ai: Readers, again = false): Promise<string> => {
    const passes = (t: string) => splitLine(t).some((r) => r.part && r.text.trim()) && !parseSolfa(t, { time: songTime }).errors.length;
    let own = withWords(line.draft, line.wordTexts);
    // Free repairs first: bar lines every part lost put back in step; the parts' bar lines lined up as
    // printed; a column of part names read as notes, beat marks left out, parts resting through an upbeat.
    const beats = parseTime(songTime)?.pulses ?? 4;
    if (!passes(own)) own = bestFree([own, ...(line.lined ? [withWords(line.lined, line.wordTexts)] : [])], passes, beats);
    // Bar lines every part lost alike go back, at the same beats in every part, even when the line still
    // fails for something else (only bar lines move): the person and the AIs then start from bars in step.
    if (!passes(own)) own = withBarsInStep(own, beats) ?? own;
    if (!again && passes(own)) {
      const text = await withOpusWords(line, own, ai);
      update(line.id, { status: 'read', text, checked: false });
      return text;
    }
    update(line.id, { status: 'reading', error: undefined });
    const semitone = parseKey(head.key)?.semitone;
    const opts = { parts: line.parts, time: songTime || undefined, key: semitone === undefined ? undefined : KEY_PARAM[semitone] };
    const draft = (again && line.text) || own;
    const tries: [NonNullable<Line['via']>, () => Promise<ScanLineReading>][] = [];
    if (ai.cloudflare && draft.trim()) tries.push(['cloudflare', () => api.scanFix(line.blob, { ...opts, draft })]);
    if (ai.anthropic && draft.trim() && !line.handwritten) tries.push(['haiku', () => api.scanCheck(line.blob, { ...opts, draft })]);
    if (ai.anthropic) tries.push(['strong', () => api.scanLine(line.blob, opts)]);
    let problem = '';
    let opusWords: LineWords[] = [];
    for (const [via, ask] of tries) {
      try {
        const r = await ask();
        // Opus reads handwritten words far better than Cloudflare's reader: its words are kept, and the app's only
        // under a part it gave none for (owner's call, 20 November 2026). A correction keeps the app's words.
        if (via === 'strong') opusWords = wordsOf(r.text);
        let text = withWords(r.text, via === 'strong' ? wordsPreferring(opusWords, line.wordTexts) : line.wordTexts);
        // An answer that only lacks what the free repairs mend (a part's rest through an upbeat left out) is mended
        // as the app's own readings are: Opus read a boxed sheet's first line right but for the tenor's empty upbeat.
        if (!passes(text)) text = bestFree([text], passes, beats);
        // Kept only if it adds up and still has every part (an answer that drops or empties a part adds up too).
        // A correction (Cloudflare's or Haiku's) is kept only if it changed a fifth of the reading or less: on
        // handwriting the ones that rewrote more were mostly wrong though they added up; Opus reads it afresh.
        const corrected = via === 'cloudflare' || via === 'haiku';
        if (passes(text) && keepsParts(text, draft) && !(corrected && changedShare(text, draft) > 0.2)) {
          // (Not when the person asked again: the words may be theirs.)
          if (corrected && !again) text = await withOpusWords(line, text, ai);
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
    // Nothing better: the line keeps the app's own reading, for the person to fix, with Opus's words if it read
    // the line (its notes weren't kept, but its words are still the best read).
    const mine = again ? draft : own;
    const text = opusWords.length ? withWords(mine, wordsPreferring(opusWords, wordsOf(mine))) : mine;
    update(line.id, {
      status: text.trim() ? 'read' : 'failed',
      text,
      checked: false,
      error: text.trim() ? undefined : problem || 'This line couldn’t be read. Type it in, or leave it out.',
    });
    return text;
  };

  const read = async () => {
    setScanId(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
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
      const add = async (p: number, box: Box, l: { parts: string[]; words: number; wordRows?: FoundLine['wordRows']; text?: string; lined?: string; draft?: string }) => {
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
          // A boxed sheet's lines come read already (boxes.ts); they still go through the checker and the AIs.
          draft: text || l.draft || '',
          ...(l.lined ? { lined: l.lined } : {}),
          via: text ? 'text' : 'own',
          handwritten: written === 'hand',
          status: text ? 'read' : 'waiting',
          text,
          doubts: [],
          checked: false,
          skipped: false,
        });
      };

      // 1. A typed PDF: read from its own text. A page that's one big picture (a scan) is read as a picture.
      // A handwritten PDF is read from its pictures: any text in it is a scanner's guess at the writing.
      const texts = pages.map((p) => (written !== 'hand' && p.text && p.text.pictured <= 0.5 ? p.text : null));
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
          // 2. A photo or scanned page: the lines found by where the ink is, with SolfaScores' own model.
          let onPicture: FoundLine[] = [];
          try {
            const found = await findLinesOwn(pages[p].canvas, partsWanted);
            // A tilted photo comes back straightened: its lines are cut from that.
            pages[p] = { ...pages[p], canvas: found.page };
            onPicture = found.lines;
          } catch {
            // SolfaScores' reader didn't load: Claude finds the lines if it can.
          }
          if (!onPicture.length && ai.anthropic) {
            // 3. The last resort: Claude finds the lines.
            const small = await pageForFinding(pages[p]);
            const page = await api.scanPage(small.blob, small.width, small.height);
            head = { title: head.title || page.title, composer: head.composer || page.composer, key: head.key || page.key, time: head.time || page.time };
            onPicture = page.lines.map((l) => ({ box: { top: l.top * small.scale, bottom: l.bottom * small.scale, left: l.left * small.scale, right: l.right * small.scale }, parts: l.parts, words: l.words, wordRows: [] }));
          }
          for (const l of onPicture) await add(p, l.box, l);
          // The heading above the first page's music (title, composer, key, time), read by Cloudflare's reader:
          // SolfaScores' model reads only notes. On 51 handwritten pages it found the time on 28, all right, and the key
          // on 36 of 50, one wrong.
          if (p === 0 && ai.cloudflare && onPicture.length && (!head.title || !head.key || !head.time)) {
            const h = pages[p].height;
            const top = Math.min(...onPicture.map((l) => l.box.top));
            try {
              const cut = await cutLine(pages[p], { left: 0, top: 0, right: pages[p].width, bottom: Math.min(h, Math.max(top + 0.01 * h, 0.12 * h)) });
              URL.revokeObjectURL(cut.url);
              const read = await api.scanHeading(cut.blob);
              head = { title: head.title || read.title, composer: head.composer || read.composer, key: head.key || read.key, time: head.time || read.time };
            } catch {
              // No heading read: the time comes from the bars, and the person can set the key.
            }
          }
        }
        setLines([...found]);
        setDone({ n: p + 1, of: pages.length });
      }
      if (!found.length) {
        setPhase('choose');
        return setError('No lines of sol-fa were found on this sheet. Try a clearer, straighter photo of the whole page.');
      }
      setHeading(head);

      // SolfaScores' own model reads the lines found in pictures, in the browser (free).
      setStage('reading');
      const waiting = found.filter((l) => l.status === 'waiting');
      for (let i = 0; i < waiting.length; i++) {
        setDone({ n: i, of: waiting.length });
        if (waiting[i].draft) continue;
        try {
          waiting[i].draft = (await readLineOwn(waiting[i].canvas, waiting[i].parts, waiting[i].words)).text;
        } catch {
          waiting[i].draft = '';
        }
      }
      // Rows of words in pictures: SolfaScores' model reads only notes, so Cloudflare's reader reads them.
      if (ai.cloudflare) {
        const rows = waiting.flatMap((l) => l.wordRows.map((w, k) => ({ l, w, k })));
        let next = 0;
        const worker = async () => {
          while (next < rows.length) {
            const { l, w, k } = rows[next++];
            try {
              const cut = w.pieces ? await cutPieces(pages[l.pageIndex], w.pieces) : await cutLine(pages[l.pageIndex], w.box);
              URL.revokeObjectURL(cut.url);
              const words = (await api.scanWords(cut.blob)).words;
              // A reader asked for the words sometimes names the notes instead ("fa - mi - re - doh").
              l.wordTexts[k] = { after: w.after, text: namesNotWords(words) ? '' : words };
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
    setScanDraft({ title: tidyTitle(heading.title) || titleFromFile(chosen[0]?.name), composer: heading.composer, doh, time, solfa: joinLines(kept, time), sheet: chosen[0] ?? null, scanId: scanId ?? undefined });
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
        written={written}
        setWritten={setWritten}
        onPhoto={photo}
        onChoose={choose}
        onRemove={(i) => setChosen(chosen.filter((_, k) => k !== i))}
        onRead={read}
        unfinished={unfinished}
        onCarryOn={(id) => void carryOn(id)}
        onForget={(id) => void forget(id)}
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

/** A title from a file's name, for a sheet whose heading wasn't read: "Ekeresimesi_Erutego_By_Jude_Nnam-1.pdf" → "Ekeresimesi Erutego By Jude Nnam". */
function titleFromFile(name?: string): string {
  return (name ?? '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[-_ ]\d{1,2}$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2 hours ago", "yesterday": when an unfinished scan was last saved. */
function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Scans left before the song was saved, to carry on with; each can be deleted (after a second tap). */
function Unfinished({ scans, onCarryOn, onForget }: { scans: SavedScan<SavedLine>[]; onCarryOn(id: string): void; onForget(id: string): void }) {
  const styles = useStyles();
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <Card>
      <Kicker>Carry on where you left off</Kicker>
      {scans.map((s) => {
        const checked = s.lines.filter((l) => l.checked || l.skipped).length;
        return (
          <View key={s.id} style={styles.unfinished}>
            <Text style={styles.unfinishedTitle} numberOfLines={1}>
              {tidyTitle(s.heading.title) || titleFromFile(s.sheet?.name) || 'Untitled sheet'}
            </Text>
            <Text style={styles.small}>
              {checked} of {s.lines.length} lines checked · saved {ago(s.savedAt)}
            </Text>
            {asking === s.id ? (
              <View style={styles.unfinishedButtons}>
                <Text style={[styles.small, { flex: 1 }]}>Delete this scan and its checking?</Text>
                <Button small kind="ghost" label="Keep" onPress={() => setAsking(null)} />
                <Button small label="Delete" onPress={() => onForget(s.id)} />
              </View>
            ) : (
              <View style={styles.unfinishedButtons}>
                <Button small label={s.phase === 'finish' ? 'Save the song' : 'Carry on checking'} onPress={() => onCarryOn(s.id)} style={{ flex: 1 }} />
                <Button small kind="ghost" label="Delete" onPress={() => setAsking(s.id)} />
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

function ChooseStep(props: {
  chosen: Chosen[];
  hasPdf: boolean;
  error: string | null;
  pagesLeft?: number;
  partsWanted: number;
  setPartsWanted(n: number): void;
  written: Written | null;
  setWritten(w: Written): void;
  onPhoto(): void;
  onChoose(): void;
  onRemove(i: number): void;
  onRead(): void;
  unfinished: SavedScan<SavedLine>[];
  onCarryOn(id: string): void;
  onForget(id: string): void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { chosen, hasPdf, error, pagesLeft } = props;
  return (
    <Page>
      <TopBar back title="Scan a sheet" />
      {!chosen.length ? (
        <>
          {props.unfinished.length ? <Unfinished scans={props.unfinished} onCarryOn={props.onCarryOn} onForget={props.onForget} /> : null}
          <Card style={styles.hero}>
            <ScanIcon color={colors.link} />
            <Text style={styles.heroTitle}>Turn a sol-fa sheet into a song</Text>
            <View style={styles.steps}>
              {['Photograph or choose the sheet', 'SolfaScores reads every line', 'You check it, then save'].map((s, i) => (
                <View key={s} style={styles.step}>
                  <View style={styles.stepNo}>
                    <Text style={styles.stepNoText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </View>
          </Card>
          <IconButton icon={<CameraIcon color={colors.onRed} />} label="Take a photo" onPress={props.onPhoto} />
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
                    <CloseIcon color={colors.onRed} size={12} />
                  </Pressable>
                </View>
              ))}
              {!hasPdf && chosen.length < MAX_PAGES ? (
                <Pressable onPress={props.onPhoto} accessibilityRole="button" accessibilityLabel="Add a page" style={[styles.thumb, styles.addTile]}>
                  <PlusIcon color={colors.link} />
                  <Text style={styles.addText}>Add a page</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
          <Card>
            <Kicker>How is the sheet written?</Kicker>
            <View style={styles.wrap}>
              {WRITTEN_CHOICES.map((c) => (
                <Chip key={c.w} label={c.label} on={props.written === c.w} onPress={() => props.setWritten(c.w)} />
              ))}
            </View>
            <Text style={styles.small}>
              {props.written === 'hand'
                ? 'Read from the picture. Handwritten sheets need more checking.'
                : props.written === 'typed'
                  ? 'A typed PDF is read from its own text, a photo from the picture.'
                  : 'Choose one, so SolfaScores reads it the right way.'}
            </Text>
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
          <Button label="Read the sheet" onPress={props.onRead} disabled={!props.written} />
          <Text style={styles.tip}>SolfaScores reads the sheet itself, and asks an AI only about lines it can’t get right. Then you check each line before anything is saved.</Text>
        </>
      )}
      {pagesLeft !== undefined ? <Text style={[styles.tip, { textAlign: 'center' }]}>You can scan {pagesLeft} more page{pagesLeft === 1 ? '' : 's'} today.</Text> : null}
    </Page>
  );
}

function IconButton({ icon, label, onPress, kind = 'primary' }: { icon: ReactNode; label: string; onPress(): void; kind?: 'primary' | 'ghost' }) {
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  const colors = useColors();
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
                {i < at ? <CheckIcon color={colors.onRed} size={12} /> : i === at ? <ActivityIndicator size="small" color={colors.onRed} /> : null}
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
                  <ActivityIndicator size="small" color={colors.link} />
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

/** Who read a line, as the person is told: no company's name is shown (owner's rule, 20 November 2026). */
const READ_BY: Record<NonNullable<Line['via']>, string> = {
  text: 'Read from the PDF’s own text.',
  own: 'Read by SolfaScores itself.',
  cloudflare: 'Read by SolfaScores, corrected by AI.',
  haiku: 'Read by SolfaScores, corrected by AI.',
  strong: 'Read by AI.',
};

function CheckStep({ lines, current, setCurrent, time, setTime, doh, note, update, canReadAgain, readAgain, onFinish }: CheckProps) {
  const ink = usePartInk();
  const styles = useStyles();
  const colors = useColors();
  const line = lines[current];
  const [zoom, setZoom] = useState(true);
  const [width, setWidth] = useState(0);
  const [showTimes, setShowTimes] = useState(false);
  // A character's width in the rows' type, as drawn on this screen, so the bar lines land on the typed "|".
  const [charWidth, setCharWidth] = useState(CHAR);
  const rows = useMemo(() => splitLine(line.text), [line.text]);
  // The parts' bars lined up in columns, as on the sheet; the row being typed in shows just what's typed.
  const shown = useMemo(() => alignedRows(rows), [rows]);
  const [editing, setEditing] = useState<{ id: string; row: number; value: string } | null>(null);
  const valueOf = (i: number) => (editing && editing.id === line.id && editing.row === i ? editing.value : shown[i]);
  // A row of notes is fixed with the sol-fa keypad, which keeps the field's cursor; "ABC" swaps in the phone's
  // keyboard until the row is left. Rows of words use the phone's keyboard.
  const inputs = useRef<(TextInputInstance | null)[]>([]);
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  const [keyboard, setKeyboard] = useState(false);
  const editingRow = editing && editing.id === line.id ? editing.row : -1;
  const keypad = editingRow >= 0 && !!rows[editingRow]?.part && !keyboard;
  const pressKey = (key: Key) => {
    if (!editing || editingRow < 0) return;
    const next = applyKey(editing.value, sel, key);
    setEditing({ ...editing, value: next.text });
    setRow(editingRow, next.text);
    setSel(next.sel);
    const field = inputs.current[editingRow];
    if (field && !field.isFocused()) field.focus();
    // The cursor after the key, once the row shows its new text.
    requestAnimationFrame(() => placeCursor(field, next.sel));
  };
  const leaveRow = () => {
    inputs.current[editingRow]?.blur();
    setEditing(null);
    setKeyboard(false);
  };
  const useKeyboard = () => {
    // The phone's keyboard comes up as the field is focused again.
    const field = inputs.current[editingRow];
    setKeyboard(true);
    field?.blur();
    setTimeout(() => field?.focus(), 50);
  };
  // Each row of words set under its part's notes, as on the sheet (the row being typed in shows what's typed).
  const wordsLaid = rows.map((r, i) => {
    if (r.part || editingRow === i) return null;
    let j = i - 1;
    while (j >= 0 && !rows[j].part) j--;
    return j >= 0 ? wordsUnderNotes(valueOf(i), valueOf(j), WORDS_CHAR) : null;
  });
  // The key where this line starts: the song's, moved by any bridge notes in the lines before it.
  const before = useMemo(() => lines.slice(0, current).map((l) => l.text), [lines, current]);
  const lineDoh = useMemo(() => {
    let key = doh;
    for (const text of before) key = parseSolfa(text, { time, key }).keyChanges.at(-1)?.key?.semitone ?? key;
    return key;
  }, [before, time, doh]);
  const parsed = useMemo(() => parseSolfa(line.text, { time, key: lineDoh }), [line.text, time, lineDoh]);
  const empty = !rows.some((r) => r.part && r.text.trim());
  const player = useSongPlayer(empty || parsed.errors.length ? null : parsed, lineDoh);
  // Where the key changes, said plainly, so a misread bridge note is easy to spot.
  const keyNotes = useMemo(() => {
    const all = Object.values(parsed.events).flat();
    return parsed.keyChanges.flatMap((k) => {
      if (!k.key) return [];
      const bar = all.find((e) => Math.abs(e.start - k.beat) < 1e-6)?.bar;
      return [`Doh changes to ${k.key.name}${bar ? ` in bar ${bar}` : ''}.`];
    });
  }, [parsed]);
  const { byPart, other } = problemsByPart(
    parsed.errors.map((e) => e.message),
    rows.flatMap((r) => (r.part ? [r.part] : [])),
  );
  // Each row's bars as shown (the row being typed in by what's typed), with the ones that don't add up.
  const marks = checkRows(
    rows.map((r, i) => ({ part: r.part, text: valueOf(i) })),
    parsed.errors,
    parsed.beatsPerBar,
  );
  // The bars' numbers, over where every part's bar starts.
  const numbers = useMemo(() => barNumbers(rows.map((r, i) => ({ part: r.part, text: shown[i] }))), [rows, shown]);
  const checked = lines.filter((l) => l.checked || l.skipped).length;

  // The picture: tall enough to read (scroll sideways), or the whole line at once.
  const imgHeight = zoom ? 170 : Math.max(48, ((width || 1) * line.height) / line.width);
  const imgWidth = zoom ? (imgHeight * line.width) / line.height : width;
  const textWidth = Math.max(
    width - 44,
    ...rows.map((_, i) => valueOf(i).length * charWidth + 2 * ROW_PAD + 4),
    ...wordsLaid.flatMap((w) => (w ?? []).map((s) => (s.at + s.text.length * WORDS_CHAR) * charWidth + 2 * ROW_PAD + 4)),
  );

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
    const next: LineRow[] = rows.map((r, k) => (k === i ? { ...r, text: r.part ? tidyNotes(text) : text } : r));
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
      <ScrollView contentContainerStyle={[styles.body, keypad && { paddingBottom: KEYPAD_ROOM }]} keyboardShouldPersistTaps="handled">
        <TopBar
          title="Check the reading"
          subtitle={`Line ${current + 1} of ${lines.length} · page ${line.page} · saved as you go`}
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
                {l.checked && !on ? <CheckIcon color={colors.ok} size={14} /> : <Text style={[styles.dotText, on && { color: colors.onRed }]}>{l.status === 'failed' ? '!' : i + 1}</Text>}
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
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Kicker>What SolfaScores read</Kicker>
              <Text style={styles.small}>Tap a row to fix it.</Text>
              {/* Each part by its colour, as in the score. */}
              <View style={styles.legend}>
                {rows.flatMap((r) => (r.part ? [r.part] : [])).map((p) => (
                  <View key={p} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: partColor(p) }]} />
                    <Text style={[styles.legendText, { color: ink(p) }]}>{partName(p)}</Text>
                  </View>
                ))}
              </View>
            </View>
            {!empty && !parsed.errors.length ? <PlayButton playing={player.playing} onPress={player.togglePlay} size={42} /> : null}
          </View>
          {line.status === 'failed' ? (
            <View style={styles.pad}>
              <ErrorText message={line.error ?? 'This line couldn’t be read.'} />
            </View>
          ) : null}
          <View style={styles.rowsBox}>
            {/* Out of sight: a run of characters in the rows' type, measured once it's drawn (and again if the font arrives late). */}
            <View style={styles.measureBox} aria-hidden importantForAccessibility="no-hide-descendants">
              <View style={styles.measureWide}>
                <Text
                  numberOfLines={1}
                  style={styles.measureText}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width / MEASURED.length;
                    if (w > 0 && Math.abs(w - charWidth) > 0.001) setCharWidth(w);
                  }}
                >
                  {MEASURED}
                </Text>
              </View>
            </View>
            <View style={styles.tags}>
              {numbers.length ? <View style={styles.numbersTop} /> : null}
              {rows.map((r, i) => (
                <View key={i} style={styles.tagCell}>
                  {r.part ? <View style={[styles.tag, { backgroundColor: partColor(r.part) }]} /> : null}
                </View>
              ))}
            </View>
            <ScrollView ref={reading} horizontal onScroll={(e) => follow('reading', e)} scrollEventThrottle={16} keyboardShouldPersistTaps="handled">
              <View style={{ width: textWidth }}>
                {numbers.length ? (
                  <View style={styles.numbers} aria-hidden importantForAccessibility="no-hide-descendants">
                    {numbers.map((n) => (
                      <Text key={n.bar} style={[styles.number, { left: ROW_PAD + n.at * charWidth }]}>
                        {n.bar}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View>
                  {/* Behind the rows' text: each bar that doesn't add up, from its bar line to the next and underlined,
                      with its beats by its opening bar line (in sight as soon as the bar is) to count against the time;
                      a part whose bars or beats don't match most parts', by a lighter line under its whole row. The
                      rows' own background is clear, so the text stays on top. */}
                  <View style={styles.overlay} aria-hidden importantForAccessibility="no-hide-descendants">
                    {marks.flatMap((m, i) => [
                      ...(m.whole ? [<View key={`row-${i}`} style={[styles.wholeMark, { top: i * ROW_HEIGHT }]} />] : []),
                      ...m.bars
                        .filter((b) => b.bad)
                        .map((b) => {
                          const left = b.from < 0 ? 0 : ROW_PAD + (b.from + 0.5) * charWidth;
                          const right = b.closed ? ROW_PAD + (b.to + 0.5) * charWidth : ROW_PAD + b.to * charWidth + ROW_PAD / 2;
                          return (
                            <View key={`${i}-${b.bar}`} style={[styles.barTint, { top: i * ROW_HEIGHT, left, width: Math.max(0, right - left) }]}>
                              {b.wrongBeats ? (
                                <View style={styles.beats}>
                                  <Text style={styles.beatsText}>{b.beats}</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        }),
                    ])}
                  </View>
                  {rows.map((r, i) => {
                    const withKeys = !!r.part && !keyboard;
                    return (
                      <TextInput
                        key={i}
                        ref={(field) => {
                          inputs.current[i] = field;
                        }}
                        value={valueOf(i)}
                        onFocus={() => {
                          if (editingRow !== i) {
                            setEditing({ id: line.id, row: i, value: shown[i] });
                            setKeyboard(false);
                          }
                          // In sight above the keypad, once it's up.
                          if (r.part) setTimeout(() => (inputs.current[i] as unknown as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 150);
                        }}
                        onChangeText={(t) => {
                          setEditing({ id: line.id, row: i, value: t });
                          setRow(i, t);
                        }}
                        onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
                        onBlur={() => {
                          // The row is left unless it has the focus again straight away (the switch to the phone's
                          // keyboard, or a key that took the focus for a moment).
                          setTimeout(() => !inputs.current[i]?.isFocused() && setEditing((e) => (e && e.row === i ? null : e)), 120);
                        }}
                        inputMode={withKeys ? 'none' : 'text'}
                        showSoftInputOnFocus={!withKeys}
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        style={[styles.rowInput, !r.part && styles.wordsInput, wordsLaid[i] && styles.laidOut]}
                        accessibilityLabel={`${r.part ? partName(r.part) : 'Words'}, line ${current + 1}`}
                      />
                    );
                  })}
                  {/* Each row of words, set under its part's notes; tap it to type (it then shows as typed). */}
                  <View style={styles.overlay} aria-hidden importantForAccessibility="no-hide-descendants">
                    {wordsLaid.flatMap((w, i) =>
                      (w ?? []).map((s, k) => (
                        <Text key={`${i}-${k}`} numberOfLines={1} style={[styles.syllable, { top: i * ROW_HEIGHT, left: ROW_PAD + s.at * charWidth }]}>
                          {s.text}
                        </Text>
                      )),
                    )}
                  </View>
                  {/* Each bar line drawn through the parts' rows, as on the sheet, over the typed "|". It's left out
                      where it crosses a row of words, and a row being typed in shows its own. Placed by a transform,
                      which browsers don't round to whole pixels as they do a position: the line then covers the "|". */}
                  <View style={styles.overlay}>
                    {rows.flatMap((r, i) =>
                      r.part
                        ? barColumns(valueOf(i)).map((c) => (
                            <View key={`${i}-${c}`} style={[styles.barLine, { top: i * ROW_HEIGHT, transform: [{ translateX: ROW_PAD + (c + 0.5) * charWidth - BAR_LINE / 2 }] }]} />
                          ))
                        : [],
                    )}
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
          <View style={[styles.pad, { gap: 6 }]}>
            {Object.entries(byPart).map(([part, messages]) => (
              <Text key={part} style={styles.problem}>
                <Text style={{ color: ink(part), fontFamily: fonts.heavy }}>{partName(part)}: </Text>
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
            {keyNotes.map((k) => (
              <Text key={k} style={styles.small}>
                {k}
              </Text>
            ))}
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

      <View style={[styles.footer, keypad && styles.footerSolid]}>
        {keypad ? (
          <SolfaKeypad onKey={pressKey} onDone={leaveRow} onKeyboard={useKeyboard} />
        ) : (
          <View style={styles.footerInner}>
            <Button kind="ghost" label="Back" onPress={() => go(current - 1)} disabled={current === 0} style={{ minWidth: 92 }} />
            <Button label={line.skipped ? 'Next line' : 'Looks right'} onPress={line.skipped ? () => (current === lines.length - 1 ? onFinish() : go(current + 1)) : looksRight} style={{ flex: 1 }} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Puts a field's cursor at `sel`: in a browser on the field itself, on a phone through React Native. */
function placeCursor(field: TextInputInstance | null | undefined, sel: Selection) {
  const f = field as unknown as { setSelectionRange?: (a: number, b: number) => void; setSelection?: (a: number, b: number) => void } | null;
  if (f?.setSelectionRange) f.setSelectionRange(sel.start, sel.end);
  else f?.setSelection?.(sel.start, sel.end);
}

/* ---------- 4. Finish ---------- */

function FinishStep(props: { lines: Line[]; heading: Heading; time: string; setTime(t: string): void; attached?: string; onOpen(i: number): void; onSave(): void }) {
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryN, { color }]}>{n}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  iconButtonGhost: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line },
  iconButtonText: { fontFamily: fonts.heavy, fontSize: 15.5, color: colors.onRed },
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
  thumbNo: { position: 'absolute', left: 6, bottom: 6, fontFamily: fonts.heavy, fontSize: 12, color: colors.onRed, backgroundColor: 'rgba(34,22,15,0.7)', borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden' },
  thumbRemove: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(34,22,15,0.75)', alignItems: 'center', justifyContent: 'center' },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.red, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.link },
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
  progressImg: { flex: 1, height: 42, backgroundColor: colors.card, borderRadius: 6, borderWidth: 1, borderColor: colors.line },
  progressMark: { width: 24, alignItems: 'center' },
  failMark: { fontFamily: fonts.heavy, fontSize: 16, color: colors.link },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeChip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6 },
  timeChipText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink },
  dots: { gap: 6, paddingVertical: 2 },
  dot: { minWidth: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  dotOn: { backgroundColor: colors.red, borderColor: colors.red },
  dotDone: { borderColor: colors.ok },
  dotSkipped: { opacity: 0.4 },
  dotText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ink },
  flush: { padding: 0, gap: 0, overflow: 'hidden' },
  pad: { paddingHorizontal: 14, paddingVertical: 10 },
  iconOnly: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  rowsBox: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.sand },
  tags: { width: 18, borderRightWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  numbersTop: { height: NUMBERS_HEIGHT, borderBottomWidth: 1, borderColor: colors.line },
  numbers: { height: NUMBERS_HEIGHT, borderBottomWidth: 1, borderColor: colors.line },
  number: { position: 'absolute', top: 0, fontFamily: fonts.bold, fontSize: 10.5, lineHeight: NUMBERS_HEIGHT - 1, color: colors.muted },
  tagCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  tag: { width: 6, height: ROW_HEIGHT - 12, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontFamily: fonts.bold, fontSize: 12 },
  rowInput: {
    // Placed, so it's drawn over the tints placed before it (a browser draws placed boxes last, in order).
    position: 'relative',
    height: ROW_HEIGHT,
    paddingHorizontal: ROW_PAD,
    fontFamily: fonts.mono,
    fontSize: 14.5,
    color: colors.ink,
    borderBottomWidth: 1,
    borderColor: colors.line,
    outlineColor: colors.red,
  },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  // Both marks stop above the row's own border, which is drawn over them; the bar's is the stronger.
  barTint: { position: 'absolute', height: ROW_HEIGHT - 1, borderBottomWidth: 2, borderColor: colors.red, backgroundColor: colors.redTint },
  wholeMark: { position: 'absolute', left: 0, right: 0, height: ROW_HEIGHT - 1, borderBottomWidth: 2, borderColor: colors.warnLine },
  beats: { position: 'absolute', top: 2, left: 4, minWidth: 13, height: 12, borderRadius: 6, paddingHorizontal: 3, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  beatsText: { fontFamily: fonts.heavy, fontSize: 10, lineHeight: 12, color: colors.onRed },
  barLine: { position: 'absolute', left: 0, width: BAR_LINE, height: ROW_HEIGHT, backgroundColor: colors.ink },
  measureBox: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
  measureWide: { width: 4000, alignItems: 'flex-start' },
  measureText: { fontFamily: fonts.mono, fontSize: 14.5 },
  wordsInput: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, color: colors.muted },
  // A row of words shown set under its notes: its own text hidden behind the syllables, until it's typed in.
  laidOut: { color: 'transparent' },
  syllable: { position: 'absolute', height: ROW_HEIGHT, lineHeight: ROW_HEIGHT, fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, color: colors.muted },
  problem: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.redDeep },
  doubt: { borderRadius: 999, backgroundColor: colors.warnTint, paddingHorizontal: 10, paddingVertical: 4 },
  doubtText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.warn },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  okText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ok, flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderColor: colors.line },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8 },
  toolText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.glass, borderTopWidth: 1, borderColor: colors.line },
  footerSolid: { backgroundColor: colors.sand },
  unfinished: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: colors.line },
  unfinishedTitle: { fontFamily: fonts.heavy, fontSize: 16, color: colors.ink },
  unfinishedButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerInner: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  summary: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  summaryCell: { alignItems: 'center', gap: 2 },
  summaryN: { fontFamily: fonts.heavy, fontSize: 26 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
}));
