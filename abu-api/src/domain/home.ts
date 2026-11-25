/**
 * Home's feed (Home's redesign in the style of Audiomack's, 25 November 2026): genre chips, trending, newest, what
 * you played lately, songs you haven't tried, collections by tag and composers, in one request. Open to everyone.
 *
 * Every part of it is built from the songs the viewer can see, by the same rule as the library (`seenBy`): a song
 * someone can't see never shows, nor counts towards a tag, a collection or a composer.
 */
import { seenBy, type Audience } from './songs';

export interface HomeSong {
  id: string;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
  cover_key: string | null;
  audience: Audience;
  /** plays in the last 14 days, everyone together */
  plays: number;
}

export interface HomeFeed {
  /** Tags on the songs the viewer can see, most songs first, up to 16 (for the genre chips). Ignores ?tag. */
  tags: { tag: string; songs: number }[];
  /** Up to 12 playable songs (non-empty trimmed solfa), by plays in the last 14 days (song_days), then all-time plays (sum of practice.plays), then newest. */
  trending: HomeSong[];
  /** Up to 12, newest first (created_at desc). */
  newest: HomeSong[];
  /** Signed in: up to 8 songs you've played (practice.last_played_at desc) that you can still see. Signed out: []. */
  recent: HomeSong[];
  /** Up to 8 playable songs you haven't played (signed out: any), in trending order — "Find something new". */
  discover: HomeSong[];
  /**
   * Tags with at least 2 songs, up to 8, most songs first; each with its own cover made by AI once there is one
   * (src/auto-covers.ts), and up to 4 songs, those with covers first, for a collage until then. Empty when ?tag is given.
   */
  collections: { tag: string; songs: number; cover_key: string | null; covers: { id: string; title: string; cover_key: string | null }[] }[];
  /** Composers (trimmed composer, compared case-insensitively; skip empty, "anon", "anonymous", "unknown"), most songs first, up to 10, each with one song for its picture (one with a cover first). */
  composers: { name: string; songs: number; cover: { id: string; title: string; cover_key: string | null } }[];
}

const LIMITS = { tags: 16, trending: 12, newest: 12, recent: 8, discover: 8, collections: 8, collage: 4, composers: 10 };

/**
 * Trending counts plays from the last 14 days (UTC), and from tomorrow: a play is counted on the phone's own date,
 * and east of Greenwich that can already be tomorrow. A play dated later than that doesn't count.
 */
const TRENDING_DAYS = 14;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Composers that say nobody in particular, never shown as one. */
const NO_COMPOSER = ['', 'anon', 'anon.', 'anonymous', 'unknown'];

/** A song with sol-fa to play: SQLite's trim takes only spaces unless told, and a sol-fa of empty lines isn't music. */
const PLAYABLE = `length(trim(s.solfa, char(32, 9, 10, 13))) > 0`;
/** Plays of the song by everyone, all time. */
const ALL_TIME = `coalesce((select sum(p.plays) from practice p where p.song_id = s.id), 0)`;
/** Most played these two weeks, then all time, then newest. */
const TRENDING_ORDER = `plays desc, ${ALL_TIME} desc, s.created_at desc, s.rowid desc`;
/** A song's columns for Home, with its plays in the trending window (its two values come first). */
const COLUMNS = `s.id, s.title, s.composer, s.doh, s.time_signature, s.tags, s.solfa, s.cover_key, s.audience,
  coalesce((select sum(d.plays) from song_days d where d.song_id = s.id and d.day between ? and ?), 0) as plays`;

type SongRow = Omit<HomeSong, 'tags'> & { tags: string };
const toSong = (r: SongRow): HomeSong => ({ ...r, tags: JSON.parse(r.tags) });
/** A song as a picture: in a collection's collage, or for a composer. */
type SongPicture = { id: string; title: string; cover_key: string | null };

