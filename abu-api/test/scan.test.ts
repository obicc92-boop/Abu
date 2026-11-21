/** Scanning sheets: the daily allowance, the routes, and how Claude's answers are shaped. */
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureUser } from '../src/domain/groups';
import { scanAllowance, useScan } from '../src/domain/scan';
import app from '../src/index';
import { CHECK_SYSTEM, checkLine, cleanPage, fixLine, keyName, keyOf, LINE_SCHEMA, LINE_SYSTEM, lineText, MARK_RULES, MARKS_SYSTEM, SIGN_FIX, readHeading, readLine, readLineWords, readMarks, readPage, readWords, rowsAnswer, tempoOf, tidyMarks, tidySlurs, timeOf, WORDS_MARKS_SYSTEM } from '../src/scan';
import { call, ORIGIN, signUp } from './helpers';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** Claude's reply, as the Messages API sends it, holding `answer` as its JSON text. */
function claudeReplies(answer: unknown, stop_reason = 'end_turn') {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/v1/messages')) throw new Error(`unexpected fetch ${url}`);
    return new Response(
      JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  });
}
const withKey = { ...env, ANTHROPIC_API_KEY: 'test-key' } as Env;

afterEach(() => vi.restoreAllMocks());

describe('the daily allowance', () => {
  it('counts pages and lines per person, and refuses past the limit', async () => {
    await ensureUser(env.DB, { id: 'scan-a', name: 'Scanner A' });
    const limits = { pages: 2, lines: 3, allLines: 100 };
    await useScan(env.DB, 'scan-a', 'page', limits);
    await useScan(env.DB, 'scan-a', 'page', limits);
    await expect(useScan(env.DB, 'scan-a', 'page', limits)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('2 pages') });
    for (let i = 0; i < 3; i++) await useScan(env.DB, 'scan-a', 'line', limits);
    await expect(useScan(env.DB, 'scan-a', 'line', limits)).rejects.toMatchObject({ status: 429 });
    expect(await scanAllowance(env.DB, 'scan-a', limits)).toEqual({ pages: 0, lines: 0 });
  });

  it('stops everyone once SolfaScores’ daily total is reached', async () => {
    await ensureUser(env.DB, { id: 'scan-b', name: 'Scanner B' });
    await ensureUser(env.DB, { id: 'scan-c', name: 'Scanner C' });
    const day = new Date().toISOString().slice(0, 10);
    const before = await env.DB.prepare(`select coalesce(sum(lines), 0) as n from scan_usage where day = ?`).bind(day).first<{ n: number }>();
    const limits = { pages: 10, lines: 10, allLines: (before?.n ?? 0) + 2 };
    await useScan(env.DB, 'scan-b', 'line', limits);
    await useScan(env.DB, 'scan-b', 'line', limits);
    await expect(useScan(env.DB, 'scan-c', 'line', limits)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('today') });
  });
});

describe('the routes', () => {
  it('need a signed-in person', async () => {
    const res = await call('/scan/line?parts=S', { method: 'POST', body: JPEG, headers: { 'content-type': 'image/jpeg' } });
    expect(res.status).toBe(401);
  });

  it('say Claude is off when there is no key, without using the allowance', async () => {
    const { cookie } = await signUp('Off Scanner');
    const res = await call('/scan/page?w=800&h=1100', { method: 'POST', body: JPEG, headers: { 'content-type': 'image/jpeg' }, cookie });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'The AI reader isn’t switched on for scanning.' });
    const left = await call('/scan/allowance', { cookie });
    // The allowance, and which readers the app can call: never Claude without a key.
    expect(await left.json()).toMatchObject({ pages: 40, lines: 400, readers: { anthropic: false } });
  });

  it('check a correction request before reaching any reader', async () => {
    const { cookie } = await signUp('Fix Scanner');
    const res = await call('/scan/fix?parts=S,A', { method: 'POST', body: JPEG, headers: { 'content-type': 'image/jpeg' }, cookie });
    expect(res.status).toBe(400);
    const left = await call('/scan/allowance', { cookie });
    expect(await left.json()).toMatchObject({ lines: 400 });
  });
});

/** Cloudflare's reader as the AI binding answers, holding `answer` as its text; or failing with `error`. */
function cloudflare(answer: string, error?: string) {
  const run = vi.fn(async (_model: string, _input: unknown) => {
    if (error) throw new Error(error);
    return { choices: [{ message: { content: answer } }], usage: { prompt_tokens: 10, completion_tokens: 10 } };
  });
  return { env: { ...env, AI: { run } as unknown as Ai } as Env, run };
}

