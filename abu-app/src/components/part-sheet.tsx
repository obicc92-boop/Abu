/**
 * Who sings a row (owner's request, 21 November 2026, after a bass solo was read as soprano and couldn't be
 * changed): the four parts, or a solo, and for a solo which part sings it (a bass solo is sung where the basses
 * sing). Opened from a row's colour on Check the reading and in the song editor.
 */
import { Text, View } from 'react-native';

import { partName } from '@/solfa';
import { makeStyles } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

import { BottomSheet } from './bottom-sheet';
import { Chip } from './ui';

export const CHOIR_PARTS = ['S', 'A', 'T', 'B'];
export const SOLO_PARTS = ['SoloS', 'SoloA', 'SoloT', 'SoloB', 'Solo'];

export function PartSheet({ open, onClose, current, onChoose }: { open: boolean; onClose: () => void; current: string | null; onChoose: (part: string) => void }) {
  const styles = useStyles();
  const choose = (p: string) => {
    onClose();
    if (p !== current) onChoose(p);
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Who sings this row?" subtitle={current ? `It’s ${partName(current).toLowerCase()} now. The notes stay as they are.` : undefined}>
      <View style={styles.group}>
        <Text style={styles.label}>Parts</Text>
        <View style={styles.wrap}>
          {CHOIR_PARTS.map((p) => (
            <Chip key={p} label={partName(p)} dot={partColor(p)} on={current === p} onPress={() => choose(p)} />
          ))}
        </View>
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>Solo, sung by one part</Text>
        <View style={styles.wrap}>
          {SOLO_PARTS.map((p) => (
            <Chip key={p} label={p === 'Solo' ? 'Solo, any voice' : partName(p)} dot={partColor(p)} on={current === p} onPress={() => choose(p)} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { gap: 8, paddingHorizontal: 4, paddingBottom: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
