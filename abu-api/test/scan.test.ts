/** Scanning sheets: the daily allowance, the routes, and how Claude's answers are shaped. */
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureUser } from '../src/domain/groups';
import { scanAllowance, useScan } from '../src/domain/scan';
import { checkLine, cleanPage, fixLine, lineText, readLine, readPage, readWords, rowsAnswer } from '../src/scan';
import { call, signUp } from './helpers';

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

  it('stops everyone once Abụ’s daily total is reached', async () => {
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
    expect(await res.json()).toEqual({ error: 'Claude isn’t switched on for scanning.' });
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
  it('corrects a line the own model read, as rows in Abụ’s format', async () => {
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

  it('says when today’s free reading is used up', async () => {
    const { env: withAi } = cloudflare('', '4006: you have used up your daily free allocation of 10,000 neurons');
    await expect(readWords(withAi, JPEG.buffer, 'image/jpeg')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('free AI reading') });
  });

  it('shapes an answer with stray text and long part names', () => {
    expect(rowsAnswer('Here is the line:\nSoprano: d :r |\nAlto  t1 :d |\nTenor m :f |', ['S', 'A'])).toBe('S  d :r |\nA  t1 :d |');
  });
});

describe('reading with Claude', () => {
  it('finds the lines on a page, inside the picture and in reading order', async () => {
    const fetch = claudeReplies({
      title: ' Vovome ',
      composer: 'K. W. B. Mensah',
      key: 'F',
      time: '2/4',
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
      lines: [
        { top: 100, bottom: 400, left: 0, right: 800, parts: ['S', 'A', 'T', 'B'], words: 1 },
        { top: 600, bottom: 900, left: 10, right: 790, parts: ['S', 'A', 'T', 'B'], words: 1 },
      ],
    });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    // Haiku finds the lines; Opus is kept for reading lines from scratch.
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.messages[0].content[0].source).toMatchObject({ type: 'base64', media_type: 'image/jpeg' });
  });

  it('reads a line into Abụ text with the words under the first row', async () => {
    claudeReplies({
      rows: [
        { part: 'S', notes: 's1 | d :-.r /m :d | f :m /r :-' },
        { part: 'A', notes: '| s1 | d :t1 /d :d | d :d /t1 :- |' },
      ],
      words: 'O come let  us a-dore him',
      doubts: [{ part: 'A', bar: 2 }, { part: 'X', bar: 1 }],
    });
    const line = await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S', 'A'], time: '4/4', key: 'Ab' });
    expect(line).toEqual({
      text: 'S  s1 | d :-.r /m :d | f :m /r :- |\nW  O come let us a-dore him\nA  s1 | d :t1 /d :d | d :d /t1 :- |',
      doubts: [{ part: 'A', bar: 2 }],
    });
  });

  it('reads a line from scratch with the strong reader', async () => {
    const fetch = claudeReplies({ rows: [{ part: 'S', notes: 'd :r' }], words: '', doubts: [] });
    await readLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'] });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).model).toBe('claude-opus-5-5');
  });

  it('has Haiku check the reading Abụ’s own model made, with the picture', async () => {
    const fetch = claudeReplies({ rows: [{ part: 'S', notes: "d :r /m :f | s :- /- :- |" }], words: 'Glo-ry to God', doubts: [{ part: 'S', bar: 1 }] });
    const line = await checkLine(withKey, JPEG.buffer, 'image/jpeg', { parts: ['S'], time: '4/4', draft: 'S  d :r /m :f | s :- /- :- |' });
    expect(line).toEqual({ text: 'S  d :r /m :f | s :- /- :- |\nW  Glo-ry to God', doubts: [{ part: 'S', bar: 1 }] });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.messages[0].content[1].text).toContain('A small model read the line as:\nS  d :r /m :f');
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