describe('reading with Cloudflare’s reader', () => {
  it('corrects a line the own model read, as rows in SolfaScores’ format', async () => {
    const { env: withAi, run } = cloudflare('```\nS  s1 | d :-.r /m :d |\nA  s1 | d :t1 /d :d\nW  O come let us\n```');
    const r = await fixLine(withAi, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], time: '4/4', key: 'G', draft: 'S  s1 | d :r /m :d |\nA  s1 | d :t1 /d :d |' });
    expect(r.text).toBe('S  s1 | d :-.r /m :d |\nW  O come let us\nA  s1 | d :t1 /d :d |');
    // The picture and the own model's reading go to Mistral, with the line's parts, time and key.
    const [model, input] = run.mock.calls[0] as [string, { messages: { role: string; content: unknown }[] }];
    expect(model).toBe('@cf/mistralai/mistral-small-3.1-24b-instruct');
    const user = JSON.stringify(input.messages[1].content);
    expect(user).toContain('data:image/jpeg;base64,');
    expect(user).toContain('Parts, top to bottom: S, A. Time 4/4: 4 beats in a full bar. Doh is G.');
    expect(user).toContain('A small model read the line as');
  });

  it('reads a row of words', async () => {
    const { env: withAi } = cloudflare('"All peo-ple that on earth do dwell,"\n');
    expect(await readWords(withAi, JPEG.buffer, 'image/jpeg')).toBe('All peo-ple that on earth do dwell,');
  });

  it('leaves out a part’s name read from the left edge of a row of words', async () => {
    const { env: withAi } = cloudflare('S Blessing and honour,');
    expect(await readWords(withAi, JPEG.buffer, 'image/jpeg')).toBe('Blessing and honour,');
    const { env: again } = cloudflare('A -men, A -men.');
    expect(await readWords(again, JPEG.buffer, 'image/jpeg')).toBe('A -men, A -men.');
  });

  it('reads a sheet’s heading: title, composer, key and time', async () => {
    const { env: withAi, run } = cloudflare('Title: Adam lay ybounen\nComposer: Boris Ord\nKey:\nTime: Allegretto 3/4');
    expect(await readHeading(withAi, JPEG.buffer, 'image/jpeg')).toEqual({ title: 'Adam lay ybounen', composer: 'Boris Ord', key: '', time: '3/4', tempo: 'Allegretto' });
    expect(JSON.stringify((run.mock.calls[0] as [string, { messages: { content: unknown }[] }])[1].messages[0].content)).toContain('time signature');
    // The time, key and tempo are found wherever they were put.
    const { env: again } = cloudflare('Title: EKELE MARIA\nComposer: Johnpaul Okwor\nKey: G 3/4 moderato\nTime:');
    expect(await readHeading(again, JPEG.buffer, 'image/jpeg')).toEqual({ title: 'EKELE MARIA', composer: 'Johnpaul Okwor', key: 'G', time: '3/4', tempo: 'moderato' });
    const { env: none } = cloudflare('Title: Bless The Lord\nComposer: none\nKey:\nTime: Taize');
    expect(await readHeading(none, JPEG.buffer, 'image/jpeg')).toEqual({ title: 'Bless The Lord', composer: '', key: '', time: '', tempo: '' });
  });

  it('finds the key’s note and the time however they’re written', () => {
    expect(keyOf('Key: Key Ab', 'Key Ab')).toBe('A♭');
    expect(keyOf('Key: Doh is F\nTime: 4/4', 'Doh is F')).toBe('F');
    expect(keyOf('Key: E flat', 'E flat')).toBe('E♭');
    expect(keyOf('Title: Key F 4/4 (Meno Allegro)', '')).toBe('F');
    expect(keyOf('Key: F#', 'F#')).toBe('F♯');
    expect(keyOf('Key: Bb 4 (Moderato)', 'Bb 4 (Moderato)')).toBe('B♭');
    expect(keyOf('Key: Jude', 'Jude')).toBe('');
    expect(keyOf('Key: By Jude Nnam', 'By Jude Nnam')).toBe('');
    expect(keyOf('Key: key G', 'key G')).toBe('G');
    expect(timeOf('Key: Key Eb 2/4')).toBe('2/4');
    expect(timeOf('Time: (Common time)')).toBe('4/4');
    expect(timeOf('Time: 12/8')).toBe('12/8');
    expect(timeOf('Key: F 4 J=72')).toBe('');
  });

  it('says when today’s free reading is used up', async () => {
    const { env: withAi } = cloudflare('', '4006: you have used up your daily free allocation of 10,000 neurons');
    await expect(readWords(withAi, JPEG.buffer, 'image/jpeg')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('free AI reading') });
  });

  it('shapes an answer with stray text and long part names', () => {
    expect(rowsAnswer('Here is the line:\nSoprano: d :r |\nAlto  t1 :d |\nTenor m :f |', ['S', 'A'])).toBe('S  d :r |\nA  t1 :d |');
  });

  it('is asked to copy the markings printed with a line, and keeps them in their rows', async () => {
    const { env: withAi, run } = cloudflare('{Andante M. 70}\nS  {p}d :r /m :f | {cresc}s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |');
    const r = await fixLine(withAi, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], time: '4/4', draft: 'S  d :r /m :f | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |' });
    // A tempo given on a row of its own above the line goes before the top part's first note.
    expect(r.text).toBe('S  {Andante M. 70}{p}d :r /m :f | {cresc}s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |');
    const system = (run.mock.calls[0] as [string, { messages: { role: string; content: string }[] }])[1].messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toContain('in braces, just before the note');
    expect(system.content).toContain('{Andante M. 70}');
    expect(system.content).toContain('Copy only the marks and slurs that are printed');
    expect(system.content).toContain('add the ones printed');
  });

  it('reads the tempo printed in a heading, as printed', async () => {
    const { env: withAi, run } = cloudflare('Title: Comfort ye\nComposer: Handel\nKey: Doh is E\nTime: 4/4\nTempo: Larghetto, M. 79');
    expect(await readHeading(withAi, JPEG.buffer, 'image/jpeg')).toEqual({ title: 'Comfort ye', composer: 'Handel', key: 'E', time: '4/4', tempo: 'Larghetto, M. 79' });
    expect(JSON.stringify((run.mock.calls[0] as [string, { messages: { content: unknown }[] }])[1].messages[0].content)).toContain('Tempo: the speed or mood, as written');
    // A reader's guess that isn't a tempo SolfaScores knows is left out; a ♩ read as a J is a ♩.
    for (const [tempo, want] of [['Maestoso', 'Maestoso'], ['With feeling', 'With feeling'], ['none', ''], ['4/4', ''], ['Joyful', ''], ['Solo', ''], ['Andante. M. 70', 'Andante. M. 70'], ['J = 72', '♩ = 72'], ['(M.M. 60)', 'M.M. 60']]) {
      const { env: again } = cloudflare(`Title: Psalm 23\nComposer:\nKey: F\nTime: 3/4\nTempo: ${tempo}`);
      expect((await readHeading(again, JPEG.buffer, 'image/jpeg')).tempo).toBe(want);
    }
  });
});

