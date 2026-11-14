/**
 * Start a group: name, kind, church and town, your own part. Then the invite
 * step: the code, WhatsApp sharing, and on to Home.
 */
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { api, type GroupType } from '@/api/client';
import { InviteCard } from '@/components/invite';
import { Body, Button, Card, ErrorText, Field, Kicker, Page, PartPicker, TopBar } from '@/components/ui';
import { GROUP_TYPES } from '@/lib/group-types';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

const CHOICES = ['catholic', 'anglican', 'pentecostal', 'band'] as const;

export default function CreateGroup() {
  const styles = useStyles();
  const { status, refresh, setGroup } = useSession();
  const [name, setName] = useState('');
  const [type, setType] = useState<Exclude<GroupType, 'personal'>>('catholic');
  const [church, setChurch] = useState('');
  const [town, setTown] = useState('');
  const [part, setPart] = useState<string | null>('S');

  const create = useMutation({
    mutationFn: () => api.createGroup({ name, type, church, town, part }),
    onSuccess: async (g) => {
      setGroup(g.id);
      await refresh();
    },
  });

  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { next: 'create-group' } }} />;

  const g = create.data;
  if (g?.invite_code) {
    return (
      <Page>
        <TopBar title={`${g.name} is ready`} subtitle={`You’re its ${g.leader_title.toLowerCase()}.`} />
        <InviteCard groupName={g.name} code={g.invite_code} intro="Share the code in your choir’s WhatsApp group. Members join straight away; you can ask to approve each one in Group settings." />
        <Button label="Go to home" onPress={() => router.replace('/')} />
      </Page>
    );
  }

  return (
    <Page>
      <TopBar back title="Create your group" />
      <Card>
        <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Holy Family Choir, Owerri" />
        <View style={styles.section}>
          <Text style={styles.label}>What kind of group?</Text>
          {CHOICES.map((t) => {
            const on = t === type;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.option, on && styles.optionOn]}
              >
                <Text style={styles.optionTitle}>{GROUP_TYPES[t].name}</Text>
                <Text style={styles.optionHint}>Song order sections: {GROUP_TYPES[t].sections}</Text>
              </Pressable>
            );
          })}
          <Body muted>The kind only sets the first section names and your title. You can rename sections later.</Body>
        </View>
        <Field label="Church or venue (optional)" value={church} onChangeText={setChurch} placeholder="e.g. St. Mary’s Catholic Church" />
        <Field label="Town (optional)" value={town} onChangeText={setTown} placeholder="e.g. Enugu" />
      </Card>
      <View style={styles.section}>
        <Kicker>Your own part</Kicker>
        <PartPicker value={part} onChange={setPart} allowNone />
      </View>
      {create.error ? <ErrorText message={create.error.message} /> : null}
      <Button label="Create group" onPress={() => create.mutate()} disabled={!name.trim()} busy={create.isPending} />
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 8 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  option: { borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, padding: 12, gap: 2, backgroundColor: colors.card },
  optionOn: { borderColor: colors.ink, borderWidth: 2 },
  optionTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  optionHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
}));
