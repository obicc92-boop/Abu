/**
 * Home for leaders and part leaders: what needs doing now, each line opening
 * the screen that does it, and quick buttons to plan, post and add a song.
 */
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type MyGroup, type TodoItem } from '@/api/client';
import { fmtDate } from '@/lib/dates';
import { kindLabel, kindNoun } from '@/lib/group-types';
import { partPlural } from '@/solfa';
import { colors, fonts } from '@/theme/tokens';

import { Button, Card, Kicker } from './ui';

function line(item: TodoItem, group: MyGroup): { text: string; action: string; href: Href } {
  const what = item.event_kind ? kindLabel(group.type, item.event_kind) : '';
  const when = item.starts_at ? fmtDate(item.starts_at) : '';
  const id = item.event_id ?? '';
  const mine = group.role === 'part_leader' && group.part ? ` ${partPlural(group.part).toLowerCase()}` : '';
  switch (item.kind) {
    case 'unmarked':
      return { text: `Attendance not marked: ${what}, ${when}`, action: 'Mark', href: { pathname: '/event/[id]/attendance', params: { id } } };
    case 'no_replies':
      return {
        text: `${item.count}${mine} ${item.count === 1 ? 'hasn’t' : 'haven’t'} replied for ${item.event_title} (${when})`,
        action: 'See',
        href: { pathname: '/event/[id]', params: { id } },
      };
    case 'no_songs':
      return { text: `${item.event_title} (${when}) has no songs yet`, action: 'Add', href: { pathname: '/event/[id]/order', params: { id } } };
    case 'no_solfa':
      return {
        text: item.count === 1 ? `“${item.song_title}” has no sol-fa yet` : `${item.count} songs coming up have no sol-fa yet, starting with “${item.song_title}”`,
        action: 'Open',
        href: { pathname: '/song/[id]', params: { id: item.song_id ?? '' } },
      };
    case 'waiting':
      return { text: `${item.count} ${item.count === 1 ? 'person is' : 'people are'} waiting to join`, action: 'See', href: '/group' };
  }
}

export function LeaderTodo({ group }: { group: MyGroup }) {
  const leader = group.role === 'leader';
  const todo = useQuery({ queryKey: ['todo', group.id], queryFn: () => api.todo(group.id) });
  // Home stays open underneath while you mark attendance or add songs: check again on coming back.
  const { refetch } = todo;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const items = todo.data ?? [];

  return (
    <Card>
      <Kicker color={colors.redDeep}>To do</Kicker>
      {todo.data && !items.length ? <Text style={styles.done}>All done. Nothing is waiting for you.</Text> : null}
      {items.map((item, i) => {
        const l = line(item, group);
        return (
          <Pressable key={`${item.kind}-${item.event_id ?? i}`} style={styles.row} onPress={() => router.push(l.href)} accessibilityRole="button" accessibilityLabel={`${l.text}. ${l.action}`}>
            <View style={[styles.dot, item.kind === 'unmarked' || item.kind === 'no_songs' ? styles.dotUrgent : null]} />
            <Text style={styles.text}>{l.text}</Text>
            <Text style={styles.action}>{l.action}</Text>
          </Pressable>
        );
      })}
      <View style={styles.quick}>
        {leader ? <Button small kind="ghost" label={`Plan a ${kindNoun(group.type, 'service')}`} onPress={() => router.push('/event-editor')} /> : null}
        <Button small kind="ghost" label="Post a notice" onPress={() => router.push('/group')} />
        <Button small kind="ghost" label="Add a song" onPress={() => router.push('/song-editor')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  done: { fontFamily: fonts.body, fontSize: 14, color: colors.ok },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  dotUrgent: { backgroundColor: colors.red },
  text: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.ink },
  action: { fontFamily: fonts.heavy, fontSize: 13.5, color: colors.red },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