describe('markings in a line, as a reader writes them', () => {
  it('are told to every line reader, in the prompt and the schema', () => {
    expect(LINE_SYSTEM).toContain('`{pp}` `{p}` `{mp}` `{mf}` `{f}` `{ff}`');
    expect(LINE_SYSTEM).toContain('`{cresc}` `{dim}`, a hairpin `{<}` or `{>}` before the note where the wedge starts, `{rit}` `{rall}` `{accel}` `{a tempo}`');
    expect(LINE_SYSTEM).toContain('a tempo or direction as printed (`{Andante M. 70}`, `{Maestoso}`, `{dolce}`, `{With feeling}`)');
    expect(LINE_SYSTEM).toContain('Braces are not beats');
    // Haiku and Cloudflare's reader check with the same rules.
    expect(CHECK_SYSTEM.startsWith(LINE_SYSTEM)).toBe(true);
    expect(LINE_SCHEMA.properties.rows.items.properties.notes.description).toContain('braces');
  });

  it('are tidied so nothing in one passes for a beat mark, a bar line or a bridge note', () => {
    expect(tidyMarks('{p}d :r /{ f }m :f |')).toBe('{p}d :r /{f}m :f |');
    expect(tidyMarks('{♩ = 70}d :- |')).toBe('{♩ 70}d :- |');
    expect(tidyMarks('{M.M.=60}d :r | {a | tempo}m :- |')).toBe('{M.M. 60}d :r | {a tempo}m :- |');
    expect(tidyMarks('{}d :r {p m :f |')).toBe(' d :r p m :f |');
  });

  it('come through from Claude in each part’s row', async () => {
    claudeReplies({ rows: [{ part: 'S', notes: '{Andante M. 70}d :r /{mf}m :f | {rit}s :- /- :- |', words: '' }, { part: 'A', notes: '{mf}d :t1 /d :d | m :- /- :- |', words: '' }], doubts: [], key: '' });
    const line = await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], time: '4/4' });
    expect(line.text).toBe('S  {Andante M. 70}d :r /{mf}m :f | {rit}s :- /- :- |\nA  {mf}d :t1 /d :d | m :- /- :- |');
    // One copied into the words isn't sung.
    expect(lineText({ rows: [{ part: 'S', notes: 'd :r |', words: '{p} Glo-ry' }] }, ['S'])).toBe('S  d :r |\nW  Glo-ry');
  });

  it('slurs: every line reader is told to copy them, in round brackets', () => {
    expect(LINE_SYSTEM).toContain("A slur (notes underlined, or joined by a curve: sung to one syllable) goes in round brackets from its first note to its last: `(m'.d')`, `(s :f |m)`");
    expect(LINE_SYSTEM).toContain('Brackets are not beats either.\n- Copy only the marks and slurs that are printed.');
    expect(CHECK_SYSTEM).toContain('It usually leaves markings and slurs out: add the ones printed.');
    expect(LINE_SCHEMA.properties.rows.items.properties.notes.description).toContain('slurs in round brackets');
  });

  it('slurs: kept whole in each row, a stray bracket dropped so the row still reads', () => {
    expect(tidySlurs("(m'.d') :(d'.s) |")).toBe("(m'.d') :(d'.s) |");
    expect(tidySlurs('(s :f |m) :r |')).toBe('(s :f |m) :r |');
    // One closing none, one left open, one inside another, and a pair around no note.
    expect(tidySlurs('d :r) |')).toBe('d :r |');
    expect(tidySlurs('d :(r |')).toBe('d :r |');
    expect(tidySlurs('((d.r)) :m |')).toBe('(d.r) :m |');
    expect(tidySlurs('d :( - ) |')).toBe('d : -  |');
    // A mark's own brackets aren't a slur, and go with tidyMarks.
    expect(tidySlurs('{Moderato (M. 84)}(d.r) :m |')).toBe('{Moderato (M. 84)}(d.r) :m |');
    expect(lineText({ rows: [{ part: 'S', notes: '{Moderato (M. 84)}(d.r) :m) |', words: '(Glo-ry) be' }] }, ['S'])).toBe('S  {Moderato M. 84}(d.r) :m |\nW  Glo-ry be');
  });

  it('slurs: come through from Claude in each part’s row', async () => {
    claudeReplies({ rows: [{ part: 'S', notes: "(m'.d') :(d'.s) | (s :f | m) :- |", words: 'Glo- ry be' }], doubts: [], key: '' });
    const line = await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'], time: '2/4' });
    expect(line.text).toBe("S  (m'.d') :(d'.s) | (s :f | m) :- |\nW  Glo- ry be");
  });

  it('find a tempo in what was read', () => {
    expect(tempoOf('Andante. M. 70')).toBe('Andante. M. 70');
    expect(tempoOf('', 'Key: Bb 4 (Moderato)')).toBe('Moderato');
    expect(tempoOf('Allegro moderato ♩=120')).toBe('Allegro moderato ♩=120');
    expect(tempoOf('Andante (M. 70)')).toBe('Andante (M. 70)');
    expect(tempoOf('Key: F 4 J=72')).toBe('♩=72');
    expect(tempoOf('Joyful', 'Doh is G', '4/4', 'Matthew 70')).toBe('');
    // The reader's own Tempo line may be a direction with no set speed, as printed.
    expect(['Maestoso', 'Slowly', 'With feeling', 'Maestoso M. 80', 'Tutti'].map((t) => tempoOf(t))).toEqual(['Maestoso', 'Slowly', 'With feeling', 'Maestoso M. 80', '']);
    expect(tempoOf('', 'Key: G Maestoso')).toBe('');
  });
});

