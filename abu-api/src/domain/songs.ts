/** The public song library, sharing and editing songs, and each group's repertoire. */
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
  sheet_key: string | null;
  visibility: 'public';
  shared_by: string | null;
  shared_from_group: string | null;
  created_at: string;
  updated_at: string;
}

type SongRow = Omit<Song, 'tags'> & { tags: string };
const toSong = (r: SongRow): Song => ({ ...r, tags: JSON.parse(r.tags) });

export interface SongInput {
  title?: string;
  composer?: string;
  doh?: number;
  time_signature?: string;
  tags?: string[];
  solfa?: string;
}

/** Every song is public for now, so anyone can browse, signed in or not. */
export async function listSongs(db: D1Database, opts: { query?: string; limit?: number } = {}): Promise<Song[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const q = opts.query?.trim();
  const stmt = q
    ? db
        .prepare(`select * from songs where visibility = 'public' and (title like ?1 or composer like ?1) order by title collate nocase limit ?2`)
        .bind(`%${q.replace(/[%_]/g, '')}%`, limit)
    : db.prepare(`select * from songs where visibility = 'public' order by title collate nocase limit ?`).bind(limit);
  const { results } = await stmt.all<SongRow>();
  return results.map(toSong);
}

export async function getSong(db: D1Database, songId: string): Promise<Song> {
  const row = await db.prepare(`select * from songs where id = ? and visibility = 'public'`).bind(songId).first<SongRow>();
  if (!row) throw notFound('That song doesn’t exist.');
  return toSong(row);
}

/** Share a song with everyone, optionally on behalf of a group you're in. */
export async function shareSong(db: D1Database, me: string, input: SongInput & { title: string; shared_from_group?: string | null }): Promise<Song> {
  if (!input.title?.trim()) throw badRequest('Give the song a title.');
  if (input.shared_from_group) await requireMember(db, input.shared_from_group, me);
  const id = newId();
  try {
    await db
      .prepare(
        `insert into songs (id, title, composer, doh, time_signature, tags, solfa, shared_by, shared_from_group)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.title.trim(),
        input.composer?.trim() ?? '',
        input.doh ?? 0,
        input.time_signature ?? '4/4',
        JSON.stringify(input.tags ?? []),
        input.solfa ?? '',
        me,
        input.shared_from_group ?? null,
      )
      .run();
  } catch (e) {
    throw friendly(e);
  }
  return getSong(db, id);
}

/** Whoever shared a song, or anyone in the group it was shared from, can edit it. */
async function canEdit(db: D1Database, me: string, song: Song): Promise<boolean> {
  if (song.shared_by === me) return true;
  if (!song.shared_from_group) return false;
  const m = await membershipOf(db, song.shared_from_group, me);
  return m?.status === 'active';
}

export async function editSong(db: D1Database, me: string, songId: string, patch: SongInput): Promise<Song> {
  const song = await getSong(db, songId);
  if (!(await canEdit(db, me, song))) throw forbidden('Only whoever shared this song, or their group, can edit it.');
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.title !== undefined) put('title', patch.title.trim());
  if (patch.composer !== undefined) put('composer', patch.composer.trim());
  if (patch.doh !== undefined) put('doh', patch.doh);
  if (patch.time_signature !== undefined) put('time_signature', patch.time_signature);
  if (patch.tags !== undefined) put('tags', JSON.stringify(patch.tags));
  if (patch.solfa !== undefined) put('solfa', patch.solfa);
  if (sets.length) {
    put('updated_at', nowIso());
    try {
      await db.prepare(`update songs set ${sets.join(', ')} where id = ?`).bind(...values, songId).run();
    } catch (e) {
      throw friendly(e);
    }
  }
  return getSong(db, songId);
}

/** Whoever shared it, or a leader of the group it was shared from. Not while a song order uses it. */
export async function deleteSong(db: D1Database, me: string, songId: string): Promise<void> {
  const song = await getSong(db, songId);
  const leader = song.shared_from_group ? (await membershipOf(db, song.shared_from_group, me))?.role === 'leader' : false;
  if (song.shared_by !== me && !leader) throw forbidden('Only whoever shared this song, or their group’s leader, can delete it.');
  try {
    await db.prepare('delete from songs where id = ?').bind(songId).run();
  } catch (e) {
    throw friendly(e, 'This song is in a song order, so it can’t be deleted. Take it out of the order first.');
  }
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
    .prepare('select s.* from repertoire r join songs s on s.id = r.song_id where r.group_id = ? order by s.title collate nocase')
    .bind(groupId)
    .all<SongRow>();
  return results.map(toSong);
}
