import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEMO_SONGS } from '@/data/demo-songs';
import { KEY_NAMES, parseSolfa, partName } from '@/solfa';
import { colors, fonts, partColor } from '@/theme/tokens';

/**
 * Placeholder home: the demo songs, each checked by the sol-fa reader.
 * Tap one to open the player. The real home screen comes with accounts.
 */
export default function Home() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.brand}>Abụ</Text>
        <Text style={styles.lede}>Demo songs. Tap one to hear it.</Text>

        {DEMO_SONGS.map((s) => {
          const song = parseSolfa(s.solfa, { time: s.time, key: s.key });
          const ok = song.errors.length === 0;
          return (
            <Link key={s.id} href={{ pathname: '/song/[id]', params: { id: s.id } }} asChild>
              <Pressable style={styles.card} accessibilityRole="link">
                <View style={styles.keyBadge}>
                  <Text style={styles.keyText}>{KEY_NAMES[s.key]}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.title}>{s.title}</Text>
                  <Text style={styles.small}>
                    {s.composer} · {song.meta.time} · {song.bars} bars
                  </Text>
                  <View style={styles.row}>
                    {song.parts.map((p) => (
                      <Text key={p} style={[styles.part, { color: partColor(p) }]}>
                        {partName(p)}
                      </Text>
                    ))}
                  </View>
                  {ok ? null : <Text style={styles.bad}>{song.errors[0].message}</Text>}
                </View>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sand },
  body: { padding: 16, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brand: { fontFamily: fonts.display, fontSize: 38, color: colors.red },
  lede: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginBottom: 4 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  keyBadge: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.redTint, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.redDeep },
  cardText: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  part: { fontFamily: fonts.bold, fontSize: 12.5 },
  bad: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.redDeep },
});