describe('reading with Claude', () => {
  it('finds the lines on a page, inside the picture and in reading order', async () => {
    const fetch = claudeReplies({
      title: ' Vovome ',
      composer: 'K. W. B. Mensah',
      key: 'F',
      time: '2/4',
      tempo: 'Andante. M. 70',
      lines: [
        { top: 600, bottom: 900, left: 10, right: 790, parts: ['Soprano', 'Alto', 'Tenor', 'Bass'], words_rows: 1 },
        { top: 100, bottom: 400, left: -5, right: 1200, parts: ['S', 'A', 'T', 'B'], words_rows: 1 },
        { top: 950, bottom: 952, left: 0, right: 800, parts: ['S'], words_rows: 0 },
      ],
    });
    const page = await readPage(withKey, JPEG.buffer, 'image/jpeg', 800, 1100);
    expect(page).toEqual({
      title: 'Vovome',
      composer: 'K. W. B. Mensah',
      key: 'F',
      time: '2/4',
      tempo: 'Andante. M. 70',
      lines: [
        { top: 100, bottom: 400, left: 0, right: 800, parts: ['S', 'A', 'T', 'B'], words: 1 },
        { top: 600, bottom: 900, left: 10, right: 790, parts: ['S', 'A', 'T', 'B'], words: 1 },
      ],
    });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    // Haiku finds the lines; Opus is kept for reading lines from scratch.
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.output_config.format.schema.required).toContain('tempo');
    expect(request.messages[0].content[0].source).toMatchObject({ type: 'base64', media_type: 'image/jpeg' });
  });

  it('reads a line into SolfaScores text with each part’s words under it', async () => {
    const fetch = claudeReplies({
      rows: [
        { part: 'S', notes: 's1 | d :-.r /m :d | f :m /r :-', words: 'O come let  us a-dore him' },
        { part: 'A', notes: '| s1 | d :t1 /d :d | d :d /t1 :- |', words: '' },
        { part: 'T', notes: 'm | m :s /s :m | l :s /s :- |', words: 'Ke-re-si-me-sie' },
      ],
      doubts: [{ part: 'A', bar: 2 }, { part: 'X', bar: 1 }],
    });
    const line = await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A', 'T'], time: '4/4', key: 'Ab' });
    expect(line).toEqual({
      text: 'S  s1 | d :-.r /m :d | f :m /r :- |\nW  O come let us a-dore him\nA  s1 | d :t1 /d :d | d :d /t1 :- |\nT  m | m :s /s :m | l :s /s :- |\nW  Ke-re-si-me-sie',
      doubts: [{ part: 'A', bar: 2 }],
    });
    // Asked for each part's words.
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.output_config.format.schema.properties.rows.items.required).toEqual(['part', 'notes', 'words']);
  });

  it('reads a line from scratch with the strong reader', async () => {
    const fetch = claudeReplies({ rows: [{ part: 'S', notes: 'd :r', words: '' }], doubts: [] });
    await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'] });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).model).toBe('claude-opus-5-5');
  });

  it('has Haiku check the reading SolfaScores’ own model made, with the picture', async () => {
    const fetch = claudeReplies({ rows: [{ part: 'S', notes: "d :r /m :f | s :- /- :- |", words: 'Glo-ry to God' }], doubts: [{ part: 'S', bar: 1 }] });
    const line = await checkLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'], time: '4/4', draft: 'S  d :r /m :f | s :- /- :- |' });
    expect(line).toEqual({ text: 'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God', doubts: [{ part: 'S', bar: 1 }] });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.messages[0].content[1].text).toContain('A small model read the line as:\nS  d :r /m :f');
  });

  it('has Opus copy a line’s words, each part’s, given its notes, at low effort', async () => {
    const fetch = claudeReplies({
      rows: [
        { part: 'S', words: 'E  Ke-re-si-me-si Lu te go' },
        { part: 'Alto', words: '' },
        { part: 'T', words: 'Le kwa-nu' },
      ],
    });
    const got = await readLineWords(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A', 'T', 'B'], notes: 'S  m :- |\nA  d :- |\nT  s :- |\nB  d :- |' });
    expect(got).toEqual({
      words: [
        { after: 0, text: 'E Ke-re-si-me-si Lu te go' },
        { after: 2, text: 'Le kwa-nu' },
      ],
    });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.output_config.effort).toBe('low');
    expect(request.messages[0].content[1].text).toContain("The line's notes as read:\nS  m :- |");
  });

  it('gives a new key written with a line, as SolfaScores writes keys, and asks for one', async () => {
    const fetch = claudeReplies({ rows: [{ part: 'S', notes: 'd :r /m :f |', words: '' }], doubts: [], key: 'Bb' });
    const line = await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'], time: '4/4' });
    expect(line.key).toBe('B♭');
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.output_config.format.schema.required).toContain('key');
    claudeReplies({ rows: [{ part: 'S', notes: 'd :r |', words: '' }], doubts: [], key: '' });
    expect((await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'] })).key).toBeUndefined();
    claudeReplies({ rows: [{ part: 'S', words: 'Glo-ry' }], key: 'F sharp' });
    expect(await readLineWords(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'], notes: 'S  d :- |' })).toEqual({ words: [{ after: 0, text: 'Glo-ry' }], key: 'F♯' });
  });

  it('names a key however a reader writes it, and nothing that isn’t one', () => {
    expect(['F', 'Bb', 'b flat', 'E♭', 'F#', 'Key G', 'Doh is D', 'A major'].map(keyName)).toEqual(['F', 'B♭', 'B♭', 'E♭', 'F♯', 'G', 'D', 'A']);
    expect(['', 'none', 'H', 'F minor 7', undefined].map(keyName)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('says plainly when a picture can’t be read', async () => {
    claudeReplies({}, 'refusal');
    await expect(readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'] })).rejects.toMatchObject({ status: 422 });
  });
});

describe('shaping', () => {
  it('keeps unknown parts out of the page and gives a lone line a soprano', () => {
    const page = cleanPage({ lines: [{ top: 10, bottom: 60, left: 0, right: 100, parts: ['Piano'] }], time: 'four' }, 100, 100);
    expect(page.lines[0].parts).toEqual(['S']);
    expect(page.time).toBe('');
  });

  it('names rows by position when the reader leaves the part out', () => {
    expect(lineText({ rows: [{ notes: 'd :r' }, { part: '?', notes: 'm :f |' }] }, ['T', 'B'])).toBe('T  d :r |\nB  m :f |');
  });
});

describe('reading the marks of a line that reads right already', () => {
  const ROWS = 'S  d :r /m :f | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |';

  it('has Opus give the rows back marked with the words, in the same call, when asked', async () => {
    const fetch = claudeReplies({
      rows: [
        { part: 'S', words: 'Glo-ry be to God', notes: '{p}d :r /(m :f) | {rit}s :- /- :- |' },
        { part: 'A', words: '', notes: '{p}d :t1 /d :d | m :- /- :- |' },
      ],
      key: '',
    });
    const got = await readLineWords(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], notes: ROWS, marks: true });
    expect(got).toEqual({ words: [{ after: 0, text: 'Glo-ry be to God' }], notes: 'S  {p}d :r /(m :f) | {rit}s :- /- :- |\nA  {p}d :t1 /d :d | m :- /- :- |' });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.system[0].text).toBe(WORDS_MARKS_SYSTEM);
    expect(WORDS_MARKS_SYSTEM).toContain(MARK_RULES);
    expect(request.output_config.format.schema.properties.rows.items.required).toEqual(['part', 'words', 'notes']);
    // Not asked: the words only, as before.
    const plain = claudeReplies({ rows: [{ part: 'S', words: 'Glo-ry' }], key: '' });
    expect(await readLineWords(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'], notes: 'S  d :- |' })).toEqual({ words: [{ after: 0, text: 'Glo-ry' }] });
    expect(JSON.parse(String(plain.mock.calls.at(-1)?.[1]?.body)).output_config.format.schema.properties.rows.items.required).toEqual(['part', 'words']);
  });

  it('asks Cloudflare’s reader for the rows marked, tightly, and shapes its answer', async () => {
    const { env: withAi, run } = cloudflare('Here are the rows:\nS  {<}d :r /(m :f) | s :- /- :- {>}\nA  d :t1 /d :d | m :- /- :- |');
    const got = await readMarks(withAi, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], notes: ROWS, by: 'cloudflare' });
    // Nothing else touched: no bar line added to a row left without one.
    expect(got.text).toBe('S  {<}d :r /(m :f) | s :- /- :- {>}\nA  d :t1 /d :d | m :- /- :- |');
    const [model, input] = run.mock.calls[0] as [string, { messages: { role: string; content: unknown }[]; max_tokens: number }];
    expect(model).toBe('@cf/mistralai/mistral-small-3.1-24b-instruct');
    expect(String(input.messages[0].content).startsWith(MARKS_SYSTEM)).toBe(true);
    expect(MARKS_SYSTEM).toContain(MARK_RULES);
    expect(MARKS_SYSTEM).toContain('Never change, add or take out a note');
    expect((input.messages[1].content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text).toBe(`Parts, top to bottom: S, A. The line's rows as read:\n${ROWS}`);
    expect(input.max_tokens).toBeLessThan(400);
  });

  it('asks Haiku, at low effort, when it’s Claude’s turn', async () => {
    const fetch = claudeReplies({ rows: [{ part: 'S', notes: '{Maestoso}d :r /m :f | s :- /- :- |' }, { part: 'A', notes: 'd :t1 /d :d | m :- /- :- |' }] });
    const got = await readMarks(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], notes: ROWS, by: 'claude' });
    expect(got.text).toBe('S  {Maestoso}d :r /m :f | s :- /- :- |\nA  d :t1 /d :d | m :- /- :- |');
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.output_config.effort).toBe('low');
    expect(request.max_tokens).toBe(4000);
    expect(request.system[0].text).toBe(MARKS_SYSTEM);
  });

  it('counts each marks reading as a line in the day’s allowance, and checks the request first', async () => {
    const { cookie } = await signUp('Marks Scanner');
    const { env: withAi } = cloudflare('S  {p}d :r |');
    const send = (q: string, e: Env) =>
      app.request(`/api/scan/marks?${q}`, { method: 'POST', body: JPEG, headers: { 'content-type': 'image/jpeg', origin: ORIGIN, cookie } }, e);
    const res = await send(`parts=S&notes=${encodeURIComponent('S  d :r |')}`, withAi);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'S  {p}d :r |' });
    // No rows sent, or Claude asked for without a key: refused before anything is counted.
    expect((await send('parts=S', withAi)).status).toBe(400);
    expect((await send(`parts=S&by=claude&notes=${encodeURIComponent('S  d :r |')}`, withAi)).status).toBe(503);
    const left = await call('/scan/allowance', { cookie });
    expect(await left.json()).toMatchObject({ lines: 399 });
  });
});

