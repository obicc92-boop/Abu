/**
 * The song library, sharing and editing songs, who can see each song, original sheets, covers, and each group's
 * repertoire.
 */
// The same sol-fa reader as the app, so nothing with broken sol-fa is ever saved.
import { parseSolfa } from '../../../abu-app/src/solfa';
import { badRequest, forbidden, friendly, notFound } from '../errors';
import { membershipOf, newId, nowIso, requireLeader, requireMember } from './access';

export interface Song {
  id: string;
  title: string;
  composer: string;
  /** Doh as semitones above C. */
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
  /** R2 key and file type of the original sheet, if attached. */
  sheet_key: string | null;
  sheet_type: string | null;
  /** R2 key of the song's cover picture (served at /api/<cover_key>), and where it came from; null without one. */
  cover_key: string | null;
  cover_source: CoverSource | null;
  /** Who can see it: whoever shared it, the group it was shared from, or everyone. */
  audience: Audience;
  shared_by: string | null;
  shared_by_name: string | null;
  shared_from_group: string | null;
  /** Name of the group it was shared from: "Shared by St. Mary's Choir". */
  group_name: string | null;
  created_at: string;
  updated_at: string;
  /** Who saved it last (null for saves before 21 November 2026). */
  updated_by: string | null;
}

/**
 * Who can see a song (owner's request, 21 November 2026: "Only me", "My group" or "Everyone", chosen when it's
 * saved). Songs saved before then are everyone's. Admins will see every song, with the admin page to come.
 */
export type Audience = 'me' | 'group' | 'everyone';
export const AUDIENCES: readonly Audience[] = ['me', 'group', 'everyone'];

/** Where a song's cover came from: a picture someone chose, or one made by AI. */
export type CoverSource = 'upload' | 'ai';

/**
 * The songs someone can see, as SQL on `s` (songs) with its values: everyone's; their own; their group's; and any
 * song in the repertoire or a song order of a group they're in (a leader who could see it put it there). Signed
 * out, only everyone's. Home's feed (src/domain/home.ts) uses the same rule, so it never shows a song the list wouldn't.
 */
export function seenBy(viewer: string | null): { sql: string; values: unknown[] } {
  if (!viewer) return { sql: `s.audience = 'everyone'`, values: [] };
  return {
    sql: `(s.audience = 'everyone' or s.shared_by = ?
      or (s.audience = 'group' and s.shared_from_group in (select group_id from memberships where user_id = ? and status = 'active'))
      or exists (select 1 from repertoire r join memberships m on m.group_id = r.group_id
                 where r.song_id = s.id and m.user_id = ? and m.status = 'active')
      or exists (select 1 from event_items i join events e on e.id = i.event_id join memberships m on m.group_id = e.group_id
                 where i.song_id = s.id and m.user_id = ? and m.status = 'active'))`,
    values: [viewer, viewer, viewer, viewer],
  };
}

type SongRow = Omit<Song, 'tags'> & { tags: string };
const toSong = (r: SongRow): Song => ({ ...r, tags: JSON.parse(r.tags) });

const SELECT = `select s.*, g.name as group_name, p.display_name as shared_by_name
  from songs s left join groups g on g.id = s.shared_from_group left join profiles p on p.id = s.shared_by`;

export interface SongInput {
  title?: string;
  composer?: string;
  doh?: number;
  time_signature?: string;
  tags?: string[];
  solfa?: string;
  /**
   * Save it even though the sol-fa has problems the checker found (owner's request, 21 November 2026: "a button
   * which says to ignore these rules"). The person chose it; the song plays as best it can until they're fixed.
   */
  ignore_problems?: boolean;
  /** Who can see it. A new song without one is everyone's (as from an app from before the choice). */
  audience?: Audience;
}

export interface SongFilters {
  /** Matches title, composer, or the song's words and sol-fa. */
  query?: string;
  /** Only songs with this tag, e.g. "Communion" or "Igbo". */
  tag?: string;
  /** Only songs someone has typed the sol-fa for. */
  playable?: boolean;
  limit?: number;
}

