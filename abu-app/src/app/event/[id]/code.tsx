/**
 * The check-in code, full screen, for a leader or part leader to show at the
 * rehearsal. Members type it on their phones. The count of check-ins updates
 * as they come in, and the screen stays on.
 */
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { Motif } from '@/components/brand';
import { checkInOpen, fmtDate, fmtTime } from '@/lib/dates';
import { useScreenOn } from '@/lib/screen-on';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function CheckInCodeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const signedIn = s.status === 'signedIn';
  const details = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id), enabled: signedIn && !!id });
  const code = useQuery({ queryKey: ['checkInCode', id], queryFn: () => api.checkInCode(id), enabled: signedIn && !!id });
  const sheet = useQuery({ queryKey: ['attendance', id], queryFn: () => api.attendance(id), enabled: signedIn && !!id, refetchInterval: 5_000 });
  useScreenOn();

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  const e = details.data?.event;
  const checkedIn = (sheet.data ?? []).filter((r) => r.self_check_in && r.status === 'present').length;
  const present = (sheet.data ?? []).filter((r) => r.status === 'present').length;
  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/event/[id]', params: { id } }));

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="light" />
      <Motif color={colors.onRed} opacity={0.12} />
      <View style={styles.head}>
        <Text style={styles.kicker} numberOfLines={1}>
          {e ? `${e.title} · ${fmtDate(e.starts_at)} · ${fmtTime(e.starts_at)}` : ''}
        </Text>
        <Pressable onPress={close} accessibilityRole="button" style={styles.done} hitSlop={6}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.middle}>
        <Text style={styles.label}>Check-in code</Text>
        <Text style={styles.code} accessibilityLabel={code.data ? `Check-in code ${code.data.code.split('').join(' ')}` : 'Loading the code'}>
          {code.data?.code ?? (code.error ? '' : '····')}
        </Text>
        {code.error ? <Text style={styles.note}>{code.error.message}</Text> : null}
        <Text style={styles.note}>Members open this rehearsal in Abụ, tap “Check in” and enter the code.</Text>
        {e && !checkInOpen(e.starts_at) ? <Text style={styles.warn}>Check-in opens 3 hours before the start and closes 6 hours after.</Text> : null}
      </View>
      <View style={styles.foot}>
        <Text style={styles.count}>{checkedIn}</Text>
        <Text style={styles.countLabel}>
          checked in{present > checkedIn ? ` · ${present} present in all` : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.redDeep, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  kicker: { flex: 1, fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: '#FFD9CF' },
  done: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  doneText: { fontFamily: fonts.heavy, fontSize: 14, color: colors.onRed },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  label: { fontFamily: fonts.heavy, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase', color: '#FFD9CF' },
  code: { fontFamily: fonts.monoBold, fontSize: 96, lineHeight: 110, letterSpacing: 18, color: colors.onRed, textAlign: 'center' },
  note: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: '#FFE7E0', textAlign: 'center', maxWidth: 360 },
  warn: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.gold, textAlign: 'center', maxWidth: 360 },
  foot: { alignItems: 'center', paddingBottom: 28, gap: 2 },
  count: { fontFamily: fonts.monoBold, fontSize: 40, color: colors.onRed },
  countLabel: { fontFamily: fonts.bold, fontSize: 14, color: '#FFE7E0' },
}));
