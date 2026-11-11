/** "Just me": pick the part you usually sing, then straight to your own space. */
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { api } from '@/api/client';
import { Body, Button, Card, ErrorText, Kicker, Page, PartPicker, TopBar } from '@/components/ui';
import { useSession } from '@/state/session';

export default function JustMe() {
  const { status, personal, profile, refresh, setGroup } = useSession();
  const [part, setPart] = useState<string | null>(personal?.part ?? null);
  const save = useMutation({
    mutationFn: () => api.updateMember(personal!.id, profile!.id, { part }),
    onSuccess: async () => {
      setGroup(personal!.id);
      await refresh();
      router.replace('/');
    },
  });

  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { next: 'just-me' } }} />;

  return (
    <Page>
      <TopBar back title="Use Abụ on your own" subtitle="Learn songs, practise and make setlists. Join a group any time." />
      <Card tone="sand">
        <Body>Good for solo singers, instrumentalists, music students and anyone visiting a choir. Every song shared on Abụ is open to you.</Body>
      </Card>
      <Kicker>The part you usually sing</Kicker>
      <PartPicker value={part} onChange={setPart} />
      {save.error ? <ErrorText message={save.error.message} /> : null}
      <Button label="Start" onPress={() => save.mutate()} disabled={!part || !personal || !profile} busy={save.isPending} />
    </Page>
  );
}
