/**
 * The SolfaScores API (the Cloudflare Worker in ../abu-api). Every call sends the
 * session; errors come back with a message that's safe to show.
 */
import { authCookie } from '@/auth/client';

import { dayKey } from '@/lib/dates';

import { API_URL, SITE_URL } from './config';

export type GroupType = 'catholic' | 'anglican' | 'pentecostal' | 'band' | 'personal';
export type Role = 'leader' | 'part_leader' | 'member';
export type MemberStatus = 'active' | 'pending';

export interface Profile {
  id: string;
  display_name: string;
  avatar_key: string | null;
}

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  church: string;
  town: string;
  invite_code: string | null;
  requires_approval: boolean;
  self_check_in: boolean;
  /** Part leaders may edit song orders (leaders always can). */
  part_leaders_edit_orders: boolean;
  leader_title: string;
  sections: string[];
  parts: string[];
}

/** One of your groups, with your place in it. */
export interface MyGroup extends Group {
  role: Role;
  status: MemberStatus;
  part: string | null;
}

export interface Membership {
  group_id: string;
  user_id: string;
  role: Role;
  status: MemberStatus;
  part: string | null;
}

export interface Member extends Membership {
  display_name: string;
  /** Their profile picture, if they've put one (`avatarUrl` gives its address). */
  avatar_key: string | null;
}

export interface GroupPreview {
  id: string;
  name: string;
  type: GroupType;
  church: string;
  town: string;
  leader_name: string | null;
  members: number;
  requires_approval: boolean;
}

export interface Song {
  id: string;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
  sheet_key: string | null;
  sheet_type: string | null;
  shared_by: string | null;
  shared_by_name: string | null;
  shared_from_group: string | null;
  group_name: string | null;
  /** Who can see it: whoever shared it, the group it was shared from, or everyone. */
  audience: Audience;
  /**
   * Its cover picture (colleagues' request, 25 November 2026, for a Home like a music app's): one its creator chose,
   * or one made by AI; `coverUrl` gives its address. Without one, the app draws a cover of its own.
   */
  cover_key: string | null;
  cover_source: 'upload' | 'ai' | null;
}

/** A song as Home's feed gives it: enough to draw its cover and play it straight from Home. */
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
  /** Plays in the last 14 days, everyone's together. */
  plays: number;
}

export interface CoverPick {
  id: string;
  title: string;
  cover_key: string | null;
}

/** Home's feed (GET /api/home), of only the songs the viewer can see. */
export interface HomeFeed {
  /** Tags on those songs, most songs first: the chips at the top. */
  tags: { tag: string; songs: number }[];
  trending: HomeSong[];
  newest: HomeSong[];
  /** Songs you've played, most recent first (signed out: none). */
  recent: HomeSong[];
  /** Songs you haven't played yet. */
  discover: HomeSong[];
  /** Tags with a few songs each, as collections: their own cover made by AI once there is one, and songs for a collage until then. */
  collections: { tag: string; songs: number; cover_key: string | null; covers: CoverPick[] }[];
  composers: { name: string; songs: number; cover: CoverPick }[];
}

/**
 * Who can see a song (owner's request, 21 November 2026), chosen when it's saved: "Only me", "My group" (the group
 * it's shared from) or "Everyone". A song in a group's repertoire or song order is seen by that group too.
 */
export type Audience = 'me' | 'group' | 'everyone';

/**
 * An earlier version of a song (owner's yes, 21 November 2026): every save that changes a song keeps it as it was, the
 * last 20, for whoever can edit it to look at, play and bring back.
 */
export interface SongVersion {
  id: string;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
  /** When it was saved, and by whom (null when not known: saves before versions were kept). */
  saved_at: string;
  saved_by_name: string | null;
  /** When a newer save replaced it, and by whom. */
  replaced_at: string;
  replaced_by_name: string | null;
}

export interface SongInput {
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
  /** Save it even though the checker found problems (the person chose "Save anyway"). */
  ignore_problems?: boolean;
  audience?: Audience;
}

