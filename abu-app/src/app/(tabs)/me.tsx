/**
 * Me: your profile, laid out as popular apps lay theirs out (owner's request, 21 November 2026): a header with
 * your picture (a photo of your own, or your initials), your name with a pencil to change it, email, part and group; your practice (private to you) as a row of numbers
 * and the songs you're learning; then lists of rows, each with an icon, what it's set to and a chevron, that open
 * in place: your groups (tap to show one, the part pill to change your part there, join or start one), settings
 * (appearance, the player's sound, Perform's background, saved for offline, installing the app) and your account
 * (email, password, signing out). The version, the privacy note and the sounds' credits close it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { api, type MyGroup } from '@/api/client';
import { INSTRUMENTS, sizeText, type Instrument } from '@/audio/instruments';
import { chooseSound, useChosenSound, useSoundState } from '@/audio/sound-setting';
import { authClient } from '@/auth/client';
import { BottomSheet, SheetRow } from '@/components/bottom-sheet';
import { MainFill } from '@/components/brand';
import {
  CameraIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  DownloadIcon,
  LockIcon,
  MailIcon,
  MoonIcon,
  PencilIcon,
  PeopleIcon,
  PersonIcon,
  PhoneIcon,
  PlusIcon,
  SignOutIcon,
  SongsIcon,
  StageIcon,
} from '@/components/icons';
import { SongRow } from '@/components/song-row';
import { Avatar, Button, Chip, ErrorText, Field, Loading, Page, PartPicker } from '@/components/ui';
import { pickAvatar } from '@/lib/avatar-photo';
import { sinceText } from '@/lib/dates';
import { GROUP_TYPES } from '@/lib/group-types';
import { dataSaverOn, forgetOfflineSummary, saveForOffline, setDataSaver, useOfflineSummary } from '@/lib/keep-offline';
import { clearOfflineData } from '@/lib/offline';
import { useOnline } from '@/lib/online';
import { install, usePwa } from '@/lib/pwa';
import { clearSheets, connectionKind } from '@/lib/sheets-cache';
import { readSetting, writeSetting } from '@/lib/storage';
import { partName } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, type ThemeChoice, useColors, usePartInk, useTheme } from '@/theme/theme';
import { brand, fonts, palettes, partColor, type Palette } from '@/theme/tokens';

const PERFORM_THEME = 'abu.performTheme';

const LOOK_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Me() {
  const styles = useStyles();
  const colors = useColors();
  const s = useSession();
  const pwa = usePwa();
  const summary = useOfflineSummary();
  const { choice } = useTheme();
  // One row open at a time, as a settings list does.
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen(open === key ? null : key);
  const [performLight, setPerformLight] = useState(() => readSetting(PERFORM_THEME) === 'light');
  const sound = useChosenSound();
  const signedIn = s.status === 'signedIn';

  if (signedIn && (s.loadingMe || !s.profile)) return <Loading />;

  const offlineValue = summary ? `Updated ${sinceText(summary.at)}` : signedIn ? 'Nothing saved yet' : '';
  const settings = (
    <Section title="Settings">
      <Row icon={<MoonIcon color={colors.ink} />} label="Appearance" value={LOOK_CHOICES.find((c) => c.value === choice)?.label} open={open === 'look'} onPress={() => toggle('look')}>
        <Appearance />
      </Row>
      <Row icon={<SongsIcon color={colors.ink} size={20} />} label="Sound" value={INSTRUMENTS.find((i) => i.name === sound)?.label} open={open === 'sound'} onPress={() => toggle('sound')}>
        <SoundChoices chosen={sound} />
      </Row>
      <Row icon={<StageIcon color={colors.ink} />} label="Perform background" value={performLight ? 'Light' : 'Dark'} open={open === 'perform'} onPress={() => toggle('perform')}>
        <Text style={styles.help}>The background for reading sol-fa at Mass or on stage. Dark is easier in a dim church; light is clearer in daylight.</Text>
        <View style={styles.wrap}>
          <Chip label="Dark" on={!performLight} onPress={() => (setPerformLight(false), writeSetting(PERFORM_THEME, 'dark'))} />
          <Chip label="Light" on={performLight} onPress={() => (setPerformLight(true), writeSetting(PERFORM_THEME, 'light'))} />
        </View>
      </Row>
      <Row icon={<DownloadIcon color={colors.ink} />} label="Saved for offline" value={offlineValue} open={open === 'offline'} onPress={() => toggle('offline')}>
        <OfflineDetails />
      </Row>
      {pwa.installed ? (
        <Row icon={<PhoneIcon color={colors.ink} />} label="Installed on this phone" value="Opens like an app" />
      ) : pwa.canInstall ? (
        <Row icon={<PhoneIcon color={colors.ink} />} label="Install SolfaScores" value="Works without data" onPress={() => void install()} />
      ) : pwa.ios ? (
        <Row icon={<PhoneIcon color={colors.ink} />} label="Install SolfaScores" open={open === 'install'} onPress={() => toggle('install')}>
          <Text style={styles.help}>In Safari, tap Share, then “Add to Home Screen”. SolfaScores then opens like an app, even without data in church.</Text>
        </Row>
      ) : null}
    </Section>
  );
  const footer = <About />;

  if (!signedIn) {
    return (
      <Page>
        <View style={styles.header}>
          <View style={styles.guest}>
            <PersonIcon color={colors.muted} size={40} />
          </View>
          <Text style={styles.name}>You’re looking around</Text>
          <Text style={styles.email}>Create an account to join your choir, save songs and keep your practice.</Text>
          <Button
            label="Create an account or sign in"
            onPress={() => {
              s.setLookingAround(false);
              router.replace('/welcome');
            }}
            style={styles.headerButton}
          />
        </View>
        {settings}
        {footer}
      </Page>
    );
  }

  const profile = s.profile!;
  const here = s.group;
  return (
    <Page>
      <Header />
      <YourPractice />

      <Section title="Your groups">
        {s.groups.map((g) => (
          <GroupRow key={g.id} group={g} me={profile.id} current={g.id === here?.id} open={open === `part:${g.id}`} onPart={() => toggle(`part:${g.id}`)} />
        ))}
        <Row icon={<PlusIcon color={colors.ink} size={20} />} label="Join a group" value="With a code or link" onPress={() => router.push('/join')} />
        <Row icon={<PeopleIcon color={colors.ink} size={20} />} label="Start a group" value="Lead a choir or band" onPress={() => router.push('/create-group')} />
      </Section>

      {settings}

      <Section title="Account">
        <Row icon={<MailIcon color={colors.ink} />} label="Email" value={s.email ?? ''} />
        <Row icon={<LockIcon color={colors.ink} />} label="Password" value="Change" open={open === 'password'} onPress={() => toggle('password')}>
          <Password onDone={() => setOpen(null)} />
        </Row>
        <Row icon={<SignOutIcon color={colors.danger} />} label="Sign out" danger open={open === 'signout'} onPress={() => toggle('signout')}>
          <Text style={styles.help}>Sign out of SolfaScores on this phone? What’s saved for offline stays until you clear it.</Text>
          <View style={styles.wrap}>
            <Button
              small
              kind="danger"
              label="Sign out"
              onPress={async () => {
                await s.signOut();
                router.replace('/welcome');
              }}
            />
            <Button small kind="ghost" label="Cancel" onPress={() => setOpen(null)} />
          </View>
        </Row>
      </Section>

      {footer}
    </Page>
  );
}

/**
 * Your picture, name and email, your part and group (owner's request, 21 November 2026). The picture has a camera
 * badge: tapped, it chooses a photo (with one already, a sheet offers a new one or taking it away). The name has a
 * pencil beside it: tapped, the name becomes a field in place, with ✓ and ✕.
 */
