/**
 * Group: the invite code, notices, attendance (leaders and part leaders),
 * who's in it by part; and for leaders, letting people in, roles, the
 * group's switches and details. In your own space: join or start one.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { api, type Member, type MyGroup, type Role } from '@/api/client';
import { InviteCard } from '@/components/invite';
import { NoticesSection } from '@/components/notices';
import { Avatar, Body, Button, Card, ErrorText, Kicker, Loading, Page, PartPicker, TopBar } from '@/components/ui';
import { rangeFrom, rateColor } from '@/lib/attendance';
import { GROUP_TYPES } from '@/lib/group-types';
import { partName } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors, usePartInk } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

const PART_ORDER = ['S', 'A', 'T', 'B'];

export default function GroupTab() {
  const colors = useColors();
  const s = useSession();
  if (s.status !== 'signedIn') return <NoGroup signedIn={false} />;
  if (s.loadingMe || !s.group) return <Loading />;
  if (s.group.type === 'personal') return <NoGroup signedIn others={s.groups.filter((g) => g.type !== 'personal')} />;
  if (s.group.status === 'pending') {
    return (
      <Page>
        <TopBar title={s.group.name} subtitle={GROUP_TYPES[s.group.type].name} />
        <Card>
          <Kicker color={colors.redDeep}>Waiting to be let in</Kicker>
          <Body>The leader lets new members in. You’ll see everyone here once they do.</Body>
        </Card>
      </Page>
    );
  }
  return <GroupDetails group={s.group} me={s.profile!.id} />;
}

function GroupDetails({ group, me }: { group: MyGroup; me: string }) {
  const ink = usePartInk();
  const styles = useStyles();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { refresh } = useSession();
  const members = useQuery({ queryKey: ['members', group.id], queryFn: () => api.members(group.id) });
  const leader = group.role === 'leader';
  const leaderish = leader || group.role === 'part_leader';
  // Attendance rates over the last 3 months, for leaders and part leaders only (the same report as the reports screen).
  const report = useQuery({
    queryKey: ['attendanceReport', group.id, '3m'],
    queryFn: () => api.attendanceReport(group.id, { from: rangeFrom('3m') }),
    enabled: leaderish,
  });
  const rates = new Map((report.data?.members ?? []).map((m) => [m.user_id, m.rate]));
  const rateOf = (userId: string) => (leaderish ? rates.get(userId) : undefined);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['members', group.id] });
    await refresh();
  };
  const settings = useMutation({
    mutationFn: (patch: { requires_approval?: boolean; self_check_in?: boolean; part_leaders_edit_orders?: boolean }) => api.updateGroup(group.id, patch),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: () => api.removeMember(group.id, me),
    onSuccess: async () => {
      await refresh();
      router.replace('/');
    },
  });

  const list = members.data ?? [];
  const waiting = list.filter((m) => m.status === 'pending');
  const active = list.filter((m) => m.status === 'active');
  const parts = [...PART_ORDER.filter((p) => active.some((m) => m.part === p)), ...new Set(active.map((m) => m.part).filter((p): p is string => !!p && !PART_ORDER.includes(p)))];
  const noPart = active.filter((m) => !m.part);

  return (
    <Page>
      <TopBar title={group.name} subtitle={[GROUP_TYPES[group.type].name, group.church, group.town].filter(Boolean).join(' · ')} />

      {group.invite_code ? <InviteCard groupName={group.name} code={group.invite_code} /> : null}

      <NoticesSection group={group} me={me} />

      {leader ? (
        <Card>
          <Kicker>Settings</Kicker>
          <Toggle
            label="Approve new members"
            hint="New members wait until a leader lets them in."
            value={group.requires_approval}
            onChange={(v) => settings.mutate({ requires_approval: v })}
          />
          <Toggle
            label="Self check-in at rehearsal"
            hint="Members enter a 4-digit code shown at the rehearsal."
            value={group.self_check_in}
            onChange={(v) => settings.mutate({ self_check_in: v })}
          />
          <Toggle
            label="Part leaders can edit song orders"
            hint="They can add, move and remove songs in any song order. Planning services and rehearsals stays with leaders."
            value={group.part_leaders_edit_orders}
            onChange={(v) => settings.mutate({ part_leaders_edit_orders: v })}
          />
          {settings.error ? <ErrorText message={settings.error.message} /> : null}
          <Button
            small
            kind="ghost"
            label="Name, leader’s title and sections"
            accessibilityLabel="Group details and sections"
            onPress={() => router.push('/group-settings')}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}

      {leaderish ? (
        <Card>
          <View style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Kicker>Attendance · last 3 months</Kicker>
              {report.data && report.data.overall.rate === null ? (
                <Text style={styles.hint}>Nothing marked yet. Mark attendance from a rehearsal’s page.</Text>
              ) : (
                <Text style={[styles.rateBig, { color: rateColor(report.data?.overall.rate ?? null, colors) }]}>{report.data ? `${report.data.overall.rate}%` : '…'}</Text>
              )}
            </View>
            <Button small kind="ghost" label="Reports" accessibilityLabel="Attendance reports" onPress={() => router.push('/attendance-report')} />
          </View>
        </Card>
      ) : null}

      {leader && waiting.length ? (
        <Card>
          <Kicker color={colors.redDeep}>Waiting to join · {waiting.length}</Kicker>
          {waiting.map((m) => (
            <WaitingRow key={m.user_id} groupId={group.id} member={m} onDone={invalidate} />
          ))}
        </Card>
      ) : null}

      {members.isPending ? <Loading label="Loading members…" /> : null}
      {members.error ? <ErrorText message={members.error.message} /> : null}

      {parts.map((p) => (
        <PartSection key={p} title={`${partName(p)} · ${active.filter((m) => m.part === p).length}`} color={ink(p)}>
          {active
            .filter((m) => m.part === p)
            .map((m) => (
              <MemberRow key={m.user_id} group={group} member={m} me={me} rate={rateOf(m.user_id)} onChanged={invalidate} />
            ))}
        </PartSection>
      ))}
      {noPart.length ? (
        <PartSection title={`No part yet · ${noPart.length}`} color={colors.muted}>
          {noPart.map((m) => (
            <MemberRow key={m.user_id} group={group} member={m} me={me} rate={rateOf(m.user_id)} onChanged={invalidate} />
          ))}
        </PartSection>
      ) : null}

      {leave.error ? <ErrorText message={leave.error.message} /> : null}
      <Button kind="danger" label={`Leave ${group.name}`} onPress={() => leave.mutate()} busy={leave.isPending} />
    </Page>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.switchOff, true: colors.red }}
        thumbColor={colors.onRed}
        // On the web, react-native-web colours the "on" knob separately.
        {...({ activeThumbColor: colors.onRed } as object)}
      />
    </View>
  );
}

function PartSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <Kicker color={color}>{title}</Kicker>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

function roleLabel(group: MyGroup, role: Role): string | null {
  if (role === 'leader') return group.leader_title;
  if (role === 'part_leader') return 'Part leader';
  return null;
}

function WaitingRow({ groupId, member, onDone }: { groupId: string; member: Member; onDone: () => Promise<void> }) {
  const styles = useStyles();
  const approve = useMutation({ mutationFn: () => api.approve(groupId, member.user_id), onSuccess: onDone });
  const decline = useMutation({ mutationFn: () => api.removeMember(groupId, member.user_id), onSuccess: onDone });
  return (
    <View style={styles.memberRow}>
      <Avatar name={member.display_name} part={member.part} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{member.display_name}</Text>
        <Text style={styles.hint}>{member.part ? partName(member.part) : 'No part chosen'}</Text>
      </View>
      <Button small label="Let in" onPress={() => approve.mutate()} busy={approve.isPending} />
      <Button small kind="ghost" label="Decline" onPress={() => decline.mutate()} busy={decline.isPending} />
    </View>
  );
}

function MemberRow({
  group,
  member,
  me,
  rate,
  onChanged,
}: {
  group: MyGroup;
  member: Member;
  me: string;
  /** Attendance rate (leaders and part leaders only): a number, null before any marks, undefined when not shown. */
  rate?: number | null;
  onChanged: () => Promise<void>;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const isMe = member.user_id === me;
  const leader = group.role === 'leader';
  const canOpen = isMe || leader;
  const update = useMutation({
    mutationFn: (patch: { role?: Role; part?: string | null }) => api.updateMember(group.id, member.user_id, patch),
    onSuccess: onChanged,
  });
  const remove = useMutation({ mutationFn: () => api.removeMember(group.id, member.user_id), onSuccess: onChanged });
  const role = roleLabel(group, member.role);

  return (
    <View>
      <Pressable
        onPress={() => canOpen && setOpen(!open)}
        disabled={!canOpen}
        accessibilityRole={canOpen ? 'button' : undefined}
        accessibilityLabel={`${member.display_name}${role ? `, ${role}` : ''}`}
        style={styles.memberRow}
      >
        <Avatar name={member.display_name} part={member.part} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>
            {member.display_name}
            {isMe ? <Text style={styles.you}> (you)</Text> : null}
          </Text>
          {role || typeof rate === 'number' ? (
            <Text style={styles.role}>
              {role}
              {role && typeof rate === 'number' ? ' · ' : ''}
              {typeof rate === 'number' ? <Text style={{ color: rateColor(rate, colors) }}>attendance {rate}%</Text> : null}
            </Text>
          ) : null}
        </View>
        {canOpen ? <Text style={styles.more}>{open ? 'Close' : isMe ? 'Change' : 'Manage'}</Text> : null}
      </Pressable>
      {open ? (
        <View style={styles.actions}>
          <Kicker>{isMe ? 'Your part' : 'Part'}</Kicker>
          <PartPicker value={member.part} onChange={(p) => update.mutate({ part: p })} />
          {leader && !isMe ? (
            <>
              <Kicker>Role</Kicker>
              <View style={styles.roleRow}>
                {(['member', 'part_leader', 'leader'] as Role[]).map((r) => (
                  <Button
                    key={r}
                    small
                    kind={member.role === r ? 'primary' : 'ghost'}
                    label={r === 'member' ? 'Member' : r === 'part_leader' ? 'Part leader' : group.leader_title}
                    onPress={() => update.mutate({ role: r })}
                    style={{ flexGrow: 1 }}
                  />
                ))}
              </View>
              <Button small kind="danger" label={`Remove ${member.display_name.split(' ')[0]} from the group`} onPress={() => remove.mutate()} busy={remove.isPending} />
            </>
          ) : null}
          {update.error ? <ErrorText message={update.error.message} /> : null}
          {remove.error ? <ErrorText message={remove.error.message} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Group tab in your own space, or when looking around. */
function NoGroup({ signedIn, others = [] }: { signedIn: boolean; others?: MyGroup[] }) {
  const styles = useStyles();
  const { setGroup, setLookingAround } = useSession();
  return (
    <Page>
      <TopBar title="Groups" subtitle="Choirs, bands and music groups you sing with." />
      <Card>
        <Body>Got a code from a choir or band? Join it. Leading one? Start it and invite your members on WhatsApp.</Body>
        {signedIn ? (
          <View style={styles.roleRow}>
            <Button label="Join a group" onPress={() => router.push('/join')} style={{ flexGrow: 1 }} />
            <Button kind="ghost" label="Start a group" onPress={() => router.push('/create-group')} style={{ flexGrow: 1 }} />
          </View>
        ) : (
          <Button
            label="Create an account or sign in"
            onPress={() => {
              setLookingAround(false);
              router.replace('/welcome');
            }}
          />
        )}
      </Card>
      {others.length ? (
        <>
          <Kicker>Your groups</Kicker>
          {others.map((g) => (
            <Pressable key={g.id} onPress={() => setGroup(g.id)} accessibilityRole="button" style={styles.groupRow}>
              <Text style={styles.name}>{g.name}</Text>
              <Text style={styles.hint}>{g.status === 'pending' ? 'Waiting to be let in' : 'Open'}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rateBig: { fontFamily: fonts.monoBold, fontSize: 24, marginTop: 2 },
  toggleLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  list: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  you: { fontFamily: fonts.body, color: colors.muted },
  role: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.redDeep },
  more: { fontFamily: fonts.bold, fontSize: 13, color: colors.link },
  actions: { gap: 10, paddingBottom: 12 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupRow: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 2 },
}));
