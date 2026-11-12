/** Scanning sheets: the daily allowance, the routes, and how Claude's answers are shaped. */
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureUser } from '../src/domain/groups';
import { scanAllowance, useScan } from '../src/domain/scan';
import { cleanPage, lineText, readLine, readPage } from '../src/scan';
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

  it('say scanning is off when there is no key, without using the allowance', async () => {
    const { cookie } = await signUp('Off Scanner');
    const res = await call('/scan/page?w=800&h=1100', { method: 'POST', body: JPEG, headers: { 'content-type': 'image/jpeg' }, cookie });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Scanning isn’t switched on yet.' });
    const left = await call('/scan/allowance', { cookie });
    expect(await left.json()).toEqual({ pages: 40, lines: 400 });
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
        { top: 100, bottom: 400, left: 0, right: 800, parts: ['S', 'A', 'T', 'B'] },
        { top: 600, bottom: 900, left: 10, right: 790, parts: ['S', 'A', 'T', 'B'] },
      ],
    });
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.model).toBe('claude-opus-5-5');
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
