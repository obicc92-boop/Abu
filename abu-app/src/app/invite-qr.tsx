/**
 * The invite as a QR code, full screen, to show at rehearsal: members point
 * their phone camera at it and the join page opens. The screen stays on.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { inviteLink } from '@/api/client';
import { QrCode } from '@/components/qr-code';
import { Loading } from '@/components/ui';
import { useScreenOn } from '@/lib/screen-on';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

export default function InviteQrScreen() {
  const s = useSession();
  const params = useLocalSearchParams<{ code?: string; name?: string }>();
  useScreenOn();
  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  // The group it was opened for (just created, or the Group tab's), else the current one.
  const code = params.code ?? s.group?.invite_code ?? null;
  const name = params.name ?? s.group?.name ?? '';
  if (!code && !s.group) return <Loading />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/group'));

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.head}>
        <Text style={styles.kicker} numberOfLines={1}>
          Join {name}
        </Text>
        <Pressable onPress={close} accessibilityRole="button" style={styles.done} hitSlop={6}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      {code ? (
        <View style={styles.middle}>
          <QrCode value={inviteLink(code)} size={260} />
          <Text style={styles.note}>Point your phone camera at the code, then tap the link to join on Abụ.</Text>
          <Text style={styles.or}>Or enter the code</Text>
          <Text style={styles.code} accessibilityLabel={`Group code ${code.split('').join(' ')}`}>
            {code}
          </Text>
        </View>
      ) : (
        <View style={styles.middle}>
          <Text style={styles.note}>This space has no invite code.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  kicker: { flex: 1, fontFamily: fonts.heavy, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.redDeep },
  done: { backgroundColor: colors.sand, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  doneText: { fontFamily: fonts.heavy, fontSize: 14, color: colors.ink },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  note: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink, textAlign: 'center', maxWidth: 320 },
  or: { fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, marginTop: 6 },
  code: { fontFamily: fonts.monoBold, fontSize: 40, letterSpacing: 10, color: colors.ink },
});