/** The songs someone can see (signed out: everyone's), searched and filtered. */
export async function listSongs(db: D1Database, viewer: string | null, filters: SongFilters = {}): Promise<Song[]> {
  const seen = seenBy(viewer);
  const where = [seen.sql];
  const values: unknown[] = [...seen.values];
  const q = filters.query?.trim().replace(/[%_]/g, '');
  if (q) {
    where.push('(s.title like ? or s.composer like ? or s.solfa like ?)');
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (filters.tag?.trim()) {
    where.push('exists (select 1 from json_each(s.tags) t where t.value = ? collate nocase)');
    values.push(filters.tag.trim());
  }
  if (filters.playable) where.push(`length(trim(s.solfa)) > 0`);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const { results } = await db
    .prepare(`${SELECT} where ${where.join(' and ')} order by s.title collate nocase limit ?`)
    .bind(...values, limit)
    .all<SongRow>();
  return results.map(toSong);
}

/** A song, if the viewer can see it (signed out: only everyone's). One they can't see is "not found". */
export async function getSong(db: D1Database, songId: string, viewer: string | null): Promise<Song> {
  const seen = seenBy(viewer);
  const row = await db.prepare(`${SELECT} where s.id = ? and ${seen.sql}`).bind(songId, ...seen.values).first<SongRow>();
  if (!row) throw notFound('That song doesn’t exist, or it isn’t shared with you.');
  return toSong(row);
}

/** Checks who a song is for: "My group" needs the group it's shared from. */
function audienceFor(audience: unknown, group: string | null): Audience {
  if (!AUDIENCES.includes(audience as Audience)) throw badRequest('Choose who can see the song.');
  if (audience === 'group' && !group) throw badRequest('Choose the group it’s shared from, so its members can see it.');
  return audience as Audience;
}

/** Checks a song's details, and its sol-fa with the same reader the app uses. */
function validate(song: Required<Pick<SongInput, 'title' | 'composer' | 'doh' | 'time_signature' | 'tags' | 'solfa'>>, ignoreProblems = false): void {
  if (!song.title.trim()) throw badRequest('Give the song a title.');
  if (song.title.length > 200) throw badRequest('Keep the title under 200 characters.');
  if (song.composer.length > 200) throw badRequest('Keep the composer under 200 characters.');
  if (!Number.isInteger(song.doh) || song.doh < 0 || song.doh > 11) throw badRequest('Choose the key (doh).');
  if (!/^\d{1,2}\/\d{1,2}$/.test(song.time_signature)) throw badRequest('Choose the time, e.g. 4/4.');
  if (!Array.isArray(song.tags) || song.tags.length > 12 || song.tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 30)) {
    throw badRequest('Use up to 12 tags, each under 30 characters.');
  }
  if (song.solfa.length > 100_000) throw badRequest('That sol-fa is too long to save.');
  if (song.solfa.trim() && !ignoreProblems) {
    const parsed = parseSolfa(song.solfa, { time: song.time_signature, key: song.doh });
    if (parsed.errors.length) throw badRequest(`The sol-fa has a problem: ${parsed.errors[0].message}`);
  }
}