/** Home's feed for `viewer` (signed out: null), optionally for one tag ("Christmas", "Igbo"), ignoring case. */
export async function homeFeed(db: D1Database, viewer: string | null, options: { tag?: string } = {}): Promise<HomeFeed> {
  const seen = seenBy(viewer);
  const tag = options.tag?.trim() || null;
  // The songs the viewer can see, with the tag when there is one.
  const where = tag ? `${seen.sql} and exists (select 1 from json_each(s.tags) t where t.value = ? collate nocase)` : seen.sql;
  const values = tag ? [...seen.values, tag] : seen.values;
  const today = new Date().toISOString().slice(0, 10);
  const window = [addDays(today, 1 - TRENDING_DAYS), addDays(today, 1)];
  const songs = (sql: string, ...bind: unknown[]) => db.prepare(sql).bind(...bind).all<SongRow>();

  const [tags, trending, newest, recent, discover, collections, composers] = await Promise.all([
    // Ignores the tag: the chips are how the viewer picks one.
    db
      .prepare(
        `select min(t.value) as tag, count(distinct s.id) as songs from songs s, json_each(s.tags) t
         where ${seen.sql} group by lower(t.value) order by songs desc, lower(t.value) limit ?`,
      )
      .bind(...seen.values, LIMITS.tags)
      .all<{ tag: string; songs: number }>(),
    songs(`select ${COLUMNS} from songs s where ${where} and ${PLAYABLE} order by ${TRENDING_ORDER} limit ?`, ...window, ...values, LIMITS.trending),
    songs(`select ${COLUMNS} from songs s where ${where} order by s.created_at desc, s.rowid desc limit ?`, ...window, ...values, LIMITS.newest),
    viewer
      ? songs(
          `select ${COLUMNS} from practice p join songs s on s.id = p.song_id
           where p.user_id = ? and p.last_played_at is not null and ${where} order by p.last_played_at desc limit ?`,
          ...window,
          viewer,
          ...values,
          LIMITS.recent,
        )
      : null,
    viewer
      ? songs(
          `select ${COLUMNS} from songs s where ${where} and ${PLAYABLE}
             and not exists (select 1 from practice p where p.user_id = ? and p.song_id = s.id and p.plays > 0)
           order by ${TRENDING_ORDER} limit ?`,
          ...window,
          ...values,
          viewer,
          LIMITS.discover,
        )
      : songs(`select ${COLUMNS} from songs s where ${where} and ${PLAYABLE} order by ${TRENDING_ORDER} limit ?`, ...window, ...values, LIMITS.discover),
    // Collections are the tags themselves, so there are none within one tag. Ranked as the chips are.
    tag
      ? null
      : db
          .prepare(
            `with tagged as (
               select distinct lower(t.value) as key, t.value as tag, s.id, s.title, s.cover_key, s.created_at, s.rowid as n
               from songs s, json_each(s.tags) t where ${seen.sql}),
             top as (
               select key, min(tag) as tag, count(distinct id) as songs from tagged group by key
               having count(distinct id) >= 2 order by songs desc, key limit ?),
             picked as (
               select key, id, title, cover_key, row_number() over (partition by key order by cover_key is null, created_at desc, n desc) as r
               from (select distinct key, id, title, cover_key, created_at, n from tagged where key in (select key from top)))
             select top.tag, top.songs, (select tc.cover_key from tag_covers tc where tc.key = top.key) as tag_cover, picked.id, picked.title, picked.cover_key
             from top join picked on picked.key = top.key and picked.r <= ?
             order by top.songs desc, top.key, picked.r`,
          )
          .bind(...seen.values, LIMITS.collections, LIMITS.collage)
          .all<{ tag: string; songs: number; tag_cover: string | null } & SongPicture>(),
    db
      .prepare(
        `with c as (
           select trim(s.composer) as name, lower(trim(s.composer)) as key, s.id, s.title, s.cover_key, s.created_at, s.rowid as n
           from songs s where ${where} and lower(trim(s.composer)) not in (${NO_COMPOSER.map(() => '?').join(', ')})),
         top as (select key, min(name) as name, count(*) as songs from c group by key order by songs desc, key limit ?),
         picked as (
           select key, id, title, cover_key, row_number() over (partition by key order by cover_key is null, created_at desc, n desc) as r
           from c where key in (select key from top))
         select top.name, top.songs, picked.id, picked.title, picked.cover_key
         from top join picked on picked.key = top.key and picked.r = 1
         order by top.songs desc, top.key`,
      )
      .bind(...values, ...NO_COMPOSER, LIMITS.composers)
      .all<{ name: string; songs: number } & SongPicture>(),
  ]);

  const byTag = new Map<string, HomeFeed['collections'][number]>();
  for (const r of collections?.results ?? []) {
    const c = byTag.get(r.tag) ?? byTag.set(r.tag, { tag: r.tag, songs: r.songs, cover_key: r.tag_cover, covers: [] }).get(r.tag)!;
    c.covers.push({ id: r.id, title: r.title, cover_key: r.cover_key });
  }
  return {
    tags: tags.results,
    trending: trending.results.map(toSong),
    newest: newest.results.map(toSong),
    recent: recent?.results.map(toSong) ?? [],
    discover: discover.results.map(toSong),
    collections: [...byTag.values()],
    composers: composers.results.map((r) => ({ name: r.name, songs: r.songs, cover: { id: r.id, title: r.title, cover_key: r.cover_key } })),
  };
}
