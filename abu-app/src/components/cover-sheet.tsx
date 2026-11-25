/**
 * A song's cover, for whoever can edit the song (colleagues' request, 25 November 2026: "creators can decide to
 * upload their thumbnail", or have one generated): choose a picture from the phone (cut square, 800 pixels across:
 * src/lib/avatar-photo.ts), make one with AI from the song's title and tags and, if given, an idea of what it should
 * show, or take it away for the cover the app draws. The new cover shows at the top as soon as it's saved, so
 * another can be tried.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { api, type Song } from '@/api/client';
import { pickCover } from '@/lib/avatar-photo';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { BottomSheet, Rise, SheetRow } from './bottom-sheet';
import { CoverArt } from './cover-art';
import { PictureIcon, SparkleIcon } from './icons';
import { Button, ErrorText, Field } from './ui';

export function CoverSheet({ open, onClose, song }: { open: boolean; onClose: () => void; song: Song }) {
  const styles = useStyles();
  const colors = useColors();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [idea, setIdea] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saved = async (next: Song) => {
    queryClient.setQueryData(['song', song.id], next);
    // Wherever the song shows with its cover.
    await Promise.all(['home', 'songs', 'repertoire'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
  };
  const failed = (e: Error) => setError(e.message);
  const upload = useMutation({ mutationFn: (p: { image: Blob; type: string }) => api.setCover(song.id, p.image, p.type), onSuccess: saved, onError: failed });
  const make = useMutation({
    mutationFn: () => api.makeCover(song.id, idea),
    onSuccess: async (next) => {
      setAsking(false);
      await saved(next);
    },
    onError: failed,
  });
  const remove = useMutation({ mutationFn: () => api.removeCover(song.id), onSuccess: saved, onError: failed });
  const busy = upload.isPending || make.isPending || remove.isPending;

  const choose = async () => {
    setError(null);
    try {
      const picked = await pickCover();
      if (picked) upload.mutate(picked);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Song cover" subtitle="It shows on Home, in lists and while the song plays.">
      <View style={styles.preview}>
        <CoverArt song={{ id: song.id, title: song.title, cover: song.cover_key, solfa: song.solfa }} size={168} radius={20} />
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.onHero} />
            <Text style={styles.busyText}>{make.isPending ? 'Making your cover…' : upload.isPending ? 'Saving the picture…' : 'Removing…'}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.note}>
        {song.cover_key ? (song.cover_source === 'ai' ? 'Made by AI.' : 'A picture you chose.') : 'No cover yet: SolfaScores draws one from the song.'}
      </Text>
      {error ? <ErrorText message={error} /> : null}

      {asking ? (
        <Rise delay={0}>
          <View style={styles.ask}>
            <Field
              label="What should it show? (optional)"
              value={idea}
              onChangeText={setIdea}
              placeholder="e.g. a village church at sunrise"
              maxLength={200}
              hint="Or leave it empty: the AI goes by the title and tags. Up to 10 covers a day."
              onSubmitEditing={() => !busy && make.mutate()}
            />
            <View style={styles.row}>
              <Button small label="Make the cover" onPress={() => make.mutate()} busy={make.isPending} />
              <Button small kind="ghost" label="Cancel" onPress={() => setAsking(false)} />
            </View>
          </View>
        </Rise>
      ) : (
        <>
          <SheetRow index={0} icon={<PictureIcon color={colors.ink} />} wash={colors.board} title="Choose a picture" sub="From your phone. A square picture looks best." onPress={() => !busy && void choose()} />
          <SheetRow
            index={1}
            icon={<SparkleIcon color={colors.onPrimary} />}
            wash={colors.primary}
            title="Make one with AI"
            sub="From the song’s title and tags, and your idea if you give one."
            onPress={() => {
              if (busy) return;
              setError(null);
              setAsking(true);
            }}
          />
          {song.cover_key ? (
            <SheetRow index={2} icon={<PictureIcon color={colors.danger} />} wash={colors.dangerTint} title="Remove the cover" sub="Go back to the cover SolfaScores draws." danger chevron={false} onPress={() => !busy && remove.mutate()} />
          ) : null}
        </>
      )}
      <Button kind="ghost" label="Done" onPress={onClose} />
    </BottomSheet>
  );
}

const useStyles = makeStyles((colors) => ({
  preview: { alignSelf: 'center', marginTop: 4 },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, backgroundColor: `${colors.hero}B3`, alignItems: 'center', justifyContent: 'center', gap: 8 },
  busyText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onHero },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
  ask: { gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
}));
