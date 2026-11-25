/**
 * A song in a list: its cover (colleagues' request, 25 November 2026: songs with pictures, as music apps list them;
 * a drawn one without), title, composer, key and time. Opens the player.
 */
import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { KEY_NAMES } from '@/solfa';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { CoverArt } from './cover-art';
import { PressScale } from './motion';

export interface SongSummary {
  id: string;
  title: string;
  composer: string;
  doh: number;
  time: string;
  playable: boolean;
  /** Its cover picture's key, if it has one. */
  cover?: string | null;
}

export function SongRow({ song, note }: { song: SongSummary; note?: string }) {
  const styles = useStyles();
  return (
    <Link href={{ pathname: '/song/[id]', params: { id: song.id } }} asChild>
      <PressScale to={0.98} style={styles.row} accessibilityRole="link" accessibilityLabel={`${song.title}, ${song.composer}`}>
        <CoverArt song={{ id: song.id, title: song.title, cover: song.cover }} size={48} radius={10} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {song.title}
          </Text>
          <Text style={styles.small} numberOfLines={1}>
            {[song.composer, song.playable ? `Doh is ${KEY_NAMES[song.doh]}` : 'sheet only', song.playable ? song.time : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {note ? (
          <Text style={styles.note} numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </PressScale>
    </Link>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 10 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  // Room for the title first: a long group's name takes two lines rather than the title's room.
  note: { fontFamily: fonts.bold, fontSize: 12, color: colors.ok, maxWidth: '34%', textAlign: 'right' },
}));
