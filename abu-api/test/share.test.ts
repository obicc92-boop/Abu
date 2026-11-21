/** Link previews: what WhatsApp and the like show for a song's link or an invite link (src/share.ts). */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createGroup, ensureUser } from '../src/domain/groups';
import { shareSong } from '../src/domain/songs';
import { previewFor, withPreview } from '../src/share';

const at = (path: string) => new URL(`https://solfascores.com${path}`);

const PAGE = `<!doctype html><html><head>
<meta name="description" content="Learn your part in tonic sol-fa." />
<meta property="og:title" content="SolfaScores" />
<meta property="og:description" content="Learn your part in tonic sol-fa." />
<meta property="og:url" content="https://solfascores.com/" />
<meta property="og:image" content="https://solfascores.com/share/solfascores.jpg" />
<meta name="twitter:title" content="SolfaScores" />
<meta name="twitter:description" content="Learn your part in tonic sol-fa." />
<title>SolfaScores</title></head><body><div id="root"></div></body></html>`;

describe('Link previews', () => {
  it('names a song open to everyone, and its composer', async () => {
    await ensureUser(env.DB, { id: 'share-user', name: 'Ada' });
    const song = await shareSong(env.DB, 'share-user', { title: 'Worthy is the Lamb', composer: 'G. F. Handel', doh: 2, time_signature: '4/4', audience: 'everyone' });
    expect(await previewFor(env.DB, at(`/song/${song.id}`))).toEqual({
      title: 'Worthy is the Lamb',
      description: 'G. F. Handel. Hear your part played and learn it in tonic sol-fa on SolfaScores.',
    });
    const plain = await shareSong(env.DB, 'share-user', { title: 'Old Hundredth', doh: 7, time_signature: '4/4', audience: 'everyone' });
    expect((await previewFor(env.DB, at(`/song/${plain.id}/`)))?.description).toBe('Hear your part played and learn it in tonic sol-fa on SolfaScores.');
  });

  it("keeps SolfaScores' own preview for a song that isn't everyone's, a missing song and other pages", async () => {
    await ensureUser(env.DB, { id: 'share-private', name: 'Ben' });
    const mine = await shareSong(env.DB, 'share-private', { title: 'My secret carol', doh: 0, time_signature: '3/4', audience: 'me' });
    expect(await previewFor(env.DB, at(`/song/${mine.id}`))).toBeNull();
    expect(await previewFor(env.DB, at('/song/nope'))).toBeNull();
    expect(await previewFor(env.DB, at('/'))).toBeNull();
    expect(await previewFor(env.DB, at('/event/some-service'))).toBeNull();
  });

  it('names the group for an invite link, as the join screen does', async () => {
    await ensureUser(env.DB, { id: 'share-leader', name: 'Emeka' });
    const group = await createGroup(env.DB, 'share-leader', { name: "St. Mary's Choir", type: 'catholic', church: "St. Mary's Catholic Church", town: 'Enugu' });
    const code = group.invite_code!;
    expect(await previewFor(env.DB, at(`/join?code=${code.toLowerCase()}`))).toEqual({
      title: "Join St. Mary's Choir on SolfaScores",
      description: `St. Mary's Catholic Church, Enugu. Learn your part and see the song orders. Invite code ${code}.`,
    });
    expect(await previewFor(env.DB, at('/join?code=NOPE99'))).toBeNull();
    expect(await previewFor(env.DB, at('/join'))).toBeNull();
  });

  it('writes the preview into the page', async () => {
    const page = new Response(PAGE, { headers: { 'content-type': 'text/html', etag: '"abc"' } });
    const res = withPreview(page, { title: 'Worthy is the Lamb', description: 'By G. F. Handel.' }, at('/song/x1'));
    expect(res.headers.get('etag')).toBeNull();
    const html = await res.text();
    expect(html).toContain('<title>Worthy is the Lamb · SolfaScores</title>');
    expect(html).toContain('<meta property="og:title" content="Worthy is the Lamb" />');
    expect(html).toContain('<meta name="twitter:title" content="Worthy is the Lamb" />');
    expect(html).toContain('<meta property="og:description" content="By G. F. Handel." />');
    expect(html).toContain('<meta name="description" content="By G. F. Handel." />');
    expect(html).toContain('<meta property="og:url" content="https://solfascores.com/song/x1" />');
    // The picture stays SolfaScores'.
    expect(html).toContain('content="https://solfascores.com/share/solfascores.jpg"');
  });

  it("serves a song's page with its name, and the API as before", async () => {
    await ensureUser(env.DB, { id: 'share-page', name: 'Chi' });
    const song = await shareSong(env.DB, 'share-page', { title: 'Amazing Grace', doh: 7, time_signature: '3/4', audience: 'everyone' });
    const res = await SELF.fetch(`https://abu.test/song/${song.id}`, { headers: { 'if-none-match': '"anything"' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Amazing Grace · SolfaScores</title>');
    expect((await SELF.fetch('https://abu.test/api/health')).status).toBe(200);
  });
});
