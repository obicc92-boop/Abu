/**
 * Thin bars along the top: "Offline" while there's no connection, and "New
 * version ready" when an update has downloaded. Neither shows during Perform,
 * the check-in code or the invite QR code, which take the whole screen.
 */
import { usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnline } from '@/lib/online';
import { applyUpdate, usePwa } from '@/lib/pwa';
import { colors, fonts } from '@/theme/tokens';

export function ConnectionBars() {
  const online = useOnline();
  const { updateReady } = usePwa();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  if (/\/(perform|code|invite-qr)$/.test(path)) return null;
  if (online && !updateReady) return null;
  return (
    <View style={{ paddingTop: insets.top }}>
      {!online ? (
        <View style={[styles.bar, styles.offline]} accessibilityRole="alert">
          <Text style={styles.text}>Offline · showing what’s saved on this phone</Text>
        </View>
      ) : null}
      {online && updateReady ? (
        <View style={[styles.bar, styles.update]}>
          <Text style={[styles.text, { flex: 1 }]}>A new version of Abụ is ready.</Text>
          <Pressable onPress={applyUpdate} accessibilityRole="button" style={styles.button} hitSlop={6}>
            <Text style={styles.buttonText}>Update</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 7 },
  offline: { backgroundColor: colors.ink },
  update: { backgroundColor: colors.redDeep },
  text: { fontFamily: fonts.bold, fontSize: 13, color: colors.white, textAlign: 'center' },
  button: { backgroundColor: colors.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  buttonText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.redDeep },
});