function Header() {
  const styles = useStyles();
  const colors = useColors();
  const ink = usePartInk();
  const s = useSession();
  const [name, setName] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Your name and picture show on members lists and registers too: those are fetched afresh.
  const changed = async () => {
    await s.refresh();
    await queryClient.invalidateQueries({ queryKey: ['members'] });
  };
  const save = useMutation({ mutationFn: (display_name: string) => api.updateMe({ display_name }), onSuccess: () => (setName(null), changed()) });
  const upload = useMutation({ mutationFn: (p: { image: Blob; type: string }) => api.setAvatar(p.image, p.type), onSuccess: changed });
  const remove = useMutation({ mutationFn: api.removeAvatar, onSuccess: changed });
  const profile = s.profile!;
  const hasPhoto = !!profile.avatar_key;
  const busy = upload.isPending || remove.isPending;
  const error = photoError ?? upload.error?.message ?? remove.error?.message ?? null;
  // The file chooser opens straight from the tap (a phone allows it only then).
  const choose = async () => {
    setPhotoSheet(false);
    setPhotoError(null);
    upload.reset();
    remove.reset();
    try {
      const picked = await pickAvatar();
      if (picked) upload.mutate(picked);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Couldn’t use that photo.');
    }
  };
  const g = s.group;
  const personal = g?.type === 'personal';
  const role = g && !personal ? (g.role === 'leader' ? g.leader_title : g.role === 'part_leader' ? 'Part leader' : null) : null;
  const done = () => name !== null && name.trim() && save.mutate(name);
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => (hasPhoto ? setPhotoSheet(true) : void choose())}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? 'Profile photo: change or remove it' : 'Add a profile photo'}
        style={({ pressed }) => [styles.ring, g?.part ? { borderColor: partColor(g.part) } : null, pressed && { opacity: 0.85 }]}
      >
        <Avatar name={profile.display_name} part={g?.part} size={84} photo={profile.avatar_key} />
        {busy ? (
          <View style={styles.photoBusy}>
            <ActivityIndicator color={brand.white} />
          </View>
        ) : null}
        <View style={styles.cameraBadge}>
          <CameraIcon color={colors.onInk} size={15} />
        </View>
      </Pressable>
      {error ? <ErrorText message={error} /> : null}

      {name === null ? (
        <View style={styles.nameRow}>
          {/* As wide as the pencil, so the name stays in the middle. */}
          <View style={styles.pencilSpace} />
          <Text style={styles.name} numberOfLines={2}>
            {profile.display_name}
          </Text>
          <Pressable onPress={() => (save.reset(), setName(profile.display_name))} accessibilityRole="button" accessibilityLabel="Edit your name" style={styles.pencil} hitSlop={10}>
            <PencilIcon color={colors.ink} size={15} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.nameEdit}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={done}
            autoFocus
            selectTextOnFocus
            maxLength={80}
            returnKeyType="done"
            autoComplete="name"
            accessibilityLabel="Your name"
            style={styles.nameInput}
          />
          <Pressable onPress={done} disabled={!name.trim() || save.isPending} accessibilityRole="button" accessibilityLabel="Save your name" style={[styles.nameSave, !name.trim() && { opacity: 0.5 }]}>
            <MainFill from={colors.primary} to={colors.primary2} />
            <View>{save.isPending ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <CheckIcon color={colors.onPrimary} size={18} />}</View>
          </Pressable>
          <Pressable onPress={() => setName(null)} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.nameCancel}>
            <CloseIcon color={colors.ink} size={14} />
          </Pressable>
        </View>
      )}
      {save.error ? <ErrorText message={save.error.message} /> : null}
      {s.email ? <Text style={styles.email}>{s.email}</Text> : null}
      <View style={styles.facts}>
        {g?.part ? (
          <View style={styles.fact}>
            <View style={[styles.factDot, { backgroundColor: partColor(g.part) }]} />
            <Text style={[styles.factText, { color: ink(g.part) }]}>{partName(g.part)}</Text>
          </View>
        ) : null}
        {g ? (
          <View style={styles.fact}>
            <Text style={styles.factText} numberOfLines={1}>
              {personal ? 'My space' : g.name}
              {role ? ` · ${role}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <BottomSheet open={photoSheet} onClose={() => setPhotoSheet(false)} title="Profile photo" subtitle="Your groups see it beside your name.">
        <SheetRow index={0} icon={<CameraIcon color={colors.ink} />} wash={colors.board} title="Choose a new photo" sub="From your gallery or camera" onPress={() => void choose()} />
        <SheetRow
          index={1}
          icon={<CloseIcon color={colors.danger} size={16} />}
          wash={colors.dangerTint}
          title="Remove photo"
          sub="Your initials show instead"
          danger
          chevron={false}
          onPress={() => {
            setPhotoSheet(false);
            setPhotoError(null);
            remove.mutate();
          }}
        />
      </BottomSheet>
    </View>
  );
}

/** This week, the songs you know and a gentle streak, in one row; then the songs you're learning. Only you see it. */
function YourPractice() {
  const styles = useStyles();
  const colors = useColors();
  const summary = useQuery({ queryKey: ['myPractice', 'summary'], queryFn: api.practiceSummary });
  const songs = useQuery({ queryKey: ['myPractice'], queryFn: api.myPractice });
  const [all, setAll] = useState(false);
  const t = summary.data;
  const list = (songs.data ?? []).filter((p) => p.plays > 0 || p.knows_part);
  const shown = all ? list : list.slice(0, 3);
  return (
    <>
      <View style={styles.stats}>
        {t ? (
          <>
            <Stat value={t.week_plays} label={t.week_plays === 1 ? 'Play this week' : 'Plays this week'} />
            <View style={styles.statLine} />
            <Stat value={t.songs_known} label={t.songs_known === 1 ? 'Song you know' : 'Songs you know'} />
            <View style={styles.statLine} />
            <Stat value={t.streak} label={t.streak === 1 ? 'Day in a row' : 'Days in a row'} color={t.streak >= 2 ? colors.gold : undefined} />
          </>
        ) : summary.error ? (
          <ErrorText message={summary.error.message} />
        ) : (
          <Loading />
        )}
      </View>
      {t ? (
        <Text style={styles.statNote}>
          {t.streak >= 2
            ? `Lovely: ${t.streak} days in a row. Play a song today to keep it going.`
            : t.week_days
              ? `You practised on ${t.week_days} ${t.week_days === 1 ? 'day' : 'days'} this week.`
              : 'Play any song through to start your week.'}{' '}
          Only you see this.
        </Text>
      ) : null}
      {shown.length ? (
        <Section title="Songs you’re learning" action={list.length > shown.length ? { label: `See all ${list.length}`, onPress: () => setAll(true) } : undefined} plain>
          {shown.map((p) => (
            <SongRow
              key={p.song_id}
              song={{ id: p.song_id, title: p.title, composer: p.composer, doh: p.doh, time: p.time_signature, playable: p.playable }}
              note={p.knows_part ? '✓ Know it' : `${p.plays} ${p.plays === 1 ? 'play' : 'plays'}`}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** A titled list, as settings lists are: rows on one card, divided by hairlines. `plain`: its rows bring their own cards. */
function Section({ title, action, plain, children }: { title: string; action?: { label: string; onPress: () => void }; plain?: boolean; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {plain ? <View style={styles.plain}>{children}</View> : <View style={styles.list}>{children}</View>}
    </View>
  );
}

/**
 * One row: an icon, a name, what it's set to, and a chevron when it does something. With children it opens in
 * place to show them (the chevron turns down).
 */
function Row({
  icon,
  label,
  value,
  onPress,
  open,
  danger,
  trailing,
  children,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  open?: boolean;
  danger?: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const body = (
    <>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerTint }]}>{icon}</View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]} numberOfLines={1}>
        {label}
      </Text>
      {/* What it's set to, or room, so the chevron keeps to the right edge. */}
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {trailing}
      {onPress ? (
        <View style={open ? styles.chevronOpen : null}>
          <ChevronIcon color={colors.faint} />
        </View>
      ) : null}
    </>
  );
  return (
    <View style={styles.rowWrap}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={value ? `${label}: ${value}` : label}
          accessibilityState={children ? { expanded: !!open } : undefined}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.row}>{body}</View>
      )}
      {open && children ? <View style={styles.rowBody}>{children}</View> : null}
    </View>
  );
}

/** One of your groups: tap to show it; its part pill opens the parts to change the one you sing there. */
function GroupRow({ group: g, me, current, open, onPart }: { group: MyGroup; me: string; current: boolean; open: boolean; onPart: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const ink = usePartInk();
  const s = useSession();
  const queryClient = useQueryClient();
  const setPart = useMutation({
    mutationFn: (part: string | null) => api.updateMember(g.id, me, { part }),
    onSuccess: async () => {
      onPart();
      await s.refresh();
      await queryClient.invalidateQueries({ queryKey: ['members', g.id] });
    },
  });
  const personal = g.type === 'personal';
  const name = personal ? 'My space' : g.name;
  const about = personal
    ? 'Your own songs and setlists'
    : [GROUP_TYPES[g.type].name, g.status === 'pending' ? 'waiting to be let in' : g.role === 'leader' ? g.leader_title : g.role === 'part_leader' ? 'Part leader' : null]
        .filter(Boolean)
        .join(' · ');
  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            s.setGroup(g.id);
            router.push('/');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Show ${name}`}
          accessibilityState={{ selected: current }}
          style={styles.groupMain}
        >
          <View style={[styles.groupBadge, current && styles.groupBadgeOn]}>
            {personal ? <PersonIcon color={current ? colors.onInk : colors.ink} size={20} /> : <Text style={[styles.groupInitial, current && { color: colors.onInk }]}>{name.charAt(0).toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.groupAbout} numberOfLines={1}>
              {current ? <Text style={styles.showing}>Showing · </Text> : null}
              {about}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onPart}
          accessibilityRole="button"
          accessibilityLabel={`Your part in ${name}: ${g.part ? partName(g.part) : 'not set'}. Change it`}
          accessibilityState={{ expanded: open }}
          style={styles.partPill}
          hitSlop={6}
        >
          {g.part ? <View style={[styles.factDot, { backgroundColor: partColor(g.part) }]} /> : null}
          <Text style={[styles.partPillText, g.part ? { color: ink(g.part) } : null]}>{g.part ? partName(g.part) : 'Set part'}</Text>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.rowBody}>
          <Text style={styles.help}>{personal ? 'The part you usually sing, for your own songs.' : `The part you sing in ${name}. Leaders see it on the members list.`}</Text>
          <PartPicker value={g.part} onChange={(p) => setPart.mutate(p)} allowNone />
          {setPart.error ? <ErrorText message={setPart.error.message} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** What's kept on this phone for church halls without data: what's saved and when, the data saver, clearing it. */
function OfflineDetails() {
  const styles = useStyles();
  const s = useSession();
  const queryClient = useQueryClient();
  const online = useOnline();
  const summary = useOfflineSummary();
  const [saver, setSaver] = useState(dataSaverOn);
  const [confirmClear, setConfirmClear] = useState(false);
  const signedIn = s.status === 'signedIn';
  const save = useMutation({ mutationFn: () => saveForOffline(queryClient, s.groups) });
  const clear = useMutation({
    mutationFn: async () => {
      await clearOfflineData();
      await clearSheets();
      forgetOfflineSummary();
      if (signedIn) await s.refresh();
    },
    onSuccess: () => setConfirmClear(false),
  });
  const chooseSaver = (on: boolean) => {
    setSaver(on);
    setDataSaver(on);
  };
  return (
    <>
      {signedIn ? (
        <>
          <Text style={styles.help}>
            {summary
              ? `${summary.songs} ${summary.songs === 1 ? 'song' : 'songs'}, ${summary.orders} ${summary.orders === 1 ? 'song order' : 'song orders'} for the next three weeks, ${summary.notices} ${summary.notices === 1 ? 'notice' : 'notices'} and ${summary.sheets} ${summary.sheets === 1 ? 'sheet' : 'sheets'}, so they open without data.`
              : 'Nothing saved yet. SolfaScores saves your coming services, their songs and your notices while you’re online.'}
            {summary?.sheetsWaiting ? ` ${summary.sheetsWaiting} ${summary.sheetsWaiting === 1 ? 'sheet waits' : 'sheets wait'} for Wi-Fi.` : ''}
          </Text>
          {save.error ? <ErrorText message={save.error.message} /> : null}
          <Button small kind="ghost" label={save.isPending ? 'Saving…' : 'Save now'} onPress={() => save.mutate()} disabled={!online} busy={save.isPending} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : null}
      <Text style={styles.subLabel}>Original sheets (PDFs and photos)</Text>
      <View style={styles.wrap}>
        <Chip label="On Wi-Fi only" on={saver} onPress={() => chooseSaver(true)} />
        <Chip label="On any connection" on={!saver} onPress={() => chooseSaver(false)} />
      </View>
      <Text style={styles.help}>
        {saver
          ? connectionKind() === 'unknown'
            ? 'Data saver is on. This browser can’t tell Wi-Fi from mobile data, so sheets are saved only when you choose any connection. Songs, orders and notices are small and always saved.'
            : 'Data saver is on: sheets are saved only on Wi-Fi. Songs, orders and notices are small and always saved.'
          : 'Sheets for your coming services are saved on any connection, which uses more data.'}
      </Text>
      {confirmClear ? (
        <>
          <Text style={styles.help}>Remove everything saved on this phone? You stay signed in; it saves again next time you’re online.</Text>
          <View style={styles.wrap}>
            <Button small kind="danger" label="Yes, clear it" onPress={() => clear.mutate()} busy={clear.isPending} />
            <Button small kind="ghost" label="Keep it" onPress={() => setConfirmClear(false)} />
          </View>
        </>
      ) : (
        <Button small kind="ghost" label="Clear saved data" onPress={() => setConfirmClear(true)} style={{ alignSelf: 'flex-start' }} />
      )}
      {clear.error ? <ErrorText message={clear.error.message} /> : null}
    </>
  );
}

/** Change your password with the current one; other phones are signed out. */
function Password({ onDone }: { onDone: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
      if (error) throw new Error(error.status === 400 || error.status === 401 ? 'That isn’t your current password.' : (error.message ?? 'Couldn’t change your password.'));
    },
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setAgain('');
    },
  });
  const problem = next && next.length < 8 ? 'Use at least 8 characters.' : again && again !== next ? 'The two new passwords don’t match.' : null;
  if (change.isSuccess) {
    return (
      <>
        <Text style={[styles.help, { color: colors.ok }]}>Password changed. Other phones signed in as you have been signed out.</Text>
        <Button small kind="ghost" label="Done" onPress={onDone} style={{ alignSelf: 'flex-start' }} />
      </>
    );
  }
  return (
    <>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="At least 8 characters." />
      <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" error={problem} />
      {change.error ? <ErrorText message={change.error.message} /> : null}
      <View style={styles.wrap}>
        <Button small label="Change password" onPress={() => change.mutate()} disabled={!current || next.length < 8 || next !== again} busy={change.isPending} />
        <Button small kind="ghost" label="Cancel" onPress={onDone} />
      </View>
    </>
  );
}

