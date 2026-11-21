/**
 * Write a song, step 1 of 2: the song's details (owner's request, 21 November 2026: "first the setting, then
 * another page where you actually start writing the sol-fa"). Title, composer, key, time and the parts its music
 * has; then "Start writing" opens the song editor (?from=write) on a first line of music with a row for each part,
 * the sol-fa keys up. What's chosen here and written there is kept between the two (src/lib/new-song.ts), so
 * going back here loses nothing, and a song started earlier is offered to carry on with.
 */
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Body, Button, Card, Chip, Field, Page, Steps, TopBar } from '@/components/ui';
import { clearNewSong, hasMusic, markFirstPage, NEW_SONG_PARTS, newSong, setNewSong, WRITE_STEPS } from '@/lib/new-song';
import { KEY_NAMES, partName } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

const TIMES = ['2/4', '3/4', '4/4', '6/8'];
/** Parts a line of music can have, in the order sheets print them. */
const PARTS = ['Solo', 'S', 'A', 'T', 'B'];

export default function WriteScreen() {
  const styles = useStyles();
  const { status } = useSession();
  // A song started earlier and not saved: offered to carry on with.
  const [earlier, setEarlier] = useState(() => newSong());
  const [title, setTitle] = useState(earlier?.title ?? '');
  const [composer, setComposer] = useState(earlier?.composer ?? '');
  const [doh, setDoh] = useState(earlier?.doh ?? 0);
  const [time, setTime] = useState(earlier?.time ?? '4/4');
  const [parts, setParts] = useState<string[]>(earlier?.parts ?? NEW_SONG_PARTS);
  // Music written for it already: "Carry on writing".
  const [withMusic, setWithMusic] = useState(() => hasMusic(earlier?.solfa ?? ''));

  // The editor, over this page, saves to the song's home and closes this page with it (see song-editor.tsx).
  useEffect(() => {
    markFirstPage(true);
    return () => markFirstPage(false);
  }, []);
  // Back from writing: the details as they are now (they can be changed there too).
  useFocusEffect(
    useCallback(() => {
      const s = newSong();
      if (!s) return;
      setTitle(s.title);
      setComposer(s.composer);
      setDoh(s.doh);
      setTime(s.time);
      setWithMusic(hasMusic(s.solfa));
    }, []),
  );

  if (status === 'signedOut') return <Redirect href={{ pathname: '/auth', params: { mode: 'sign-in' } }} />;

  const start = () => {
    setNewSong({ title: title.trim(), composer: composer.trim(), doh, time, parts: PARTS.filter((p) => parts.includes(p)) });
    router.push({ pathname: '/song-editor', params: { from: 'write' } });
  };
  const afresh = () => {
    clearNewSong();
    setEarlier(null);
    setTitle('');
    setComposer('');
    setDoh(0);
    setTime('4/4');
    setParts(NEW_SONG_PARTS);
    setWithMusic(false);
  };

  return (
    <Page>
      <TopBar back title="New song" subtitle="First the song’s details, then you write the music." />
      <Steps at={1} names={WRITE_STEPS} />

      {earlier ? (
        <Card tone="sand">
          <Body>
            You started “{earlier.title || 'a song'}” earlier{hasMusic(earlier.solfa) ? ', and what you wrote is kept' : ''}. Carry on with it, or start a new song.
          </Body>
          <Button small kind="ghost" label="Start a new song" onPress={afresh} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Ekele Diri Chukwu" />
        <Field label="Composer or arranger (optional)" value={composer} onChangeText={setComposer} placeholder="e.g. Arr. N. Eze" />
      </Card>

      <Card>
        <View style={styles.group}>
          <Text style={styles.label}>Key (doh is)</Text>
          <View style={styles.wrap}>
            {KEY_NAMES.map((k, i) => (
              <Chip key={k} label={k} on={doh === i} onPress={() => setDoh(i)} />
            ))}
          </View>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Time</Text>
          <View style={styles.wrap}>
            {TIMES.map((t) => (
              <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} />
            ))}
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.group}>
          <Text style={styles.label}>Parts</Text>
          <View style={styles.wrap}>
            {PARTS.map((p) => (
              <Chip
                key={p}
                label={partName(p)}
                dot={partColor(p)}
                on={parts.includes(p)}
                onPress={() => setParts(parts.includes(p) ? parts.filter((x) => x !== p) : [...parts, p])}
              />
            ))}
          </View>
          <Body muted>Each line of music gets a row for each part, in its colour. You can change the parts for any line later.</Body>
        </View>
      </Card>

      <Button label={withMusic ? 'Carry on writing' : 'Start writing'} onPress={start} disabled={!title.trim() || !parts.length} style={styles.big} />
      {!title.trim() ? (
        <Body muted style={styles.centred}>
          Give the song a title to start.
        </Body>
      ) : !parts.length ? (
        <Body muted style={styles.centred}>
          Choose at least one part.
        </Body>
      ) : (
        <Body muted style={styles.centred}>
          Next, you write the music part by part with the sol-fa keys.
        </Body>
      )}
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { gap: 8 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  big: { minHeight: 58 },
  centred: { textAlign: 'center' },
}));
