/**
 * The Abụ API (the Cloudflare Worker in ../abu-api). Every call sends the
 * session; errors come back with a message that's safe to show.
 */
import { authCookie } from '@/auth/client';

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
}

export interface SongInput {
  title: string;
  composer: string;
  doh: number;
  time_signature: string;
  tags: string[];
  solfa: string;
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

  createGroup: (input: { name: string; type: Exclude<GroupType, 'personal'>; church?: string; town?: string; part?: string | null }) =>
    request<Group>('/groups', json('POST', input)),
  preview: (code: string) => request<GroupPreview>(`/groups/preview/${encodeURIComponent(code.trim())}`),
  join: (code: string, part: string | null) => request<Membership>('/groups/join', json('POST', { code, part })),
  updateGroup: (groupId: string, patch: Partial<Pick<Group, 'name' | 'church' | 'town' | 'requires_approval' | 'self_check_in' | 'leader_title' | 'sections'>>) =>
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
  attachSheet: async (id: string, picked: PickedFile) => {
    const body = picked.file ?? (await (await fetch(picked.uri)).blob());
    return request<Song>(`/songs/${id}/sheet`, { method: 'PUT', body, headers: { 'Content-Type': picked.type } });
  },
  removeSheet: (id: string) => request<Song>(`/songs/${id}/sheet`, { method: 'DELETE' }),
  recordPlay: (id: string) => request<{ plays: number }>(`/songs/${id}/plays`, { method: 'POST' }),
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

  repertoire: (groupId: string) => request<Song[]>(`/groups/${groupId}/repertoire`),
  addToRepertoire: (groupId: string, songId: string) => request<{ ok: true }>(`/groups/${groupId}/repertoire`, json('POST', { song_id: songId })),
  removeFromRepertoire: (groupId: string, songId: string) => request<{ ok: true }>(`/groups/${groupId}/repertoire/${songId}`, { method: 'DELETE' }),
};

/** Where the original sheet can be opened (anyone may view it). */
export function sheetUrl(songId: string): string {
  return `${API_URL}/api/songs/${encodeURIComponent(songId)}/sheet`;
}

/** A link to a song's page, for sharing. */
export function songLink(songId: string): string {
  return `${SITE_URL}/song/${encodeURIComponent(songId)}`;
}

/** A link that opens the join screen with the code filled in. */
export function inviteLink(code: string): string {
  return `${SITE_URL}/join?code=${code}`;
}

/** The ready-made WhatsApp message for inviting members. */
export function inviteMessage(groupName: string, code: string): string {
  return `Join ${groupName} on Abụ to learn your part and see our song orders. Open ${inviteLink(code)} or enter the code ${code}.`;
}
