/**
 * Who is using the app and which group they're looking at.
 *
 * - Signed in, signed out, or "looking around" (browsing songs without an account).
 * - Your profile and groups, from /api/me.
 * - The current group, remembered on this device.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { api, type MyGroup, type Profile } from '@/api/client';
import { authClient } from '@/auth/client';
import { readSetting, writeSetting } from '@/lib/storage';

const GROUP_KEY = 'abu.currentGroup';
const GUEST_KEY = 'abu.lookingAround';

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
  const status: AuthStatus = session.isPending ? 'loading' : session.data ? 'signedIn' : 'signedOut';
  const userId = session.data?.user.id ?? null;

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
      email: session.data?.user.email ?? null,
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
        queryClient.clear();
        setChosen(null);
        writeSetting(GROUP_KEY, null);
      },
      loadingMe: me.isPending && status === 'signedIn',
    };
  }, [chosen, lookingAround, me.data, me.isPending, queryClient, session.data, status]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