/** Light or dark for the whole app on this phone: following the phone's own setting unless chosen. */
function Appearance() {
  const styles = useStyles();
  const { choice, setChoice, scheme } = useTheme();
  return (
    <>
      <Text style={styles.help}>Dark is easier on the eyes at night and in a dim church. “Match phone” follows your phone’s own setting.</Text>
      <View style={styles.looks} accessibilityRole="radiogroup">
        {LOOK_CHOICES.map((c) => {
          const on = choice === c.value;
          return (
            <Pressable
              key={c.value}
              onPress={() => setChoice(c.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.value === 'system' ? `Match phone, now ${scheme}` : c.label}
              style={[styles.look, on && styles.lookOn]}
            >
              <LookPreview sides={c.value === 'system' ? [palettes.light, palettes.dark] : [palettes[c.value]]} />
              <Text style={[styles.lookLabel, on && styles.lookLabelOn]}>{c.label}</Text>
              {c.value === 'system' ? <Text style={styles.lookNote}>Now {scheme}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/** A tiny page in each palette given (two, side by side, for "Match phone"): a card, and a button in the main colour. */
function LookPreview({ sides }: { sides: Palette[] }) {
  const styles = useStyles();
  return (
    <View style={styles.preview}>
      {sides.map((p, i) => (
        <View key={i} style={[styles.previewSide, { backgroundColor: p.sand }]}>
          <View style={[styles.previewCard, { backgroundColor: p.card, borderColor: p.line }]}>
            <View style={[styles.previewLine, { backgroundColor: p.ink, width: '70%' }]} />
            <View style={[styles.previewLine, { backgroundColor: p.accent, width: '45%' }]} />
          </View>
          <View style={[styles.previewButton, { backgroundColor: p.primary }]} />
        </View>
      ))}
    </View>
  );
}

/**
 * The player's sound (owner's request, 21 November 2026): the synth, or a recorded piano, strings or choir, each
 * downloaded once when chosen and kept on the phone. Every player follows it from its next note.
 */
function SoundChoices({ chosen }: { chosen: Instrument }) {
  const styles = useStyles();
  const state = useSoundState(chosen);
  const name = INSTRUMENTS.find((i) => i.name === chosen)?.label.toLowerCase();
  const status =
    chosen === 'synth'
      ? null
      : state === 'loading'
        ? `Downloading the ${name}…`
        : state === 'ready'
          ? `The ${name} is kept on this phone, so it plays without data.`
          : state === 'failed'
            ? `The ${name} couldn’t download. Songs play with the synth until it can.`
            : `The ${name} downloads when a song plays, then stays on this phone.`;
  return (
    <>
      <Text style={styles.help}>What the songs play with. A recorded sound downloads once and is kept on this phone.</Text>
      <View style={styles.sounds} accessibilityRole="radiogroup">
        {INSTRUMENTS.map((i) => {
          const on = chosen === i.name;
          const note = i.bytes ? `${sizeText(i.bytes)}, downloads once` : 'Built in, no download';
          return (
            <Pressable
              key={i.name}
              onPress={() => chooseSound(i.name)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${i.label}, ${note}`}
              style={({ pressed }) => [styles.sound, on && styles.soundOn, pressed && styles.rowPressed]}
            >
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              <Text style={[styles.soundName, on && styles.soundNameOn]}>{i.label}</Text>
              <Text style={styles.soundNote} numberOfLines={1}>
                {note}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {status ? <Text style={styles.help}>{status}</Text> : null}
    </>
  );
}

function About() {
  const styles = useStyles();
  const version = Constants.expoConfig?.version;
  return (
    <View style={styles.about}>
      <Text style={styles.aboutName}>SolfaScores{version ? ` · Version ${version}` : ''}</Text>
      <Text style={styles.aboutText}>Learn your part in tonic sol-fa, and keep your choir together.</Text>
      <Text style={styles.aboutText}>Your practice is private to you. Leaders see only totals for each part.</Text>
      {/* The recorded sounds' credits, as their licences ask (public/sounds/LICENSES.txt has them in full). */}
      <Text style={styles.aboutText}>
        Sounds: Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/),
        https://archive.org/details/SalamanderGrandPianoV3. Trimmed, converted to mono and re-encoded. Choir: Fluid (R3)
        SoundFont, Copyright (c) 2000-2002, 2008 Frank Wen, MIT licence. Strings: public domain recordings. The licences
        in full: solfascores.com/sounds/LICENSES.txt
      </Text>
    </View>
  );
}

const ICON = 34;

const useStyles = makeStyles((colors) => ({
  // The header, centred, as profile pages are.
  header: { alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 4 },
  ring: { padding: 3, borderRadius: 50, borderWidth: 2.5, borderColor: colors.line, marginBottom: 6 },
  photoBusy: { position: 'absolute', top: 3, left: 3, width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink, borderWidth: 3, borderColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  pencilSpace: { width: 30 },
  pencil: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  nameEdit: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', paddingHorizontal: 8 },
  nameInput: { flex: 1, minWidth: 0, fontFamily: fonts.heavy, fontSize: 21, color: colors.ink, textAlign: 'center', paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: colors.primary, outlineStyle: 'none' } as object,
  nameSave: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  nameCancel: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  guest: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  name: { flexShrink: 1, fontFamily: fonts.heavy, fontSize: 24, lineHeight: 29, color: colors.ink, textAlign: 'center' },
  email: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted, textAlign: 'center', paddingHorizontal: 12 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.board, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 260 },
  factDot: { width: 8, height: 8, borderRadius: 4 },
  factText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  headerButton: { marginTop: 8, minWidth: 160, alignSelf: 'center' },
  editName: { alignSelf: 'stretch', gap: 10 },

  // Practice: three numbers in a row, divided by hairlines.
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLine: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line },
  statValue: { fontFamily: fonts.heavy, fontSize: 26, lineHeight: 31, color: colors.ink },
  statLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted, textAlign: 'center' },
  statNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: -6, paddingHorizontal: 8 },

  // Lists of rows.
  section: { gap: 8, marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontFamily: fonts.heavy, fontSize: 18, color: colors.ink },
  sectionAction: { fontFamily: fonts.bold, fontSize: 14, color: colors.link },
  list: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  plain: { gap: 8 },
  rowWrap: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 10 },
  rowPressed: { backgroundColor: colors.board },
  rowIcon: { width: ICON, height: ICON, borderRadius: ICON / 2, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink },
  rowValue: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: 'right' },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  rowBody: { gap: 10, paddingHorizontal: 14, paddingBottom: 16, paddingLeft: 14 + ICON + 12 },
  help: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  subLabel: { fontFamily: fonts.heavy, fontSize: 13, color: colors.ink, marginTop: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // A group: its badge, name and what you are there; the part pill.
  groupMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupBadge: { width: ICON, height: ICON, borderRadius: 10, backgroundColor: colors.board, alignItems: 'center', justifyContent: 'center' },
  groupBadgeOn: { backgroundColor: colors.ink },
  groupInitial: { fontFamily: fonts.heavy, fontSize: 16, color: colors.ink },
  groupAbout: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
  showing: { fontFamily: fonts.bold, color: colors.ok },
  partPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 11, paddingVertical: 6 },
  partPillText: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },

  // Appearance's three choices, each a tiny page.
  looks: { flexDirection: 'row', gap: 8 },
  look: { flex: 1, minWidth: 0, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 8, gap: 6, alignItems: 'center' },
  lookOn: { borderColor: colors.ink, borderWidth: 2, padding: 7.5 },
  lookLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, textAlign: 'center' },
  lookLabelOn: { fontFamily: fonts.heavy, color: colors.ink },
  lookNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, marginTop: -4 },
  preview: { flexDirection: 'row', alignSelf: 'stretch', height: 58, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  previewSide: { flex: 1, padding: 6, gap: 5 },
  previewCard: { flex: 1, borderRadius: 5, borderWidth: 1, padding: 5, gap: 4 },
  previewLine: { height: 4, borderRadius: 2 },
  previewButton: { height: 8, borderRadius: 3, width: '60%' },

  // The sound's choices: a radio button, the name and what it downloads, a row each.
  sounds: { gap: 6 },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10 },
  soundOn: { borderColor: colors.ink, borderWidth: 2, paddingHorizontal: 11.5, paddingVertical: 9.5 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  soundName: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink },
  soundNameOn: { fontFamily: fonts.heavy },
  soundNote: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'right' },

  about: { alignItems: 'center', gap: 4, paddingVertical: 14 },
  aboutName: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  aboutText: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.muted, textAlign: 'center', paddingHorizontal: 16 },
}));
