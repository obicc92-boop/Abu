/**
 * What you can do with a song: save it to My songs, add it to your group's
 * repertoire (leaders), edit it, open the original sheet, share it on WhatsApp,
 * and your own practice ("I know my part"). Practice is private to you.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';

import { api, sheetUrl, songLink, type Song } from '@/api/client';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

import { Body, Button, Card, ErrorText, Kicker } from './ui';

export function SongActions({ songId, song }: { songId: string; song?: Song }) {
  const s = useSession();
  const queryClient = useQueryClient();
  const signedIn = s.status === 'signedIn';
  const mine = useQuery({ queryKey: ['songForMe', songId], queryFn: () => api.songForMe(songId), enabled: signedIn && !!song });
  const choir = s.group && s.group.type !== 'personal' && s.group.status === 'active' ? s.group : null;
  const inMySongs = !!s.personal && !!mine.data?.in_groups.includes(s.personal.id);
  const inRepertoire = !!choir && !!mine.data?.in_groups.includes(choir.id);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['songForMe', songId] });
    await queryClient.invalidateQueries({ queryKey: ['repertoire'] });
    // Home's "Learn for upcoming" and leaders' readiness totals use your practice.
    await queryClient.invalidateQueries({ queryKey: ['myPractice'] });
    await queryClient.invalidateQueries({ queryKey: ['readiness'] });
  };
  const toggleIn = useMutation({
    mutationFn: ({ groupId, add }: { groupId: string; add: boolean }) => (add ? api.addToRepertoire(groupId, songId) : api.removeFromRepertoire(groupId, songId)),
    onSuccess: refresh,
  });
  const knows = useMutation({ mutationFn: (v: boolean) => api.setKnowsPart(songId, v), onSuccess: refresh });

  const share = () => {
    const title = song?.title ?? 'this song';
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`Learn your part for ${title} on Abụ: ${songLink(songId)}`)}`);
  };

  return (
    <Card>
      <View style={styles.row}>
        {signedIn && s.personal && song ? (
          <Button
            small
            kind={inMySongs ? 'primary' : 'ghost'}
            label={inMySongs ? 'In My songs ✓' : 'Save to My songs'}
            onPress={() => toggleIn.mutate({ groupId: s.personal!.id, add: !inMySongs })}
          />
        ) : null}
        {choir?.role === 'leader' && song ? (
          <Button
            small
            kind={inRepertoire ? 'primary' : 'ghost'}
            label={inRepertoire ? 'In our repertoire ✓' : 'Add to our repertoire'}
            onPress={() => toggleIn.mutate({ groupId: choir.id, add: !inRepertoire })}
          />
        ) : null}
        {mine.data?.can_edit ? (
          <Button small kind="ghost" label={song?.solfa.trim() ? 'Edit' : 'Type the sol-fa'} onPress={() => router.push({ pathname: '/song-editor', params: { id: songId } })} />
        ) : null}
        {song?.sheet_key ? <Button small kind="ghost" label="Original sheet" onPress={() => Linking.openURL(sheetUrl(songId))} /> : null}
        <Button small kind="ghost" label="Share" onPress={share} />
      </View>
      {toggleIn.error ? <ErrorText message={toggleIn.error.message} /> : null}

      {signedIn && song?.solfa.trim() ? (
        <View style={styles.practice}>
          <View style={{ flex: 1 }}>
            <Kicker>Your practice</Kicker>
            <Text style={styles.plays}>
              {mine.data ? (mine.data.plays ? `Played through ${mine.data.plays} ${mine.data.plays === 1 ? 'time' : 'times'}` : 'Not played through yet') : '…'}
            </Text>
          </View>
          <Text style={styles.knowsLabel}>I know my part</Text>
          <Switch
            value={!!mine.data?.knows_part}
            onValueChange={(v) => knows.mutate(v)}
            accessibilityLabel="I know my part"
            trackColor={{ false: colors.switchOff, true: colors.ok }}
            thumbColor={colors.white}
            {...({ activeThumbColor: colors.white } as object)}
          />
        </View>
      ) : null}
      {!signedIn ? <Body muted>Create an account to save songs and keep track of your practice.</Body> : null}
      {song && (song.group_name || song.shared_by_name) ? (
        <Body muted>Shared by {song.group_name ?? song.shared_by_name}</Body>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  practice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4 },
  plays: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, marginTop: 2 },
  knowsLabel: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink },
});
