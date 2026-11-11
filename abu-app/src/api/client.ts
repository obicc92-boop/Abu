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
  if (init.body) headers.set('Content-Type', 'application/json');
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

  songs: (query?: string) => request<Song[]>(`/songs${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  song: (id: string) => request<Song>(`/songs/${encodeURIComponent(id)}`),
};

/** A link that opens the join screen with the code filled in. */
export function inviteLink(code: string): string {
  return `${SITE_URL}/join?code=${code}`;
}

/** The ready-made WhatsApp message for inviting members. */
export function inviteMessage(groupName: string, code: string): string {
  return `Join ${groupName} on Abụ to learn your part and see our song orders. Open ${inviteLink(code)} or enter the code ${code}.`;
}
