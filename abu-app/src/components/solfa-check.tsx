/** The live check under the sol-fa editor: what the reader understood, or what to fix. */
import { StyleSheet, Text, View } from 'react-native';

import { partName, type ParsedSong } from '@/solfa';
import { colors, fonts } from '@/theme/tokens';

export function SolfaCheck({ parsed, empty }: { parsed: ParsedSong; empty: boolean }) {
  if (empty) {
    return <Text style={styles.muted}>No sol-fa yet. You can save the song with just its original sheet, and anyone in your group can type the sol-fa later.</Text>;
  }
  const ok = parsed.errors.length === 0;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      {ok ? (
        <View style={styles.badges}>
          <Badge text={`✓ ${parsed.bars} ${parsed.bars === 1 ? 'bar' : 'bars'}`} />
          <Badge text={`✓ ${parsed.parts.map(partName).join(', ')}`} />
          <Badge text={`✓ every bar fits ${parsed.meta.time}`} />
        </View>
      ) : null}
      {parsed.errors.slice(0, 4).map((e, i) => (
        <Text key={`e${i}`} style={styles.error}>
          {e.message}
        </Text>
      ))}
      {parsed.errors.length > 4 ? <Text style={styles.error}>…and {parsed.errors.length - 4} more.</Text> : null}
      {parsed.warnings.slice(0, 3).map((w, i) => (
        <Text key={`w${i}`} style={styles.warning}>
          {w.message}
        </Text>
      ))}
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { backgroundColor: '#E3F2EF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.ok },
  error: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.redDeep },
  warning: { fontFamily: fonts.body, fontSize: 13, color: '#8A5A00' },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
