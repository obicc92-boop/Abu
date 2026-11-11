/**
 * Notices: leaders and part leaders post to everyone or to one part ("Tenors,
 * watch bar 6"). Leaders pin; whoever posted, or a leader, deletes. The Group
 * tab shows them all with the composer; Home shows yours, pinned first.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type MyGroup, type Notice } from '@/api/client';
import { postedText } from '@/lib/dates';
import { partPlural } from '@/solfa';
import { colors, fonts, partColor } from '@/theme/tokens';

import { Button, Card, Chip, ErrorText, Field, Kicker } from './ui';

const MAX = 2000;


export function NoticesSection({ group, me, forMe, limit }: { group: MyGroup; me: string; forMe?: boolean; limit?: number }) {
  const notices = useQuery({ queryKey: ['notices', group.id], queryFn: () => api.notices(group.id) });
  const leaderish = group.role === 'leader' || group.role === 'part_leader';
  const all = notices.data ?? [];
  // On Home: notices for everyone and for your part (leaders see every part's notes on the Group tab).
  const list = forMe ? all.filter((n) => !n.part || n.part === group.part) : all;
  const shown = limit ? list.slice(0, limit) : list;

  if (forMe && !list.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Kicker>Notices</Kicker>
        {forMe && (list.length > shown.length || leaderish) ? (
          <Pressable onPress={() => router.push('/group')} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.link}>{leaderish ? 'Post or see all' : 'See all'}</Text>
          </Pressable>
        ) : null}
      </View>
      {!forMe && leaderish ? <NoticeComposer group={group} /> : null}
      {notices.error ? <ErrorText message={notices.error.message} /> : null}
      {shown.map((n) => (
        <NoticeCard key={n.id} notice={n} group={group} me={me} />
      ))}
      {!forMe && !notices.isPending && !all.length ? (
        <Card>
          <Text style={styles.small}>{leaderish ? 'No notices yet. Post one above: the whole group, or just one part, will see it.' : 'No notices yet.'}</Text>
        </Card>
      ) : null}
    </View>
  );
}

function NoticeCard({ notice, group, me }: { notice: Notice; group: MyGroup; me: string }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notices', group.id] });
  const pin = useMutation({ mutationFn: () => api.pinNotice(notice.id, !notice.pinned), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.deleteNotice(notice.id), onSuccess: refresh });
  const leader = group.role === 'leader';
  const canDelete = leader || notice.author_id === me;

  return (
    <Card style={notice.pinned ? styles.pinned : undefined}>
      <View style={styles.meta}>
        {notice.pinned ? <Text style={styles.pin}>Pinned</Text> : null}
        {notice.part ? <Text style={[styles.for, { color: partColor(notice.part), borderColor: partColor(notice.part) }]}>For {partPlural(notice.part).toLowerCase()}</Text> : null}
        <Text style={styles.small} numberOfLines={1}>
          {[notice.author_name ?? 'Someone who left', postedText(notice.created_at)].join(' · ')}
        </Text>
      </View>
      <Text style={styles.body}>{notice.body}</Text>
      {leader || canDelete ? (
        confirm ? (
          <View style={styles.row}>
            <Text style={[styles.small, { flexBasis: '100%' }]}>Delete this notice for everyone?</Text>
            <Button small kind="danger" label="Yes, delete" onPress={() => remove.mutate()} busy={remove.isPending} />
            <Button small kind="ghost" label="Keep it" onPress={() => setConfirm(false)} />
          </View>
        ) : (
          <View style={styles.row}>
            {leader ? (
              <Button
                small
                kind="ghost"
                label={notice.pinned ? 'Unpin' : 'Pin'}
                accessibilityLabel={`${notice.pinned ? 'Unpin' : 'Pin'} notice: ${notice.body.slice(0, 40)}`}
                onPress={() => pin.mutate()}
                busy={pin.isPending}
              />
            ) : null}
            {canDelete ? <Button small kind="ghost" label="Delete" accessibilityLabel="Delete notice" onPress={() => setConfirm(true)} /> : null}
          </View>
        )
      ) : null}
      {pin.error ? <ErrorText message={pin.error.message} /> : null}
      {remove.error ? <ErrorText message={remove.error.message} /> : null}
    </Card>
  );
}

/** Write a notice: to everyone, or (leaders) any part, or (part leaders) their own part. */
function NoticeComposer({ group }: { group: MyGroup }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [part, setPart] = useState<string | null>(null);
  const parts = group.role === 'leader' ? group.parts : group.part ? [group.part] : [];
  const post = useMutation({
    mutationFn: () => api.postNotice(group.id, body.trim(), part),
    onSuccess: async () => {
      setBody('');
      setPart(null);
      await queryClient.invalidateQueries({ queryKey: ['notices', group.id] });
    },
  });

  return (
    <Card>
      <Field
        label="Post a notice"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={MAX}
        placeholder={part ? `e.g. ${partPlural(part)}, watch bar 6 of the Gloria.` : 'e.g. Rehearsal moves to 4:30 PM this Thursday.'}
        hint={body.length > MAX - 200 ? `${MAX - body.length} characters left` : undefined}
      />
      {parts.length ? (
        <View style={styles.row}>
          <Chip label="Everyone" on={part === null} onPress={() => setPart(null)} />
          {parts.map((p) => (
            <Chip key={p} label={partPlural(p)} on={part === p} onPress={() => setPart(p)} />
          ))}
        </View>
      ) : null}
      {post.error ? <ErrorText message={post.error.message} /> : null}
      <Button label={part ? `Post to ${partPlural(part).toLowerCase()}` : 'Post to everyone'} onPress={() => post.mutate()} disabled={!body.trim()} busy={post.isPending} />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.heavy, fontSize: 14, color: colors.red },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  pinned: { borderColor: '#F0D9A6', backgroundColor: '#FFFBF2' },
  pin: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: '#94600A', backgroundColor: '#FBF0DA', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  for: { fontFamily: fonts.heavy, fontSize: 11.5, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, flexShrink: 1 },
  body: { fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, color: colors.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
