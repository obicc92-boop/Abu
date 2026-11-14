/**
 * Attendance reports (leaders and part leaders): the group's rate, anything
 * not marked yet, and rates by part, month and member, with the register to
 * download as a spreadsheet. A rate is present out of present and absent;
 * excused doesn't count against anyone.
 */
import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { api, attendanceCsvUrl, type Tally } from '@/api/client';
import { Body, Button, Card, Chip, ErrorText, Kicker, Loading, Page, TopBar } from '@/components/ui';
import { rangeFrom, rateColor, REPORT_RANGES, type ReportRange } from '@/lib/attendance';
import { fmtDate, monthName } from '@/lib/dates';
import { download } from '@/lib/download';
import { kindLabel } from '@/lib/group-types';
import { partName, partPlural } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts, partColor } from '@/theme/tokens';

const PART_ORDER = ['S', 'A', 'T', 'B'];

export default function AttendanceReportScreen() {
  const styles = useStyles();
  const colors = useColors();
  const s = useSession();
  const g = s.group;
  const [range, setRange] = useState<ReportRange>('3m');
  const from = rangeFrom(range);
  const leaderish = g?.role === 'leader' || g?.role === 'part_leader';
  const report = useQuery({
    queryKey: ['attendanceReport', g?.id, range],
    queryFn: () => api.attendanceReport(g!.id, { from }),
    enabled: s.status === 'signedIn' && !!g && leaderish,
  });

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  if (!g) return <Loading />;
  if (!leaderish) {
    return (
      <Page>
        <TopBar back title="Attendance" />
        <Card>
          <Body>Only leaders and part leaders see attendance reports. Your own attendance is on your Home page.</Body>
        </Card>
      </Page>
    );
  }

  const r = report.data;
  const unmarked = (r?.events ?? []).filter((e) => e.marked === 0);
  const parts = r ? [...r.parts].sort((a, b) => order(a.part) - order(b.part)) : [];

  return (
    <Page>
      <TopBar back title="Attendance" subtitle={g.name} />
      <View style={styles.wrap}>
        {REPORT_RANGES.map(([key, label]) => (
          <Chip key={key} label={label} on={range === key} onPress={() => setRange(key)} />
        ))}
      </View>
      {report.isPending ? <Loading /> : null}
      {report.error ? <ErrorText message={report.error.message} /> : null}

      {r ? (
        <>
          <Card tone="sand">
            <Kicker>Attendance</Kicker>
            <Text style={[styles.big, { color: rateColor(r.overall.rate, colors) }]}>{r.overall.rate === null ? '—' : `${r.overall.rate}%`}</Text>
            <Text style={styles.small}>
              {r.events.length} {r.events.length === 1 ? 'service or rehearsal' : 'services and rehearsals'} · {r.overall.present} present · {r.overall.absent} absent · {r.overall.excused} excused
            </Text>
            <Button small kind="ghost" label="Download the register (spreadsheet)" onPress={() => download(attendanceCsvUrl(g.id, { from }))} style={{ alignSelf: 'flex-start' }} />
          </Card>

          {unmarked.length ? (
            <Card>
              <Kicker color={colors.redDeep}>Not marked yet · {unmarked.length}</Kicker>
              {unmarked
                .slice(-5)
                .reverse()
                .map((e) => (
                  <Pressable
                    key={e.id}
                    style={styles.line}
                    onPress={() => router.push({ pathname: '/event/[id]/attendance', params: { id: e.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${e.title}, ${fmtDate(e.starts_at)}`}
                  >
                    <Text style={[styles.name, { flex: 1 }]}>
                      {kindLabel(g.type, e.kind)} · {fmtDate(e.starts_at)}
                    </Text>
                    <Text style={styles.link}>Mark</Text>
                  </Pressable>
                ))}
            </Card>
          ) : null}

          {!r.events.length ? <Body muted>No services or rehearsals in this time yet.</Body> : null}

          {parts.length ? (
            <Card>
              <Kicker>By part</Kicker>
              {parts.map((p) => (
                <TallyRow
                  key={p.part || 'none'}
                  label={p.part ? `${partPlural(p.part)} · ${p.members}` : `No part yet · ${p.members}`}
                  color={p.part ? partColor(p.part) : colors.muted}
                  dot={p.part || '–'}
                  tally={p}
                />
              ))}
            </Card>
          ) : null}

          {r.months.length > 1 ? (
            <Card>
              <Kicker>By month</Kicker>
              {[...r.months].reverse().map((m) => (
                <TallyRow key={m.month} label={`${monthName(m.month)} · ${m.events}`} tally={m} />
              ))}
            </Card>
          ) : null}

          {r.events.length ? (
            <>
              <Kicker>By member</Kicker>
              <View style={styles.list}>
                {r.members.map((m) => (
                  <View key={m.user_id} style={styles.member}>
                    <View style={[styles.dot, { backgroundColor: m.part ? partColor(m.part) : colors.barline }]} accessibilityLabel={m.part ? partName(m.part) : 'No part'} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {m.display_name}
                      </Text>
                      <Text style={styles.small}>
                        {m.present} present · {m.absent} absent{m.excused ? ` · ${m.excused} excused` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rate, { color: rateColor(m.rate, colors) }]}>{m.rate === null ? '—' : `${m.rate}%`}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.small}>A rate is present out of present and absent. Excused (including “Can’t come”) doesn’t count against anyone.</Text>
        </>
      ) : null}
    </Page>
  );
}

const order = (part: string) => (part ? (PART_ORDER.includes(part) ? PART_ORDER.indexOf(part) : 10) : 20);

function TallyRow({ label, tally, color, dot }: { label: string; tally: Tally; color?: string; dot?: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.tally}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{label}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${tally.rate ?? 0}%`, backgroundColor: color ?? rateColor(tally.rate, colors) }]} />
        </View>
      </View>
      <Text style={[styles.rate, { color: rateColor(tally.rate, colors) }]}>{tally.rate === null ? '—' : `${tally.rate}%`}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  big: { fontFamily: fonts.monoBold, fontSize: 40, lineHeight: 46 },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  name: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  link: { fontFamily: fonts.heavy, fontSize: 14, color: colors.link },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.sand, marginTop: 4, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  rate: { fontFamily: fonts.monoBold, fontSize: 15, minWidth: 48, textAlign: 'right' },
  list: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
}));
