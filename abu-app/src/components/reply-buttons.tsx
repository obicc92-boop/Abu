/** "Going" and "Can't come", side by side; `light` for use on the red card. */
import { Pressable, Text, View } from 'react-native';

import type { Reply } from '@/api/client';
import { makeStyles, useColors } from '@/theme/theme';
import { brand, fonts } from '@/theme/tokens';

export function ReplyButtons({ value, onChange, light }: { value: Reply | null; onChange: (v: Reply) => void; light?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={[styles.seg, light && styles.segLight]}>
      {(
        [
          ['going', 'Going'],
          ['cant', 'Can’t come'],
        ] as const
      ).map(([v, label]) => {
        const on = value === v;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segBtn, on && (light ? styles.segOnLight : styles.segOn)]}
          >
            <Text style={[styles.segText, light && { color: colors.onRed }, on && { color: light ? brand.redDeep : colors.onInk }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  seg: { flexDirection: 'row', gap: 6, backgroundColor: colors.sand, borderRadius: 12, padding: 4 },
  segLight: { backgroundColor: 'rgba(255,255,255,0.16)' },
  segBtn: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.ink },
  segOnLight: { backgroundColor: brand.white },
  segText: { fontFamily: fonts.heavy, fontSize: 14.5, color: colors.ink },
}));
