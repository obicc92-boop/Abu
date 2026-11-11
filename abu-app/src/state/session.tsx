/**
 * Who is using the app and which group they're looking at.
 *
 * - Signed in, signed out, or "looking around" (browsing songs without an account).
 * - Your profile and groups, from /api/me.
 * - The current group, remembered on this device.
 * - Without a connection: still signed in as the last person signed in on
 *   this phone, with their saved groups and songs (see src/lib/offline.ts).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, type MyGroup, type Profile } from '@/api/client';
import { authClient } from '@/auth/client';
import { clearOfflineData } from '@/lib/offline';
import { readSetting, writeSetting } from '@/lib/storage';

const GROUP_KEY = 'abu.currentGroup';
const GUEST_KEY = 'abu.lookingAround';
const LAST_KEY = 'abu.lastSignIn';

interface LastSignIn {
  id: string;
  email: string;
}
function readLast(): LastSignIn | null {
  try {
    const v = JSON.parse(readSetting(LAST_KEY) ?? 'null') as LastSignIn | null;
    return v && typeof v.id === 'string' ? v : null;
  } catch {
    return null;
  }
}

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionState {
  status: AuthStatus;
  email: string | null;
  profile: Profile | null;
  groups: MyGroup[];
  /** The group the tabs show: your choice, else your first choir, else your own space. */
  group: MyGroup | null;
  /** Your own space ("My space"). */
  personal: MyGroup | null;
  setGroup: (groupId: string) => void;
  /** Browsing without an account. */
  lookingAround: boolean;
  setLookingAround: (on: boolean) => void;
  /** Reload profile and groups after joining, creating or changing something. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  loadingMe: boolean;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [last] = useState(readLast);
  // The sign-in check needs the server. When it can't be reached (no data in the
  // church hall), carry on as whoever was last signed in on this phone.
  const unreachable = !session.data && !!session.error;
  const user = session.data?.user ?? (unreachable ? last : null);
  const status: AuthStatus = session.isPending ? 'loading' : user ? 'signedIn' : 'signedOut';
  const userId = user?.id ?? null;

  useEffect(() => {
    if (session.data) writeSetting(LAST_KEY, JSON.stringify({ id: session.data.user.id, email: session.data.user.email }));
    else if (!session.isPending && !session.error) writeSetting(LAST_KEY, null);
  }, [session.data, session.isPending, session.error]);

  const me = useQuery({ queryKey: ['me', userId], queryFn: api.me, enabled: status === 'signedIn' });
  const [chosen, setChosen] = useState<string | null>(() => readSetting(GROUP_KEY));
  const [lookingAround, setGuest] = useState(() => readSetting(GUEST_KEY) === '1');

  const value = useMemo<SessionState>(() => {
    const groups = me.data?.groups ?? [];
    const personal = groups.find((g) => g.type === 'personal') ?? null;
    const group =
      groups.find((g) => g.id === chosen) ?? groups.find((g) => g.type !== 'personal' && g.status === 'active') ?? groups.find((g) => g.type !== 'personal') ?? personal;
    return {
      status,
      email: user?.email ?? null,
      profile: me.data?.profile ?? null,
      groups,
      group,
      personal,
      setGroup: (id) => {
        setChosen(id);
        writeSetting(GROUP_KEY, id);
      },
      lookingAround: lookingAround && status !== 'signedIn',
      setLookingAround: (on) => {
        setGuest(on);
        writeSetting(GUEST_KEY, on ? '1' : null);
      },
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
      },
      signOut: async () => {
        await authClient.signOut();
        writeSetting(LAST_KEY, null);
        await clearOfflineData();
        setChosen(null);
        writeSetting(GROUP_KEY, null);
      },
      loadingMe: me.isPending && status === 'signedIn',
    };
  }, [chosen, lookingAround, me.data, me.isPending, queryClient, user, status]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
