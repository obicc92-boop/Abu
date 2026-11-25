/**
 * Covers made by AI without anyone asking (owner's request, 25 November 2026: "use the AI image generator to generate
 * covers on the songs, collections and composers there. I don't like wave cover"):
 *
 * - every song without a cover gets one: a new song as it's saved, and any other as Home shows it (a few a visit);
 * - each collection on Home (a tag the app suggests: Christmas, Communion, Igbo…) gets its own;
 * - composers show their songs' covers (no portraits: the AI's faces of real composers would be made up).
 *
 * A cover someone chose is never replaced: a song is only ever given one while it has none. One try at a time per
 * song or collection (claimed in D1), tried again after `RETRY_HOURS` if it failed. They count towards everyone's
 * daily allowance with the covers people ask for (src/domain/covers.ts), so the AI spending stays capped. Collections
 * are only made for the tags the app suggests (src/lib/tags.ts in the app): a tag anyone typed isn't sent to the AI
 * to be painted on everyone's Home.
 */
import { TAG_GROUPS } from '../../abu-app/src/lib/tags';
import { coverMaker, coverPrompt, pictureType } from './covers';
import { newId, nowIso } from './domain/access';
import { coversToday, COVER_LIMITS } from './domain/covers';
import type { HomeFeed } from './domain/home';

/** How long before a failed try is tried again. */
export const RETRY_HOURS = 6;
/** Covers started for one visit to Home, so a visit never sets off many at once. */
export const PER_VISIT = { songs: 3, collections: 1 };

const KNOWN_TAGS = new Map(TAG_GROUPS.flatMap((g) => g.tags).map((t) => [t.toLowerCase(), t]));

/** A tag the app suggests, as the app writes it; null for any other. */
export const knownTag = (tag: string): string | null => KNOWN_TAGS.get(tag.trim().toLowerCase()) ?? null;

const retryBefore = () => new Date(Date.now() - RETRY_HOURS * 3600_000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

/** Whether today's allowance for everyone has room for one more cover. */
async function roomToday(db: D1Database): Promise<boolean> {
  return (await coversToday(db)) < COVER_LIMITS.all;
}

async function countAuto(db: D1Database): Promise<void> {
  await db.prepare('insert into auto_cover_days (day, made) values (?, 1) on conflict (day) do update set made = made + 1').bind(today()).run();
}

/** The picture for a prompt, checked to be one, or null (the AI failed). */
async function picture(env: Env, prompt: string): Promise<{ bytes: Uint8Array; type: string; ext: string } | null> {
  try {
    const bytes = await coverMaker.make(env, prompt);
    const kind = pictureType(bytes);
    if (kind) return { bytes, ...kind };
    console.error('auto covers: the image model gave something that isn’t a picture', bytes.byteLength);
  } catch (e) {
    console.error('auto covers: the image model failed', (e as Error).message);
  }
  return null;
}

/**
 * Gives a song without a cover one made by AI. Returns whether it did. Does nothing if the song has a cover, if
 * another try is under way or failed lately, or if today's allowance is used up.
 */
export async function autoCoverSong(env: Env, songId: string): Promise<boolean> {
  if (!(await roomToday(env.DB))) return false;
  const now = nowIso();
  const claim = await env.DB.prepare(
    'update songs set cover_tried_at = ? where id = ? and cover_key is null and (cover_tried_at is null or cover_tried_at < ?)',
  )
    .bind(now, songId, retryBefore())
    .run();
  if (!claim.meta.changes) return false;
  const song = await env.DB.prepare('select title, composer, tags from songs where id = ?').bind(songId).first<{ title: string; composer: string; tags: string }>();
  if (!song) return false;
  const made = await picture(env, coverPrompt({ ...song, tags: JSON.parse(song.tags) as string[] }));
  if (!made) return false;
  await countAuto(env.DB);
  const key = `covers/${songId}/${newId()}.${made.ext}`;
  await env.COVERS.put(key, made.bytes, { httpMetadata: { contentType: made.type } });
  // Only while it still has none: a picture chosen meanwhile stays, and a song deleted meanwhile takes nothing.
  const set = await env.DB.prepare(`update songs set cover_key = ?, cover_source = 'ai' where id = ? and cover_key is null`).bind(key, songId).run();
  if (!set.meta.changes) {
    await env.COVERS.delete(key);
    return false;
  }
  return true;
}

/** The R2 folder for a collection's cover: covers/tag-christmas/… */
const tagFolder = (key: string) => `tag-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** Gives a collection (a tag the app suggests) its own cover made by AI. Returns whether it did. */
export async function autoCoverTag(env: Env, tag: string): Promise<boolean> {
  const name = knownTag(tag);
  if (!name || !(await roomToday(env.DB))) return false;
  const key = name.toLowerCase();
  const claim = await env.DB.prepare(
    `insert into tag_covers (key, tag, tried_at) values (?1, ?2, ?3)
     on conflict (key) do update set tried_at = ?3 where tag_covers.cover_key is null and (tag_covers.tried_at is null or tag_covers.tried_at < ?4)`,
  )
    .bind(key, name, nowIso(), retryBefore())
    .run();
  if (!claim.meta.changes) return false;
  const made = await picture(env, coverPrompt({ title: `${name}, a collection of choir songs`, composer: '', tags: [name] }));
  if (!made) return false;
  await countAuto(env.DB);
  const file = `covers/${tagFolder(key)}/${newId()}.${made.ext}`;
  await env.COVERS.put(file, made.bytes, { httpMetadata: { contentType: made.type } });
  await env.DB.prepare('update tag_covers set cover_key = ? where key = ?').bind(file, key).run();
  return true;
}

/**
 * After Home's feed has gone out: covers for a few of the songs and one of the collections it showed that have
 * none. Runs after the answer (waitUntil), so nobody waits for the AI; the covers show the next time Home loads.
 */
export async function coverWhatHomeShowed(env: Env, feed: HomeFeed): Promise<void> {
  if (env.AUTO_COVERS !== 'on') return;
  const songs = new Set<string>();
  for (const s of [...feed.trending, ...feed.newest, ...feed.recent, ...feed.discover]) if (!s.cover_key) songs.add(s.id);
  for (const c of feed.composers) if (!c.cover.cover_key) songs.add(c.cover.id);
  for (const c of feed.collections) for (const s of c.covers) if (!s.cover_key) songs.add(s.id);
  const tags = feed.collections.filter((c) => !c.cover_key && knownTag(c.tag)).map((c) => c.tag);
  await Promise.allSettled([
    ...[...songs].slice(0, PER_VISIT.songs).map((id) => autoCoverSong(env, id)),
    ...tags.slice(0, PER_VISIT.collections).map((t) => autoCoverTag(env, t)),
  ]);
}