describe('repeats and jumps', () => {
  it('every reader is told what they look like, and that a segno is never a note', () => {
    expect(MARK_RULES).toContain('a segno `{segno}` (𝄋: an S with a slanting stroke through it and a dot each side; by hand it can look like $ or §)');
    expect(MARK_RULES).toContain('a coda sign `{coda}` (𝄌: a circle or oval with a cross through it)');
    expect(MARK_RULES).toContain('a start repeat `{|:}`');
    expect(MARK_RULES).toContain('`{D.S.}` (Dal Segno), `{D.S. al Fine}`, `{D.S. al Coda}`, `{D.C.}` (Da Capo), `{D.C. al Fine}`, `{D.C. al Coda}`, `{Fine}`, `{to coda}`, and an end repeat `{:|}`');
    expect(MARK_RULES).toContain('A segno or coda sign is never a note or a bridge note, and repeat dots are never beat marks.');
    for (const system of [LINE_SYSTEM, CHECK_SYSTEM, MARKS_SYSTEM, WORDS_MARKS_SYSTEM]) expect(system).toContain(MARK_RULES);
    // A reader given a reading may change a note for this one thing only.
    expect(MARKS_SYSTEM).toContain(SIGN_FIX);
    expect(WORDS_MARKS_SYSTEM).toContain(SIGN_FIX);
    expect(SIGN_FIX).toContain("as a bridge note (`s=d'`), is written as the sign instead (`{segno}d'`)");
    expect(CHECK_SYSTEM).toContain('It may have read a segno or coda sign as a note: write it as the sign.');
  });

  it('are spelt as SolfaScores spells them, the repeats keeping their bar line and dots', () => {
    expect(tidyMarks('{|:}d :r | m :f {:|} |')).toBe('{|:}d :r | m :f {:|} |');
    expect(tidyMarks('{:||}d :r | {Dal Segno al fine}m :f | {dc} |')).toBe('{:|}d :r | {D.S. al Fine}m :f | {D.C.} |');
    expect(tidyMarks('{𝄋}d :r | {fine} {To Coda} {1st time}m |')).toBe('{segno}d :r | {Fine} {to coda} {1.}m |');
    expect(lineText({ rows: [{ part: 'S', notes: "{segno}d' :-.d' /d' :d' {:|}" }] }, ['S'])).toBe("S  {segno}d' :-.d' /d' :d' {:|} |");
  });
});
