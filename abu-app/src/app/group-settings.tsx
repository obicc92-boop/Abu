/**
 * The group's details (leaders): name, church, town, what the leader is
 * called, and the song order sections (rename, reorder, add, remove).
 */
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, type MyGroup } from '@/api/client';
import { Body, Button, Card, Chip, ErrorText, Field, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { GROUP_TYPES } from '@/lib/group-types';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

const TITLES = ['Choirmaster', 'Choir director', 'Music director', 'Organist'];

export default function GroupSettingsScreen() {
  const s = useSession();
  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  if (!s.group) return <Loading />;
  if (s.group.role !== 'leader' || s.group.type === 'personal') {
    return (
      <Page>
        <TopBar back title="Group details" />
        <Card>
          <Body>Only a leader can change the group’s details.</Body>
        </Card>
      </Page>
    );
  }
  return <Editor key={s.group.id} group={s.group} />;
}

function Editor({ group }: { group: MyGroup }) {
  const s = useSession();
  const [name, setName] = useState(group.name);
  const [church, setChurch] = useState(group.church);
  const [town, setTown] = useState(group.town);
  const [title, setTitle] = useState(group.leader_title);
  const [sections, setSections] = useState<string[]>(group.sections);
  const [adding, setAdding] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api.updateGroup(group.id, {
        name: name.trim(),
        church: church.trim(),
        town: town.trim(),
        leader_title: title.trim(),
        sections: sections.map((x) => x.trim()).filter(Boolean),
      }),
    onSuccess: async () => {
      await s.refresh();
      if (router.canGoBack()) router.back();
      else router.replace('/group');
    },
  });

  const move = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[i], next[to]] = [next[to], next[i]];
    setSections(next);
  };
  const add = () => {
    const x = adding.trim();
    if (!x) return;
    setSections([...sections, x]);
    setAdding('');
  };

  return (
    <Page>
      <TopBar back title="Group details" subtitle={GROUP_TYPES[group.type].name} />
      <Card>
        <Field label="Group name" value={name} onChangeText={setName} maxLength={80} />
        <Field label="Church or place (optional)" value={church} onChangeText={setChurch} maxLength={120} placeholder="e.g. St. Mary’s Catholic Church" />
        <Field label="Town (optional)" value={town} onChangeText={setTown} maxLength={80} placeholder="e.g. Enugu" />
      </Card>

      <Card>
        <Kicker>What members call the leader</Kicker>
        <View style={styles.wrap}>
          {TITLES.map((t) => (
            <Chip key={t} label={t} on={title === t} onPress={() => setTitle(t)} />
          ))}
        </View>
        <Field label="Leader’s title" value={title} onChangeText={setTitle} maxLength={40} />
      </Card>

      <Card>
        <Kicker>Song order sections</Kicker>
        <Text style={styles.small}>In the order they usually come. Renaming one doesn’t change song orders already planned.</Text>
        {sections.map((x, i) => (
          <View key={i} style={styles.section}>
            <TextInput
              value={x}
              onChangeText={(t) => setSections(sections.map((y, j) => (j === i ? t : y)))}
              maxLength={60}
              accessibilityLabel={`Section ${i + 1}`}
              style={styles.input}
            />
            <Tool label="↑" a11y={`Move ${x} up`} disabled={i === 0} onPress={() => move(i, -1)} />
            <Tool label="↓" a11y={`Move ${x} down`} disabled={i === sections.length - 1} onPress={() => move(i, 1)} />
            <Tool label="✕" a11y={`Remove ${x}`} onPress={() => setSections(sections.filter((_, j) => j !== i))} />
          </View>
        ))}
        <View style={styles.section}>
          <TextInput
            value={adding}
            onChangeText={setAdding}
            onSubmitEditing={add}
            maxLength={60}
            placeholder="Add a section, e.g. Igbo hymn"
            placeholderTextColor="#B3A39A"
            accessibilityLabel="New section"
            style={styles.input}
          />
          <Button small kind="ghost" label="Add" accessibilityLabel="Add section" onPress={add} disabled={!adding.trim()} />
        </View>
      </Card>

      {save.error ? <ErrorText message={save.error.message} /> : null}
      <Button label="Save" onPress={() => save.mutate()} disabled={!name.trim() || !title.trim()} busy={save.isPending} />
    </Page>
  );
}

function Tool({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} style={[styles.tool, disabled && { opacity: 0.3 }]} hitSlop={4}>
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.white,
    outlineColor: colors.red,
  },
  tool: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  toolText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.ink },
});