/** What you can do with a song, and your own practice of it. */
export interface SongForMe {
  can_edit: boolean;
  /** Your groups that have it in their repertoire (your own space = My songs). */
  in_groups: string[];
  plays: number;
  knows_part: boolean;
}

export interface SongFilters {
  query?: string;
  tag?: string;
  playable?: boolean;
}

/** A file to attach: on the web a File, on phones a local uri. */
export interface PickedFile {
  name: string;
  type: string;
  size?: number;
  uri: string;
  file?: Blob;
}

/** A scanned page: its heading, and where its lines of music are (in the picture's pixels). */
/** A line of music on a page as Claude grouped the app's rows (numbered from 0): its rows of notes with who sings each, and its rows of words. */
export interface ScanLayoutLine {
  notes: { row: number; part: string }[];
  words: number[];
}

export interface ScanPageReading {
  title: string;
  composer: string;
  key: string;
  time: string;
  /** The tempo as printed in the heading ("Larghetto, M. 79"), or "" (a Worker from before tempo may leave it out). */
  tempo?: string;
  lines: { top: number; bottom: number; left: number; right: number; parts: string[]; words: number }[];
}

/** One scanned line read into sol-fa, with the bars the reader wasn't sure of. */
export interface ScanLineReading {
  text: string;
  doubts: { part: string; bar: number }[];
  /** A new key written with the line ("F", "B♭"), if the reader saw one. */
  key?: string;
  /** The section a label written at the line's start or just above it names ("Chorus", "Verse 2"), if the reader saw one. */
  section?: string;
}

export type EventKind = 'service' | 'rehearsal' | 'concert';
export type Reply = 'going' | 'cant';

export interface GroupEvent {
  id: string;
  group_id: string;
  kind: EventKind;
  title: string;
  starts_at: string;
  venue: string;
  note: string;
  /** Number of songs in its order (in lists). */
  songs?: number;
}

export interface OrderItem {
  id: string;
  event_id: string;
  position: number;
  section: string;
  song_id: string;
  note: string;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  playable: boolean;
}

export interface EventDetails {
  event: GroupEvent;
  items: OrderItem[];
  my_reply: Reply | null;
  replies: { going: number; cant: number };
  my_role: Role;
  my_part: string | null;
  /** Your own attendance mark, once you're marked or checked in. */
  my_attendance: AttendanceStatus | null;
  /** Whether members check themselves in with a code in this group. */
  self_check_in: boolean;
  /** You may change the song order: leaders, and part leaders when the leader allows it. */
  can_edit_order: boolean;
}

export type AttendanceStatus = 'present' | 'absent' | 'excused';

/** One person on the register for a service or rehearsal. */
export interface SheetRow {
  user_id: string;
  display_name: string;
  avatar_key: string | null;
  part: string | null;
  role: Role;
  reply: Reply | null;
  /** null until someone marks them. */
  status: AttendanceStatus | null;
  self_check_in: boolean;
  /** You may mark them (part leaders: only their own part). */
  can_mark: boolean;
}

export interface Tally {
  present: number;
  absent: number;
  excused: number;
  /** Present out of present and absent, in %; null before anyone is marked. */
  rate: number | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  tz: number;
  events: { id: string; kind: EventKind; title: string; starts_at: string; marked: number }[];
  members: (Tally & { user_id: string; display_name: string; part: string | null; role: Role; marks: Record<string, AttendanceStatus | null> })[];
  parts: (Tally & { part: string; members: number })[];
  months: (Tally & { month: string; events: number })[];
  overall: Tally;
}

export type CheckInResult = 'present' | 'wrong_code' | 'locked';

export type TodoKind = 'unmarked' | 'no_replies' | 'no_songs' | 'no_solfa' | 'waiting';

/** Something waiting for a leader (or a part leader, for their part). */
export interface TodoItem {
  kind: TodoKind;
  count: number;
  event_id?: string;
  event_title?: string;
  event_kind?: EventKind;
  starts_at?: string;
  song_id?: string;
  song_title?: string;
}

