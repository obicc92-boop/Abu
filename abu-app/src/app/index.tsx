import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEMO_SONGS } from '@/data/demo-songs';
import { KEY_NAMES, parseSolfa, partName } from '@/solfa';
import { colors, partColor } from '@/theme/tokens';

/**
 * Placeholder home. It runs the sol-fa reader on the demo songs so we can see
 * the module working on web and on phones. The real home screen comes next.
 */
export default function Home() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.brand}>Abụ</Text>
        <Text style={styles.lede}>Sol-fa reader check: demo songs</Text>

        {DEMO_SONGS.map((s) => {
          const song = parseSolfa(s.solfa, { time: s.time, key: s.key });
          const ok = song.errors.length === 0;
          return (
            <View key={s.id} style={styles.card}>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.small}>
                Doh is {KEY_NAMES[s.key]} · {song.meta.time} · {song.bars} bars · {song.total} beats
              </Text>
              <View style={styles.row}>
                {song.parts.map((p) => (
                  <Text key={p} style={[styles.part, { color: partColor(p) }]}>
                    {partName(p)} {song.events[p].length}
                  </Text>
                ))}
              </View>
              <Text style={ok ? styles.ok : styles.bad}>
                {ok ? '✓ No problems' : `${song.errors.length} problem(s): ${song.errors[0].message}`}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sand },
  body: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 34, color: colors.red, fontWeight: '600' },
  lede: { fontSize: 15, color: colors.muted, marginBottom: 4 },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 6 },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  small: { fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  part: { fontSize: 13, fontWeight: '600' },
  ok: { fontSize: 13, color: colors.ok, fontWeight: '600' },
  bad: { fontSize: 13, color: colors.redDeep, fontWeight: '600' },
});
