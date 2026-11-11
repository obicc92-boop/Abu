/**
 * Join a group: enter the code (or open an invite link), see which group it
 * is, pick your part, and you're in, or waiting if the leader approves members.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { Body, Button, Card, ErrorText, Field, Kicker, Page, PartPicker, TopBar } from '@/components/ui';
import { GROUP_TYPES } from '@/lib/group-types';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { status, refresh, setGroup } = useSession();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [lookup, setLookup] = useState(params.code ? params.code.toUpperCase() : '');
  const [part, setPart] = useState<string | null>(null);

  const preview = useQuery({ queryKey: ['preview', lookup], queryFn: () => api.preview(lookup), enabled: status === 'signedIn' && lookup.length === 6, retry: false });
  const join = useMutation({
    mutationFn: () => api.join(lookup, part),
    onSuccess: async (m) => {
      setGroup(m.group_id);
      await refresh();
      if (m.status === 'active') router.replace('/');
    },
  });

  // Invite links work before signing in: sign in, then come back here with the code.
  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { next: 'join', ...(params.code ? { code: params.code } : {}) } }} />;

  const g = preview.data;
  const waiting = join.data?.status === 'pending';

  return (
    <Page>
      <TopBar back title="Join your group" subtitle="Your leader can give you the 6-letter code, or send a link." />

      {!g ? (
        <Card>
          <Field
            label="Group code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="STM482"
            style={styles.code}
            onSubmitEditing={() => setLookup(code)}
            error={preview.error ? preview.error.message : null}
          />
          <Button label="Find my group" onPress={() => setLookup(code)} disabled={code.length !== 6} busy={preview.isFetching} />
        </Card>
      ) : waiting ? (
        <Card>
          <Kicker color={colors.redDeep}>Waiting to be let in</Kicker>
          <Text style={styles.groupName}>{g.name}</Text>
          <Body>
            {g.leader_name ?? 'The leader'} lets new members in for {g.name}. You’ll see the group here as soon as they do.
          </Body>
          <Button kind="ghost" label="Go to home" onPress={() => router.replace('/')} />
        </Card>
      ) : (
        <>
          <Card>
            <Kicker>{GROUP_TYPES[g.type].name}</Kicker>
            <Text style={styles.groupName}>{g.name}</Text>
            <Body muted>{[g.church, g.town].filter(Boolean).join(' · ') || 'No church or town given'}</Body>
            <Body>
              {g.leader_name ? `Led by ${g.leader_name}` : 'Led by its leader'} · {g.members} {g.members === 1 ? 'member' : 'members'}
            </Body>
            {g.requires_approval ? <Body muted>The leader lets new members in, so you’ll wait for them after joining.</Body> : null}
            <Button kind="ghost" small label="Not this group? Change the code" onPress={() => (setLookup(''), join.reset())} style={{ alignSelf: 'flex-start' }} />
          </Card>
          <View style={styles.section}>
            <Kicker>Your voice part</Kicker>
            <PartPicker value={part} onChange={setPart} />
            <Body muted>Not sure? Pick the closest. Your leader can change it later.</Body>
          </View>
          {join.error ? <ErrorText message={join.error.message} /> : null}
          <Button label={`Join ${g.name}`} onPress={() => join.mutate()} disabled={!part} busy={join.isPending} />
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: fonts.monoBold, fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  groupName: { fontFamily: fonts.heavy, fontSize: 22, color: colors.ink },
  section: { gap: 10 },
});