/** Share a song, optionally on behalf of a group you're in, for yourself, that group or everyone. */
export async function shareSong(db: D1Database, me: string, input: SongInput & { title: string; shared_from_group?: string | null }): Promise<Song> {
  const song = {
    title: input.title?.trim() ?? '',
    composer: input.composer?.trim() ?? '',
    doh: input.doh ?? 0,
    time_signature: input.time_signature ?? '4/4',
    tags: (input.tags ?? []).map((t) => t.trim()),
    solfa: input.solfa ?? '',
  };
  validate(song, input.ignore_problems);
  if (input.shared_from_group) await requireMember(db, input.shared_from_group, me);
  const audience = audienceFor(input.audience ?? 'everyone', input.shared_from_group ?? null);
  const id = newId();
  try {
    await db
      .prepare(
        `insert into songs (id, title, composer, doh, time_signature, tags, solfa, shared_by, shared_from_group, audience, updated_by)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, song.title, song.composer, song.doh, song.time_signature, JSON.stringify(song.tags), song.solfa, me, input.shared_from_group ?? null, audience, me)
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return getSong(db, id, me);
}

/** Whoever shared a song, or anyone in the group it was shared from, can edit it. */
export async function canEditSong(db: D1Database, me: string, song: Pick<Song, 'shared_by' | 'shared_from_group'>): Promise<boolean> {
  if (song.shared_by === me) return true;
  if (!song.shared_from_group) return false;
  const m = await membershipOf(db, song.shared_from_group, me);
  return m?.status === 'active';
}

const CANT_EDIT = 'Only whoever shared this song, or their group, can edit it.';

export async function editSong(db: D1Database, me: string, songId: string, patch: SongInput): Promise<Song> {
  const current = await getSong(db, songId, me);
  if (!(await canEditSong(db, me, current))) throw forbidden(CANT_EDIT);
  // Only whoever shared it changes who sees it (so nobody else can make it theirs alone, or open it to everyone).
  const audience = patch.audience === undefined || patch.audience === current.audience ? current.audience : audienceFor(patch.audience, current.shared_from_group);
  if (audience !== current.audience && current.shared_by !== me) throw forbidden('Only whoever shared this song can change who sees it.');
  const next = {
    title: patch.title?.trim() ?? current.title,
    composer: patch.composer?.trim() ?? current.composer,
    doh: patch.doh ?? current.doh,
    time_signature: patch.time_signature ?? current.time_signature,
    tags: patch.tags?.map((t) => t.trim()) ?? current.tags,
    solfa: patch.solfa ?? current.solfa,
  };
  validate(next, patch.ignore_problems);
  const changed =
    next.title !== current.title ||
    next.composer !== current.composer ||
    next.doh !== current.doh ||
    next.time_signature !== current.time_signature ||
    JSON.stringify(next.tags) !== JSON.stringify(current.tags) ||
    next.solfa !== current.solfa;
  const now = nowIso();
  const update = db
    .prepare('update songs set title = ?, composer = ?, doh = ?, time_signature = ?, tags = ?, solfa = ?, audience = ?, updated_at = ?, updated_by = ? where id = ?')
    .bind(next.title, next.composer, next.doh, next.time_signature, JSON.stringify(next.tags), next.solfa, audience, now, changed ? me : current.updated_by, songId);
  try {
    // A change keeps the song as it was, in the same transaction as the change (see `songVersions`).
    await db.batch(changed ? [...keepVersion(db, songId, me, now), update] : [update]);
  } catch (e) {
    throw friendly(e);
  }
  return getSong(db, songId, me);
}

/* ---------- Earlier versions ---------- */

/**
 * Earlier versions of a song (owner's yes, 21 November 2026, after the song editor's "Fill in an example" was saved
 * over Worthy is the Lamb and its music had to be got back by rewinding the whole database): every save that changes
 * a song keeps it as it was, the last `VERSIONS_KEPT`. Whoever can edit the song sees them and can bring one back,
 * which keeps the song as it was too, so bringing one back can be undone the same way.
 */
export const VERSIONS_KEPT = 20;

export interface SongVersion {
  id: string;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
  /** When this version was saved, and by whom (null when not known: saves before versions were kept). */
  saved_at: string;
  saved_by_name: string | null;
  /** When a newer save replaced it, and by whom. */
  replaced_at: string;
  replaced_by_name: string | null;
}

/** The statements that keep a song as it is now, before `me` changes it, and let go of versions past the last few. */
function keepVersion(db: D1Database, songId: string, me: string, now: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `insert into song_versions (id, song_id, title, composer, doh, time_signature, tags, solfa, saved_at, saved_by, replaced_at, replaced_by)
         select ?, id, title, composer, doh, time_signature, tags, solfa, updated_at, updated_by, ?, ? from songs where id = ?`,
      )
      .bind(newId(), now, me, songId),
    db
      .prepare(
        `delete from song_versions where song_id = ? and id not in
           (select id from song_versions where song_id = ? order by replaced_at desc, rowid desc limit ${VERSIONS_KEPT})`,
      )
      .bind(songId, songId),
  ];
}

/** A song's earlier versions, newest first: for whoever can edit it. */
export async function songVersions(db: D1Database, me: string, songId: string): Promise<SongVersion[]> {
  const song = await getSong(db, songId, me);
  if (!(await canEditSong(db, me, song))) throw forbidden(CANT_EDIT);
  const { results } = await db
    .prepare(
      `select v.id, v.title, v.composer, v.doh, v.time_signature, v.tags, v.solfa, v.saved_at, v.replaced_at,
         sp.display_name as saved_by_name, rp.display_name as replaced_by_name
       from song_versions v left join profiles sp on sp.id = v.saved_by left join profiles rp on rp.id = v.replaced_by
       where v.song_id = ? order by v.replaced_at desc, v.rowid desc`,
    )
    .bind(songId)
    .all<Omit<SongVersion, 'tags'> & { tags: string }>();
  return results.map((r) => ({ ...r, tags: JSON.parse(r.tags) }));
}

/** Brings an earlier version back, keeping the song as it is now as a version too. */
export async function bringBackVersion(db: D1Database, me: string, songId: string, versionId: string): Promise<Song> {
  const version = (await songVersions(db, me, songId)).find((v) => v.id === versionId);
  if (!version) throw notFound('That version isn’t kept any more.');
  // It was saved once: bring it back as it was, even if its bars don't all add up.
  const { title, composer, doh, time_signature, tags, solfa } = version;
  return editSong(db, me, songId, { title, composer, doh, time_signature, tags, solfa, ignore_problems: true });
}

/**
 * Whoever shared it, or a leader of the group it was shared from. Not while a
 * song order uses it. Returns the R2 keys of its sheet and its cover, for the caller to delete.
 */
export async function deleteSong(db: D1Database, me: string, songId: string): Promise<{ sheet: string | null; cover: string | null }> {
  const song = await getSong(db, songId, me);
  const leader = song.shared_from_group ? (await membershipOf(db, song.shared_from_group, me))?.role === 'leader' : false;
  if (song.shared_by !== me && !leader) throw forbidden('Only whoever shared this song, or their group’s leader, can delete it.');
  try {
    await db.prepare('delete from songs where id = ?').bind(songId).run();
  } catch (e) {
    throw friendly(e, 'This song is in a song order, so it can’t be deleted. Take it out of the order first.');
  }
  return { sheet: song.sheet_key, cover: song.cover_key };
}

/* ---------- Original sheets (the files live in R2) ---------- */

/** The R2 key and type for a new sheet, after checking you may change the song. */
export async function prepareSheet(db: D1Database, me: string, songId: string): Promise<Song> {
  const song = await getSong(db, songId, me);
  if (!(await canEditSong(db, me, song))) throw forbidden(CANT_EDIT);
  return song;
}

/** Records a new sheet; returns the old sheet's key, for the caller to delete. */
export async function setSheet(db: D1Database, songId: string, key: string | null, type: string | null): Promise<string | null> {
  const old = await db.prepare('select sheet_key from songs where id = ?').bind(songId).first<{ sheet_key: string | null }>();
  await db.prepare('update songs set sheet_key = ?, sheet_type = ?, updated_at = ? where id = ?').bind(key, type, nowIso(), songId).run();
  return old?.sheet_key ?? null;
}

/* ---------- Covers (the pictures live in R2; made by AI in src/covers.ts) ---------- */

/** The song, after checking you may change its cover: whoever can edit the song. */
export async function prepareCover(db: D1Database, me: string, songId: string): Promise<Song> {
  const song = await getSong(db, songId, me);
  if (!(await canEditSong(db, me, song))) throw forbidden(CANT_EDIT);
  return song;
}

/**
 * Records a song's new cover and where it came from, or takes it away (both null). A cover isn't an edit of the
 * song: no version is kept, and updated_at and updated_by stay as they were. Returns the old cover's key, for the
 * caller to delete; read in the same transaction as the change, so two new covers at once can't both miss it.
 */
export async function setCover(db: D1Database, songId: string, key: string | null, source: CoverSource | null): Promise<string | null> {
  const [old, update] = await db.batch<{ cover_key: string | null }>([
    db.prepare('select cover_key from songs where id = ?').bind(songId),
    db.prepare('update songs set cover_key = ?, cover_source = ? where id = ?').bind(key, source, songId),
  ]);
  // Deleted meanwhile: the caller takes back the picture it just put in the bucket.
  if (!update.meta.changes) throw notFound('That song doesn’t exist, or it isn’t shared with you.');
  return old.results[0]?.cover_key ?? null;
}

/* ---------- Repertoire ("Our repertoire", or "My songs" in your own space) ---------- */

export async function addToRepertoire(db: D1Database, me: string, groupId: string, songId: string): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can add songs to the repertoire.');
  await getSong(db, songId, me);
  await db.prepare('insert into repertoire (group_id, song_id, added_by) values (?, ?, ?) on conflict do nothing').bind(groupId, songId, me).run();
}

export async function removeFromRepertoire(db: D1Database, me: string, groupId: string, songId: string): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can remove songs from the repertoire.');
  await db.prepare('delete from repertoire where group_id = ? and song_id = ?').bind(groupId, songId).run();
}

export async function listRepertoire(db: D1Database, me: string, groupId: string): Promise<Song[]> {
  await requireMember(db, groupId, me);
  const { results } = await db
    .prepare(`${SELECT} join repertoire r on r.song_id = s.id where r.group_id = ? order by s.title collate nocase`)
    .bind(groupId)
    .all<SongRow>();
  return results.map(toSong);
}

/* ---------- A song, as seen by you ---------- */

export interface SongForMe {
  can_edit: boolean;
  /** Groups you're in that have it in their repertoire (your own space = "My songs"). */
  in_groups: string[];
  plays: number;
  knows_part: boolean;
}

export async function songForMe(db: D1Database, me: string, songId: string): Promise<SongForMe> {
  const song = await getSong(db, songId, me);
  const [groups, practice] = await Promise.all([
    db
      .prepare(
        `select r.group_id from repertoire r join memberships m on m.group_id = r.group_id
         where r.song_id = ? and m.user_id = ? and m.status = 'active'`,
      )
      .bind(songId, me)
      .all<{ group_id: string }>(),
    db.prepare('select plays, knows_part from practice where user_id = ? and song_id = ?').bind(me, songId).first<{ plays: number; knows_part: number }>(),
  ]);
  return {
    can_edit: await canEditSong(db, me, song),
    in_groups: groups.results.map((g) => g.group_id),
    plays: practice?.plays ?? 0,
    knows_part: practice?.knows_part === 1,
  };
}
