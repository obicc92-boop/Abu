/**
 * The first screen: the music book on red, and four ways in.
 * Signing up or in comes next, then joining, starting a group, or your own space.
 */
import { Redirect, router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark, Motif } from '@/components/brand';
import { Button, MAX_WIDTH } from '@/components/ui';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function Welcome() {
  const styles = useStyles();
  const colors = useColors();
  const { status, setLookingAround } = useSession();
  if (status === 'signedIn') return <Redirect href="/" />;

  const go = (next: 'join' | 'create-group' | 'just-me') => router.push({ pathname: '/auth', params: { next } });

  return (
    <SafeAreaView style={styles.page}>
      <Motif color={colors.onRed} opacity={0.1} />
      <View style={styles.body}>
        <View style={styles.hero}>
          <BrandMark size={96} />
          <Text style={styles.name}>Abụ</Text>
          <Text style={styles.tagline}>Learn your part. Keep your choir together.</Text>
        </View>
        <View style={styles.actions}>
          <Button kind="light" label="I have a group code" onPress={() => go('join')} />
          <Button kind="outlineLight" label="I lead a choir or band" onPress={() => go('create-group')} />
          <Button kind="outlineLight" label="Just me, no group yet" onPress={() => go('just-me')} />
          <Button
            kind="outlineLight"
            label="Look around first"
            style={styles.quiet}
            onPress={() => {
              setLookingAround(true);
              router.replace('/songs');
            }}
          />
          <Text style={styles.signIn} accessibilityRole="link" onPress={() => router.push({ pathname: '/auth', params: { mode: 'sign-in' } })}>
            Already have an account? <Text style={styles.signInStrong}>Sign in</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.red },
  body: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: 24, justifyContent: 'space-between', gap: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 260 },
  name: { fontFamily: fonts.display, fontSize: 56, lineHeight: 70, color: colors.onRed, marginTop: 10 },
  tagline: { fontFamily: fonts.body, fontSize: 17, color: colors.onRedSoft, textAlign: 'center' },
  actions: { gap: 10 },
  quiet: { borderColor: 'transparent' },
  signIn: { fontFamily: fonts.body, fontSize: 15, color: colors.onRedSoft, textAlign: 'center', padding: 10 },
  signInStrong: { fontFamily: fonts.heavy, color: colors.onRed, textDecorationLine: 'underline' },
}));
