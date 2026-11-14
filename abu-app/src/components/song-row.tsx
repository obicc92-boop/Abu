/** A song in a list: key badge, title, composer and time. Opens the player. */
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { KEY_NAMES } from '@/solfa';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export interface SongSummary {
  id: string;
  title: string;
  composer: string;
  doh: number;
  time: string;
  playable: boolean;
}

export function SongRow({ song, note }: { song: SongSummary; note?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Link href={{ pathname: '/song/[id]', params: { id: song.id } }} asChild>
      <Pressable style={styles.row} accessibilityRole="link" accessibilityLabel={`${song.title}, ${song.composer}`}>
        <View style={[styles.badge, !song.playable && styles.badgeSheet]}>
          <Text style={[styles.badgeText, !song.playable && { color: colors.muted }]}>{song.playable ? KEY_NAMES[song.doh] : 'PDF'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {song.title}
          </Text>
          <Text style={styles.small} numberOfLines={1}>
            {[song.composer, song.time, song.playable ? null : 'sheet only'].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Pressable>
    </Link>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12 },
  badge: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.redTint, alignItems: 'center', justifyContent: 'center' },
  badgeSheet: { backgroundColor: colors.sand },
  badgeText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.redDeep },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  note: { fontFamily: fonts.bold, fontSize: 12, color: colors.ok },
}));
