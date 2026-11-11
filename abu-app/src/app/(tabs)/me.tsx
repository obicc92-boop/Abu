/** Me: your name, your groups (switch between them), joining or starting another, signing out. */
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { Avatar, Body, Button, Card, ErrorText, Field, Kicker, Loading, Page, PartTag, TopBar } from '@/components/ui';
import { GROUP_TYPES } from '@/lib/group-types';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

export default function Me() {
  const s = useSession();
  const [name, setName] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (display_name: string) => api.updateMe({ display_name }), onSuccess: () => (setName(null), s.refresh()) });

  if (s.status !== 'signedIn') {
    return (
      <Page>
        <TopBar title="Me" />
        <Card>
          <Kicker>You’re looking around</Kicker>
          <Body>Create an account to join your choir, save songs, and keep your practice.</Body>
          <Button
            label="Create an account or sign in"
            onPress={() => {
              s.setLookingAround(false);
              router.replace('/welcome');
            }}
          />
        </Card>
      </Page>
    );
  }
  if (s.loadingMe || !s.profile) return <Loading />;

  return (
    <Page>
      <TopBar title="Me" />
      <Card>
        <View style={styles.profile}>
          <Avatar name={s.profile.display_name} part={s.group?.part} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{s.profile.display_name}</Text>
            <Text style={styles.small}>{s.email}</Text>
          </View>
        </View>
        {name === null ? (
          <Button kind="ghost" small label="Change your name" onPress={() => setName(s.profile!.display_name)} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <>
            <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" />
            {save.error ? <ErrorText message={save.error.message} /> : null}
            <View style={styles.row}>
              <Button small label="Save" onPress={() => save.mutate(name)} busy={save.isPending} />
              <Button small kind="ghost" label="Cancel" onPress={() => setName(null)} />
            </View>
          </>
        )}
      </Card>

      <Kicker>Your groups</Kicker>
      {s.groups.map((g) => {
        const current = g.id === s.group?.id;
        return (
          <Pressable
            key={g.id}
            onPress={() => {
              s.setGroup(g.id);
              router.push('/');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            style={[styles.groupRow, current && styles.groupRowOn]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>{g.type === 'personal' ? 'My space' : g.name}</Text>
              <Text style={styles.small}>
                {g.type === 'personal'
                  ? 'Your own songs and setlists'
                  : [GROUP_TYPES[g.type].name, g.status === 'pending' ? 'waiting to be let in' : g.role === 'leader' ? g.leader_title : g.role === 'part_leader' ? 'Part leader' : null]
                      .filter(Boolean)
                      .join(' · ')}
              </Text>
            </View>
            <PartTag part={g.part} />
            {current ? <Text style={styles.current}>Showing</Text> : null}
          </Pressable>
        );
      })}
      <View style={styles.row}>
        <Button label="Join a group" onPress={() => router.push('/join')} style={{ flexGrow: 1 }} />
        <Button kind="ghost" label="Start a group" onPress={() => router.push('/create-group')} style={{ flexGrow: 1 }} />
      </View>

      <Button
        kind="danger"
        label="Sign out"
        onPress={async () => {
          await s.signOut();
          router.replace('/welcome');
        }}
      />
      <Text style={[styles.small, { textAlign: 'center' }]}>Abụ · learn your part, keep your choir together</Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontFamily: fonts.heavy, fontSize: 19, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, padding: 14 },
  groupRowOn: { borderColor: colors.ink },
  groupName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  current: { fontFamily: fonts.bold, fontSize: 12, color: colors.ok },
});
