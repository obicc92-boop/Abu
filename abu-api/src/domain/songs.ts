/** The public song library, sharing and editing songs, original sheets, and each group's repertoire. */
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
  visibility: 'public';
  shared_by: string | null;
  shared_by_name: string | null;
  shared_from_group: string | null;
  /** Name of the group it was shared from: "Shared by St. Mary's Choir". */
  group_name: string | null;
  created_at: string;
  updated_at: string;
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

/** Every song is public for now, so anyone can browse, signed in or not. */
export async function listSongs(db: D1Database, filters: SongFilters = {}): Promise<Song[]> {
  const where = [`s.visibility = 'public'`];
  const values: unknown[] = [];
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

export async function getSong(db: D1Database, songId: string): Promise<Song> {
  const row = await db.prepare(`${SELECT} where s.id = ? and s.visibility = 'public'`).bind(songId).first<SongRow>();
  if (!row) throw notFound('That song doesn’t exist.');
  return toSong(row);
}

/** Checks a song's details, and its sol-fa with the same reader the app uses. */
function validate(song: Required<Pick<SongInput, 'title' | 'composer' | 'doh' | 'time_signature' | 'tags' | 'solfa'>>): void {
  if (!song.title.trim()) throw badRequest('Give the song a title.');
  if (song.title.length > 200) throw badRequest('Keep the title under 200 characters.');
  if (song.composer.length > 200) throw badRequest('Keep the composer under 200 characters.');
  if (!Number.isInteger(song.doh) || song.doh < 0 || song.doh > 11) throw badRequest('Choose the key (doh).');
  if (!/^\d{1,2}\/\d{1,2}$/.test(song.time_signature)) throw badRequest('Choose the time, e.g. 4/4.');
  if (!Array.isArray(song.tags) || song.tags.length > 12 || song.tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 30)) {
    throw badRequest('Use up to 12 tags, each under 30 characters.');
  }
  if (song.solfa.length > 100_000) throw badRequest('That sol-fa is too long to save.');
  if (song.solfa.trim()) {
    const parsed = parseSolfa(song.solfa, { time: song.time_signature, key: song.doh });
    if (parsed.errors.length) throw badRequest(`The sol-fa has a problem: ${parsed.errors[0].message}`);
  }
}

/** Share a song with everyone, optionally on behalf of a group you're in. */
export async function shareSong(db: D1Database, me: string, input: SongInput & { title: string; shared_from_group?: string | null }): Promise<Song> {
  const song = {
    title: input.title?.trim() ?? '',
    composer: input.composer?.trim() ?? '',
    doh: input.doh ?? 0,
    time_signature: input.time_signature ?? '4/4',
    tags: (input.tags ?? []).map((t) => t.trim()),
    solfa: input.solfa ?? '',
  };
  validate(song);
  if (input.shared_from_group) await requireMember(db, input.shared_from_group, me);
  const id = newId();
  try {
    await db
      .prepare(
        `insert into songs (id, title, composer, doh, time_signature, tags, solfa, shared_by, shared_from_group)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, song.title, song.composer, song.doh, song.time_signature, JSON.stringify(song.tags), song.solfa, me, input.shared_from_group ?? null)
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return getSong(db, id);
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
  const current = await getSong(db, songId);
  if (!(await canEditSong(db, me, current))) throw forbidden(CANT_EDIT);
  const next = {
    title: patch.title?.trim() ?? current.title,
    composer: patch.composer?.trim() ?? current.composer,
    doh: patch.doh ?? current.doh,
    time_signature: patch.time_signature ?? current.time_signature,
    tags: patch.tags?.map((t) => t.trim()) ?? current.tags,
    solfa: patch.solfa ?? current.solfa,
  };
  validate(next);
  try {
    await db
      .prepare('update songs set title = ?, composer = ?, doh = ?, time_signature = ?, tags = ?, solfa = ?, updated_at = ? where id = ?')
      .bind(next.title, next.composer, next.doh, next.time_signature, JSON.stringify(next.tags), next.solfa, nowIso(), songId)
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return getSong(db, songId);
}

/**
 * Whoever shared it, or a leader of the group it was shared from. Not while a
 * song order uses it. Returns the sheet's R2 key, for the caller to delete.
 */
export async function deleteSong(db: D1Database, me: string, songId: string): Promise<string | null> {
  const song = await getSong(db, songId);
  const leader = song.shared_from_group ? (await membershipOf(db, song.shared_from_group, me))?.role === 'leader' : false;
  if (song.shared_by !== me && !leader) throw forbidden('Only whoever shared this song, or their group’s leader, can delete it.');
  try {
    await db.prepare('delete from songs where id = ?').bind(songId).run();
  } catch (e) {
    throw friendly(e, 'This song is in a song order, so it can’t be deleted. Take it out of the order first.');
  }
  return song.sheet_key;
}

/* ---------- Original sheets (the files live in R2) ---------- */

/** The R2 key and type for a new sheet, after checking you may change the song. */
export async function prepareSheet(db: D1Database, me: string, songId: string): Promise<Song> {
  const song = await getSong(db, songId);
  if (!(await canEditSong(db, me, song))) throw forbidden(CANT_EDIT);
  return song;
}

/** Records a new sheet; returns the old sheet's key, for the caller to delete. */
export async function setSheet(db: D1Database, songId: string, key: string | null, type: string | null): Promise<string | null> {
  const old = await db.prepare('select sheet_key from songs where id = ?').bind(songId).first<{ sheet_key: string | null }>();
  await db.prepare('update songs set sheet_key = ?, sheet_type = ?, updated_at = ? where id = ?').bind(key, type, nowIso(), songId).run();
  return old?.sheet_key ?? null;
}

/* ---------- Repertoire ("Our repertoire", or "My songs" in your own space) ---------- */

export async function addToRepertoire(db: D1Database, me: string, groupId: string, songId: string): Promise<void> {
  await requireLeader(db, groupId, me, 'Only a leader can add songs to the repertoire.');
  await getSong(db, songId);
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
  const song = await getSong(db, songId);
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