export interface Notice {
  id: string;
  group_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  /** The part it's for ("T"), or null for everyone. */
  part: string | null;
  pinned: boolean;
  created_at: string;
}

/** Your own practice week, private to you. */
export interface PracticeSummary {
  week_plays: number;
  week_days: number;
  /** Days in a row up to today (or yesterday, until today is over). */
  streak: number;
  songs_known: number;
  songs_practised: number;
}

export interface EventInput {
  kind: EventKind;
  title: string;
  starts_at: string;
  venue?: string;
  note?: string;
}

export interface PartReadiness {
  part: string;
  members: number;
  ready: number;
  plays: number;
}

export interface Practice {
  song_id: string;
  plays: number;
  knows_part: boolean;
  last_played_at: string | null;
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  playable: boolean;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const cookie = await authCookie();
  if (cookie) headers.set('Cookie', cookie);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'No connection. Check your data or Wi-Fi and try again.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'Something went wrong. Try again.');
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export const api = {
  me: () => request<{ profile: Profile; groups: MyGroup[] }>('/me'),
  updateMe: (patch: { display_name: string }) => request<Profile>('/me', json('PATCH', patch)),
  /** Your profile picture: a small square JPEG (src/lib/avatar-photo.ts), or taken away. */
  setAvatar: (image: Blob, type: string) => request<Profile>('/me/avatar', { method: 'PUT', body: image, headers: { 'Content-Type': type } }),
  removeAvatar: () => request<Profile>('/me/avatar', { method: 'DELETE' }),

  createGroup: (input: { name: string; type: Exclude<GroupType, 'personal'>; church?: string; town?: string; part?: string | null }) =>
    request<Group>('/groups', json('POST', input)),
  preview: (code: string) => request<GroupPreview>(`/groups/preview/${encodeURIComponent(code.trim())}`),
  join: (code: string, part: string | null) => request<Membership>('/groups/join', json('POST', { code, part })),
  updateGroup: (groupId: string, patch: Partial<Pick<Group, 'name' | 'church' | 'town' | 'requires_approval' | 'self_check_in' | 'part_leaders_edit_orders' | 'leader_title' | 'sections'>>) =>
    request<Group>(`/groups/${groupId}`, json('PATCH', patch)),
  members: (groupId: string) => request<Member[]>(`/groups/${groupId}/members`),
  approve: (groupId: string, userId: string) => request<{ ok: true }>(`/groups/${groupId}/members/${userId}/approve`, { method: 'POST' }),
  updateMember: (groupId: string, userId: string, patch: { role?: Role; part?: string | null }) =>
    request<{ ok: true }>(`/groups/${groupId}/members/${userId}`, json('PATCH', patch)),
  removeMember: (groupId: string, userId: string) => request<{ ok: true }>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  songs: (f: SongFilters = {}) => {
    const q = new URLSearchParams();
    if (f.query?.trim()) q.set('q', f.query.trim());
    if (f.tag) q.set('tag', f.tag);
    if (f.playable) q.set('playable', '1');
    const qs = q.toString();
    return request<Song[]>(`/songs${qs ? `?${qs}` : ''}`);
  },
  song: (id: string) => request<Song>(`/songs/${encodeURIComponent(id)}`),
  songForMe: (id: string) => request<SongForMe>(`/songs/${encodeURIComponent(id)}/me`),
  shareSong: (input: SongInput & { shared_from_group: string | null }) => request<Song>('/songs', json('POST', input)),
  editSong: (id: string, patch: Partial<SongInput>) => request<Song>(`/songs/${id}`, json('PATCH', patch)),
  deleteSong: (id: string) => request<{ ok: true }>(`/songs/${id}`, { method: 'DELETE' }),
  songVersions: (id: string) => request<SongVersion[]>(`/songs/${encodeURIComponent(id)}/versions`),
  bringBackVersion: (id: string, versionId: string) =>
    request<Song>(`/songs/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/bring-back`, { method: 'POST' }),
  attachSheet: async (id: string, picked: PickedFile) => {
    const body = picked.file ?? (await (await fetch(picked.uri)).blob());
    return request<Song>(`/songs/${id}/sheet`, { method: 'PUT', body, headers: { 'Content-Type': picked.type } });
  },
  removeSheet: (id: string) => request<Song>(`/songs/${id}/sheet`, { method: 'DELETE' }),
  /** Home's feed, of every song or of one tag's (a chip at the top). */
  home: (tag?: string | null) => request<HomeFeed>(`/home${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
  /** A song's cover: a square JPEG chosen from the phone (src/lib/avatar-photo.ts), one made by AI, or taken away. */
  setCover: (id: string, image: Blob, type: string) => request<Song>(`/songs/${encodeURIComponent(id)}/cover`, { method: 'PUT', body: image, headers: { 'Content-Type': type } }),
  makeCover: (id: string, idea?: string) => request<Song>(`/songs/${encodeURIComponent(id)}/cover/make`, json('POST', idea?.trim() ? { idea: idea.trim() } : {})),
  removeCover: (id: string) => request<Song>(`/songs/${encodeURIComponent(id)}/cover`, { method: 'DELETE' }),
  /** Scanning a sheet: find the lines of music on a page (a JPEG, with its size in pixels). */
  scanPage: (image: Blob, width: number, height: number) =>
    request<ScanPageReading>(`/scan/page?w=${Math.round(width)}&h=${Math.round(height)}`, { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } }),
  /**
   * How a page's rows make lines of music, judged by Claude: `image` is the page with the app's rows boxed and
   * numbered (a base64 JPEG), `rows` each row's place in it and what the app read there. Null lines: keep the app's.
   */
  scanLayout: (image: string, rows: { top: number; bottom: number; text: string }[]) =>
    request<{ lines: ScanLayoutLine[] | null }>('/scan/layout', json('POST', { image, rows })),
  /** Read one line of music (a JPEG) into sol-fa. */
  scanLine: (image: Blob, o: { parts: string[]; time?: string; key?: string }) => {
    const q = new URLSearchParams({ parts: o.parts.join(',') });
    if (o.time) q.set('time', o.time);
    if (o.key) q.set('key', o.key);
    return request<ScanLineReading>(`/scan/line?${q}`, { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } });
  },
  /** Haiku checks the reading SolfaScores' own model made of a line (a JPEG), fixing what it got wrong. */
  scanCheck: (image: Blob, o: { parts: string[]; time?: string; key?: string; draft: string }) => {
    const q = new URLSearchParams({ parts: o.parts.join(','), draft: o.draft });
    if (o.time) q.set('time', o.time);
    if (o.key) q.set('key', o.key);
    return request<ScanLineReading>(`/scan/check?${q}`, { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } });
  },
  /** Cloudflare's reader corrects a line SolfaScores' own model read that fails the checker (a JPEG of the line). */
  scanFix: (image: Blob, o: { parts: string[]; time?: string; key?: string; draft: string }) => {
    const q = new URLSearchParams({ parts: o.parts.join(','), draft: o.draft });
    if (o.time) q.set('time', o.time);
    if (o.key) q.set('key', o.key);
    return request<ScanLineReading>(`/scan/fix?${q}`, { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } });
  },
  /** Cloudflare's reader reads a row of words (a JPEG of the row). */
  scanWords: (image: Blob) => request<{ words: string }>('/scan/words', { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } }),
  /**
   * Opus copies a line's words (a JPEG), each part's, given its notes as read (`after` is the part's place), and a
   * new key written with it; with `marks`, the rows of notes back too, with the marks and slurs printed with them.
   */
  scanLineWords: (image: Blob, o: { parts: string[]; notes: string; marks?: boolean }) => {
    const q = new URLSearchParams({ parts: o.parts.join(','), notes: o.notes });
    if (o.marks) q.set('marks', '1');
    return request<{ words: { after: number; text: string }[]; key?: string; section?: string; notes?: string }>(`/scan/line-words?${q}`, { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } });
  },
  /** A line's rows (`notes`) back with the marks and slurs printed with them (a JPEG of the line): Cloudflare's reader, or Claude's with `by: 'claude'`. */
  scanMarks: (image: Blob, o: { parts: string[]; notes: string; by: 'cloudflare' | 'claude' }) => {
    const q = new URLSearchParams({ parts: o.parts.join(','), notes: o.notes, by: o.by });
    return request<{ text: string }>(`/scan/marks?${q}`, { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } });
  },
  /** The sheet's title, composer, key and time, from a picture of the top of its first page (Cloudflare's reader); "" where none was found. */
  scanHeading: (image: Blob) =>
    request<{ title: string; composer: string; key: string; time: string; tempo?: string }>('/scan/heading', { method: 'POST', body: image, headers: { 'Content-Type': 'image/jpeg' } }),
  /** Today's allowance, and which AI readers the Worker has (the app tries Cloudflare's, then Claude). */
  scanAllowance: () => request<{ pages: number; lines: number; readers?: { cloudflare: boolean; anthropic: boolean } }>('/scan/allowance'),
  /** One play-through, on today's date on this phone (for the week and streak on Me). */
  recordPlay: (id: string, day = dayKey()) => request<{ plays: number }>(`/songs/${id}/plays`, json('POST', { day })),
  practiceSummary: () => request<PracticeSummary>(`/me/practice/summary?today=${dayKey()}`),

  notices: (groupId: string) => request<Notice[]>(`/groups/${groupId}/notices`),
  postNotice: (groupId: string, body: string, part: string | null) => request<Notice>(`/groups/${groupId}/notices`, json('POST', { body, part })),
  pinNotice: (noticeId: string, pinned: boolean) => request<{ ok: true }>(`/notices/${noticeId}/pin`, json('PUT', { pinned })),
  deleteNotice: (noticeId: string) => request<{ ok: true }>(`/notices/${noticeId}`, { method: 'DELETE' }),
  setKnowsPart: (id: string, knows: boolean) => request<{ ok: true }>(`/songs/${id}/knows`, json('PUT', { knows })),

  myPractice: () => request<Practice[]>('/me/practice'),

  events: (groupId: string, range: { from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (range.from) q.set('from', range.from);
    if (range.to) q.set('to', range.to);
    const qs = q.toString();
    return request<GroupEvent[]>(`/groups/${groupId}/events${qs ? `?${qs}` : ''}`);
  },
  createEvent: (groupId: string, input: EventInput & { repeat_weeks?: number }) => request<GroupEvent>(`/groups/${groupId}/events`, json('POST', input)),
  songHistory: (groupId: string) => request<{ song_id: string; last_sung_at: string; times: number }[]>(`/groups/${groupId}/song-history`),
  event: (eventId: string) => request<EventDetails>(`/events/${eventId}`),
  updateEvent: (eventId: string, patch: Partial<EventInput>) => request<GroupEvent>(`/events/${eventId}`, json('PATCH', patch)),
  deleteEvent: (eventId: string) => request<{ ok: true }>(`/events/${eventId}`, { method: 'DELETE' }),
  addToOrder: (eventId: string, songId: string, section: string) => request<OrderItem>(`/events/${eventId}/items`, json('POST', { song_id: songId, section })),
  removeFromOrder: (eventId: string, itemId: string) => request<{ ok: true }>(`/events/${eventId}/items/${itemId}`, { method: 'DELETE' }),
  setOrder: (eventId: string, items: { id: string; section: string }[]) => request<OrderItem[]>(`/events/${eventId}/order`, json('PUT', { items })),
  copyOrder: (eventId: string, fromEventId: string) => request<OrderItem[]>(`/events/${eventId}/copy-order`, json('POST', { from_event_id: fromEventId })),
  reply: (eventId: string, status: Reply) => request<{ ok: true }>(`/events/${eventId}/reply`, json('PUT', { status })),
  replies: (eventId: string) => request<{ user_id: string; status: Reply; display_name: string; part: string | null }[]>(`/events/${eventId}/replies`),
  readiness: (eventId: string) => request<PartReadiness[]>(`/events/${eventId}/readiness`),
  todo: (groupId: string) => request<TodoItem[]>(`/groups/${groupId}/todo`),

  attendance: (eventId: string) => request<SheetRow[]>(`/events/${eventId}/attendance`),
  mark: (eventId: string, userId: string, status: AttendanceStatus) => request<{ ok: true }>(`/events/${eventId}/attendance/${userId}`, json('PUT', { status })),
  markRest: (eventId: string, status: 'present' | 'absent') => request<{ marked: number }>(`/events/${eventId}/attendance/rest`, json('POST', { status })),
  checkInCode: (eventId: string) => request<{ code: string }>(`/events/${eventId}/check-in-code`),
  checkIn: (eventId: string, code: string) => request<{ result: CheckInResult }>(`/events/${eventId}/check-in`, json('POST', { code })),
  myAttendance: (groupId: string) => request<Tally>(`/groups/${groupId}/my-attendance`),
  attendanceReport: (groupId: string, range: { from?: string; to?: string } = {}) => request<AttendanceReport>(`/groups/${groupId}/attendance${rangeQuery(range)}`),

  repertoire: (groupId: string) => request<Song[]>(`/groups/${groupId}/repertoire`),
  addToRepertoire: (groupId: string, songId: string) => request<{ ok: true }>(`/groups/${groupId}/repertoire`, json('POST', { song_id: songId })),
  removeFromRepertoire: (groupId: string, songId: string) => request<{ ok: true }>(`/groups/${groupId}/repertoire/${songId}`, { method: 'DELETE' }),
};

/** A report's range, plus this phone's time zone so dates and months match its calendar. */
function rangeQuery(range: { from?: string; to?: string }): string {
  const q = new URLSearchParams();
  if (range.from) q.set('from', range.from);
  if (range.to) q.set('to', range.to);
  q.set('tz', String(new Date().getTimezoneOffset()));
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

/** The attendance register as a spreadsheet (CSV) to download; it uses the signed-in session. */
export function attendanceCsvUrl(groupId: string, range: { from?: string; to?: string } = {}): string {
  return `${API_URL}/api/groups/${groupId}/attendance.csv${rangeQuery(range)}`;
}

/** Where the original sheet can be opened (whoever can see the song; on the web the sign-in goes with it). */
export function sheetUrl(songId: string): string {
  return `${API_URL}/api/songs/${encodeURIComponent(songId)}/sheet`;
}

/** A link to a song's page, for sharing. */
/** A link to a service or rehearsal's page, for WhatsApp. */
export function eventLink(eventId: string): string {
  return `${SITE_URL}/event/${encodeURIComponent(eventId)}`;
}

/** Opens WhatsApp (or its website) with a message ready to send to a chat. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function songLink(songId: string): string {
  return `${SITE_URL}/song/${encodeURIComponent(songId)}`;
}

/** A link that opens the join screen with the code filled in. */
export function inviteLink(code: string): string {
  return `${SITE_URL}/join?code=${code}`;
}

/** The ready-made WhatsApp message for inviting members. */
export function inviteMessage(groupName: string, code: string): string {
  return `Join ${groupName} on SolfaScores to learn your part and see our song orders. Open ${inviteLink(code)} or enter the code ${code}.`;
}

/** A profile picture's address, from its key (avatars/<person>/<picture>.jpg); null without one. */
export const avatarUrl = (key: string | null | undefined): string | null => (key ? `${API_URL}/api/${key}` : null);

/** A song's cover picture's address, from its key (covers/<song>/<picture>.jpg); null without one. */
export const coverUrl = (key: string | null | undefined): string | null => (key ? `${API_URL}/api/${key}` : null);
