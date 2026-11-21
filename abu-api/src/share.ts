/**
 * Link previews (owner's request, 21 November 2026: a song's link sent on WhatsApp showed no picture and no name).
 * The web app's page carries SolfaScores' own preview (abu-app/public/index.html: og:title, og:image and the rest,
 * with the picture at /share/solfascores.jpg). For a song's link or an invite link, the Worker writes the song's or
 * the group's name into that page, so the chat shows what was shared. Only what anyone could see signed out: a song
 * only if it's open to everyone, a group only through its invite code (as the join screen shows it). Other pages,
 * and songs that aren't everyone's, keep SolfaScores' own preview.
 */
import { groupPreview } from './domain/groups';
import { getSong } from './domain/songs';

export interface Preview {
  title: string;
  description: string;
}

/** What a shared link's preview says, or null for SolfaScores' own. */
export async function previewFor(db: D1Database, url: URL): Promise<Preview | null> {
  const song = /^\/song\/([^/]+)\/?$/.exec(url.pathname);
  if (song) {
    const s = await getSong(db, decodeURIComponent(song[1]), null).catch(() => null);
    if (!s) return null;
    // The composer line as written ("G. F. Handel", "Old Hundredth · Genevan Psalter, 1551", "Trad.").
    const by = s.composer.trim();
    const learn = 'Hear your part played and learn it in tonic sol-fa on SolfaScores.';
    return { title: s.title, description: by ? `${by}${/[.!?]$/.test(by) ? '' : '.'} ${learn}` : learn };
  }
  const code = /^\/join\/?$/.test(url.pathname) ? url.searchParams.get('code')?.trim() : null;
  if (code) {
    const g = await groupPreview(db, code).catch(() => null);
    if (!g) return null;
    const where = [g.church, g.town].map((p) => p.trim()).filter(Boolean).join(', ');
    return {
      title: `Join ${g.name} on SolfaScores`,
      description: `${where ? `${where}. ` : ''}Learn your part and see the song orders. Invite code ${code.toUpperCase()}.`,
    };
  }
  return null;
}

/** Writes a preview into the web app's page: its title and the tags WhatsApp and other apps read. */
export function withPreview(page: Response, preview: Preview, url: URL): Response {
  const headers = new Headers(page.headers);
  // It's this link's page now, not the shared one the browser may hold.
  headers.delete('etag');
  headers.delete('last-modified');
  headers.set('cache-control', 'no-cache');
  const content = (value: string) => ({ element: (e: Element) => void e.setAttribute('content', value) });
  return new HTMLRewriter()
    .on('title', { element: (e) => void e.setInnerContent(preview.title.includes('SolfaScores') ? preview.title : `${preview.title} · SolfaScores`) })
    .on('meta[property="og:title"]', content(preview.title))
    .on('meta[name="twitter:title"]', content(preview.title))
    .on('meta[property="og:description"]', content(preview.description))
    .on('meta[name="twitter:description"]', content(preview.description))
    .on('meta[name="description"]', content(preview.description))
    .on('meta[property="og:url"]', content(url.href))
    .transform(new Response(page.body, { status: page.status, statusText: page.statusText, headers }));
}

/** A page of the web app (any path but /api), with a shared link's own preview where it has one. */
export async function sitePage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);
  // Always the whole page (never "not modified"), so there's a page to write the preview into.
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  const page = await env.ASSETS.fetch(new Request(url, { method: request.method, headers }));
  if (!page.ok || !(page.headers.get('content-type') ?? '').includes('text/html')) return page;
  const preview = await previewFor(env.DB, url).catch(() => null);
  return preview ? withPreview(page, preview, url) : page;
}
