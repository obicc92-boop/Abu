/**
 * Home, laid out as a music app's (colleagues' request, 25 November 2026, from Audiomack's screens: "very animated
 * and dynamic… like Audiomack, Spotify, Apple Music"): chips of the kinds of song along the top; cards that swipe
 * across (the next service with your reply, the next rehearsal, a song people are playing), with a glow at the top in
 * the colour of the card in front; then what's happening for your group (the leader's To do, the songs to learn for
 * the services coming up, notices), and the library as music apps show theirs: your songs and new ones on cards of
 * four, trending songs ranked, collections, new songs and composers (src/components/discover.tsx, from GET
 * /api/home). A chip shows only that kind of song. Signed out, the same feed under a welcome card.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import {
  api,
  coverUrl,
  type EventDetails,
  type GroupEvent,
  type GroupType,
  type HomeFeed,
  type HomeSong,
  type MyGroup,
  type OrderItem,
  type Practice,
  type Reply,
  type Song,
} from '@/api/client';
import { BottomSheet, SheetRow } from '@/components/bottom-sheet';
import { BrandMark, MainFill, Motif } from '@/components/brand';
import { CheckedIn, CheckIn } from '@/components/check-in';
import { CoverArt, coverGlow } from '@/components/cover-art';
import {
  AmbientGlow,
  Carousel,
  ComposerRow,
  CollectionGrid,
  CoverGrid,
  FeedSkeleton,
  GenreChips,
  ListCards,
  RankedColumns,
  SectionHead,
  useQuickPlay,
} from '@/components/discover';
import { EventCard } from '@/components/event-card';
import { InstallHint } from '@/components/install-hint';
import { InviteCard } from '@/components/invite';
import { NoticesSection } from '@/components/notices';
import { Readiness } from '@/components/readiness';
import { ReplyButtons } from '@/components/reply-buttons';
import { Appear } from '@/components/motion';
import { Shelf, SongTile, type TileSong } from '@/components/shelf';
import { LeaderTodo } from '@/components/todo';
import { Avatar, Body, Button, Card, ErrorText, Kicker, Loading, Page, PartTag } from '@/components/ui';
import { DEMO_SONGS } from '@/data/demo-songs';
import { useCoverColour } from '@/lib/cover-colour';
import { openLibrary } from '@/lib/open-library';
import { checkInOpen, countdownText, fmtDate, fmtTime, hasStarted, isOver, relDay, startOfDay } from '@/lib/dates';
import { kindLabel, kindNoun } from '@/lib/group-types';
import { KEY_NAMES, partName } from '@/solfa';
import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * The group's next service (or setlist) and next rehearsal, each with its
 * details (your reply and its songs).
 */
function useUpcoming(g: MyGroup | null) {
  const active = !!g && g.status === 'active';
  const from = startOfDay(new Date()).toISOString();
  const events = useQuery({ queryKey: ['events', g?.id, 'from', from], queryFn: () => api.events(g!.id, { from }), enabled: active });
  const soon = (events.data ?? []).filter((e) => !isOver(e.starts_at));
  const service = soon.find((e) => e.kind !== 'rehearsal');
  const rehearsal = soon.find((e) => e.kind === 'rehearsal');
  const serviceDetails = useQuery({ queryKey: ['event', service?.id], queryFn: () => api.event(service!.id), enabled: !!service });
  const rehearsalDetails = useQuery({ queryKey: ['event', rehearsal?.id], queryFn: () => api.event(rehearsal!.id), enabled: !!rehearsal });
  // Happening now (check-in is open): for checking in, or for leaders to mark attendance.
  const live = g?.type !== 'personal' ? (events.data ?? []).find((e) => checkInOpen(e.starts_at)) : undefined;
  const liveDetails = useQuery({ queryKey: ['event', live?.id], queryFn: () => api.event(live!.id), enabled: !!live });
  return {
    loading: active && events.isPending,
    service,
    rehearsal,
    serviceDetails: serviceDetails.data,
    rehearsalDetails: rehearsalDetails.data,
    live,
    liveDetails: liveDetails.data,
  };
}

/** Home's feed of songs (only those you can see), of every kind or of one chip's; kept while another loads. */
function useHomeFeed(genre: string | null) {
  const s = useSession();
  const viewer = s.status === 'signedIn' ? (s.profile?.id ?? 'me') : 'out';
  return useQuery({ queryKey: ['home', viewer, genre], queryFn: () => api.home(genre), placeholderData: keepPreviousData });
}

/** The glow colour for a song: its picture's own, or its drawn cover's. */
function useSongGlow(song: HomeSong | undefined): string | null {
  const picture = useCoverColour(coverUrl(song?.cover_key));
  return song ? (picture ?? coverGlow(song.id)) : null;
}

/** The song to feature: the most played lately, or the newest. */
function featuredOf(feed: HomeFeed | undefined): { song: HomeSong; kicker: string } | null {
  const hot = feed?.trending[0];
  if (hot && hot.plays > 0) return { song: hot, kicker: 'Popular now' };
  const fresh = feed?.newest[0] ?? hot;
  return fresh ? { song: fresh, kicker: 'New to listen to' } : null;
}

interface Slide {
  key: string;
  glow: string;
  node: ReactNode;
}

export default function Home() {
  const styles = useStyles();
  const colors = useColors();
  const s = useSession();
  const upcoming = useUpcoming(s.status === 'signedIn' ? s.group : null);
  const practice = useQuery({ queryKey: ['myPractice'], queryFn: api.myPractice, enabled: s.status === 'signedIn' });
  const choir = s.status === 'signedIn' && s.group && s.group.type !== 'personal' && s.group.status === 'active' ? s.group : null;
  const attendance = useQuery({ queryKey: ['myAttendance', choir?.id], queryFn: () => api.myAttendance(choir!.id), enabled: !!choir });
  const [genre, setGenre] = useState<string | null>(null);
  const feed = useHomeFeed(genre);
  const featured = featuredOf(feed.data);
  const featuredGlow = useSongGlow(featured?.song);
  const [slide, setSlide] = useState(0);
  const [switching, setSwitching] = useState(false);

  if (s.status !== 'signedIn') return <LookingAround />;
  if (s.loadingMe || !s.group || !s.profile) return <Loading />;

  const g = s.group;
  // Songs for the next service and rehearsal, soonest first, each song once.
  const seen = new Set<string>();
  const toLearn = [upcoming.serviceDetails, upcoming.rehearsalDetails]
    .filter((d): d is EventDetails => !!d)
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at))
    .map((d) => ({
      event: d.event,
      items: d.items.filter((i) => !seen.has(i.song_id) && !!seen.add(i.song_id)),
    }))
    .filter((x) => x.items.length);
  const firstName = s.profile.display_name.split(' ')[0] || 'there';
  const choirs = s.groups.filter((x) => x.type !== 'personal');
  const leaderish = !!choir && (choir.role === 'leader' || choir.role === 'part_leader');

  // The cards that swipe across at the top: your group's next things, then a song to listen to.
  const slides: Slide[] = [];
  if (g.status === 'pending') {
    slides.push({
      key: 'waiting',
      glow: colors.heroGlow,
      node: (
        <Card style={styles.fill}>
          <Kicker color={colors.accent}>Waiting to be let in</Kicker>
          <Text style={styles.cardTitle}>{g.name}</Text>
          <Body>The leader lets new members in. You’ll see the group’s songs and services here as soon as they do.</Body>
        </Card>
      ),
    });
  } else if (g.type === 'personal') {
    slides.push({
      key: 'space',
      glow: colors.heroGlow,
      node: (
        <Card tone="hero" style={styles.fill}>
          <Motif color={colors.onHero} opacity={0.12} fade glow={colors.heroGlow} glow2={colors.heroGlow2} />
          <Kicker color={colors.heroKicker}>{choirs.length ? 'Your own space' : 'Sing with a group?'}</Kicker>
          <Text style={[styles.cardTitle, { color: colors.onHero }]}>{choirs.length ? 'Your songs and setlists' : 'Join your choir or band'}</Text>
          <Text style={styles.onHero}>
            {choirs.length
              ? 'Save songs here and make personal setlists for weddings, concerts and services.'
              : 'Got a code from a choir or band? Join it here. You keep your own songs and setlists.'}
          </Text>
          <View style={styles.row}>
            <Button kind="light" small label="Join a group" onPress={() => router.push('/join')} />
            <Button kind="outlineLight" small label="Start a group" onPress={() => router.push('/create-group')} />
          </View>
        </Card>
      ),
    });
  } else {
    slides.push({
      key: 'service',
      glow: colors.heroGlow,
      node: upcoming.service ? (
        <NextService
          group={g}
          event={upcoming.service}
          myReply={upcoming.serviceDetails?.my_reply ?? null}
          songs={upcoming.serviceDetails?.items.length}
          canEditOrder={!!upcoming.serviceDetails?.can_edit_order}
        />
      ) : (
        <Card tone="hero" style={styles.fill}>
          <Motif color={colors.onHero} opacity={0.12} fade glow={colors.heroGlow} glow2={colors.heroGlow2} />
          <Kicker color={colors.heroKicker}>Next {kindNoun(g.type, 'service')}</Kicker>
          <Text style={[styles.cardTitle, { color: colors.onHero }]}>{upcoming.loading ? 'Loading…' : 'Nothing planned yet'}</Text>
          {!upcoming.loading ? (
            <Text style={styles.onHero}>
              {g.role === 'leader' ? 'Plan the next service and build its song order by section.' : 'Your services and rehearsals will show here, with their song orders.'}
            </Text>
          ) : null}
          {g.role === 'leader' && !upcoming.loading ? (
            <View style={styles.row}>
              <Button kind="light" small label={`Plan a ${kindNoun(g.type, 'service')}`} onPress={() => router.push('/event-editor')} />
            </View>
          ) : null}
        </Card>
      ),
    });
    if (upcoming.rehearsal) {
      slides.push({ key: 'rehearsal', glow: colors.heroGlow2, node: <RehearsalSlide event={upcoming.rehearsal} rate={attendance.data?.rate ?? null} /> });
    }
  }
  if (featured && featuredGlow) slides.push({ key: 'featured', glow: featuredGlow, node: <FeaturedSong song={featured.song} kicker={featured.kicker} /> });
  const glow = genre ? (featuredGlow ?? colors.heroGlow) : (slides[Math.min(slide, slides.length - 1)]?.glow ?? colors.heroGlow);

  return (
    <Page>
      <AmbientGlow colour={glow} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>
            {greeting()}, {firstName}
          </Text>
          {/* With more than one group, the group's name opens the list to switch. */}
          <Pressable
            onPress={() => setSwitching(true)}
            disabled={s.groups.length < 2}
            accessibilityRole={s.groups.length > 1 ? 'button' : undefined}
            accessibilityLabel={s.groups.length > 1 ? 'Switch group' : undefined}
            style={styles.groupLineBox}
          >
            <Text style={styles.groupLine} numberOfLines={1}>
              {g.type === 'personal' ? 'My space' : g.name}
              {g.part ? ' · ' : ''}
              <PartTag part={g.part} />
              {s.groups.length > 1 ? <Text style={styles.switchMark}> ▾</Text> : null}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/me')} accessibilityRole="button" accessibilityLabel="Your profile">
          <Avatar name={s.profile.display_name} part={g.part} size={42} photo={s.profile.avatar_key} />
        </Pressable>
      </View>

      {feed.data?.tags.length ? <GenreChips tags={feed.data.tags} value={genre} onChange={setGenre} /> : null}

      {genre ? (
        feed.data ? (
          <GenreFeed feed={feed.data} genre={genre} />
        ) : (
          <FeedSkeleton />
        )
      ) : (
        <>
          {choir && upcoming.live && upcoming.liveDetails ? <HappeningNow group={choir} event={upcoming.live} details={upcoming.liveDetails} /> : null}

          <InstallHint />

          <Appear>
            <Carousel peek={26} auto={7000} onIndex={setSlide}>
              {slides.map((x) => (
                <View key={x.key} style={styles.fill}>
                  {x.node}
                </View>
              ))}
            </Carousel>
          </Appear>

          {leaderish ? <LeaderTodo group={choir!} /> : null}

          {g.type === 'personal' && upcoming.service ? (
            <>
              <Kicker>Your next setlist</Kicker>
              <EventCard event={upcoming.service} groupType={g.type} />
            </>
          ) : null}

          {toLearn.length ? <LearnForUpcoming groups={toLearn} practice={practice.data} part={g.part} type={g.type} feed={feed.data} /> : null}

          {feed.data ? (
            <Appear delay={80}>
              <ListCards
                cards={[
                  { title: 'Back to your songs', songs: feed.data.recent },
                  { title: 'Find something new', songs: feed.data.discover, onMore: () => openLibrary() },
                ]}
              />
            </Appear>
          ) : null}

          {choir ? <NoticesSection group={choir} me={s.profile.id} forMe limit={3} /> : null}

          {feed.data ? <Library feed={feed.data} /> : feed.isPending ? <FeedSkeleton /> : null}

          {g.type !== 'personal' && leaderish && upcoming.service && upcoming.serviceDetails?.items.length ? (
            <Readiness eventId={upcoming.service.id} title={`Ready for ${upcoming.service.title}?`} />
          ) : null}

          {g.type !== 'personal' && g.status === 'active' && g.role === 'leader' && g.invite_code ? <InviteCard groupName={g.name} code={g.invite_code} /> : null}

          {/* No feed (offline the first time, say): the songs built into the app still play. */}
          {!feed.data && feed.isError && !toLearn.length ? <TrySongs /> : null}
        </>
      )}

      <BottomSheet open={switching} onClose={() => setSwitching(false)} title="Your groups" subtitle="Home, Songs and Schedule follow the group you choose.">
        {s.groups.map((x, i) => (
          <SheetRow
            key={x.id}
            index={i}
            icon={<Avatar name={x.type === 'personal' ? 'Me' : x.name} part={x.part} size={40} />}
            wash={colors.board}
            title={x.type === 'personal' ? 'My space' : x.name}
            sub={[x.id === g.id ? 'You’re looking at it' : null, x.part ? partName(x.part) : null, x.status === 'pending' ? 'Waiting to be let in' : null].filter(Boolean).join(' · ') || undefined}
            chevron={x.id !== g.id}
            onPress={() => {
              s.setGroup(x.id);
              setSwitching(false);
            }}
          />
        ))}
      </BottomSheet>
    </Page>
  );
}

/** The library, as a music app shows its own: trending, collections, new songs, composers. */
function Library({ feed }: { feed: HomeFeed }) {
  const openTag = (tag: string) => openLibrary({ tag });
  return (
    <>
      {feed.trending.length >= 3 ? (
        <Appear delay={120} style={styles_.section}>
          <SectionHead title="Trending songs" note="What choirs are playing lately" onMore={() => openLibrary()} />
          <RankedColumns songs={feed.trending} plays />
        </Appear>
      ) : null}
      {feed.collections.length >= 2 ? (
        <Appear delay={160} style={styles_.section}>
          <SectionHead title="Collections" note="Songs gathered by when and how they’re sung" />
          <CollectionGrid items={feed.collections.slice(0, 4)} onOpen={openTag} />
        </Appear>
      ) : null}
      {feed.newest.length >= 2 ? (
        <Shelf title="New songs" note="Just added to SolfaScores" onSeeAll={() => openLibrary()}>
          {feed.newest.map((x) => (
            <SongTile key={x.id} song={tileOf(x)} />
          ))}
        </Shelf>
      ) : null}
      {feed.composers.length >= 3 ? (
        <View style={styles_.section}>
          <SectionHead title="Composers" note="Their songs, all together" />
          <ComposerRow items={feed.composers} onOpen={(name) => openLibrary({ query: name })} />
        </View>
      ) : null}
    </>
  );
}

/** One chip's songs: its most played, its newest, its composers, and all of them in Songs. */
function GenreFeed({ feed, genre }: { feed: HomeFeed; genre: string }) {
  const featured = featuredOf(feed);
  return (
    <>
      {featured ? (
        <Appear>
          <FeaturedSong song={featured.song} kicker={`${genre} · ${featured.kicker}`} />
        </Appear>
      ) : null}
      {feed.trending.length ? (
        <Appear delay={60} style={styles_.section}>
          <SectionHead title={`Top ${genre} songs`} onMore={() => openLibrary({ tag: genre })} />
          <RankedColumns songs={feed.trending} plays />
        </Appear>
      ) : null}
      {feed.newest.length >= 2 ? (
        <Appear delay={120} style={styles_.section}>
          <SectionHead title={`New ${genre} songs`} />
          <CoverGrid songs={feed.newest.slice(0, 4)} />
        </Appear>
      ) : null}
      {feed.composers.length >= 2 ? (
        <View style={styles_.section}>
          <SectionHead title="Composers" />
          <ComposerRow items={feed.composers} onOpen={(name) => openLibrary({ query: name })} />
        </View>
      ) : null}
      <Button kind="ghost" label={`Every ${genre} song`} onPress={() => openLibrary({ tag: genre })} />
    </>
  );
}

/** A song from the feed as a shelf's tile. */
const tileOf = (x: HomeSong): TileSong => ({
  id: x.id,
  title: x.title,
  composer: x.composer,
  sub: x.composer || (x.solfa.trim() ? `Doh is ${KEY_NAMES[x.doh]}` : 'Sheet only'),
  doh: x.doh,
  time: x.time_signature,
  solfa: x.solfa,
  countable: true,
  cover: x.cover_key,
});

const styles_ = { section: { gap: 12 } } as const;

/** A song to listen to, on a feature card: its cover floating at the side, Play and Open. */
function FeaturedSong({ song, kicker }: { song: HomeSong; kicker: string }) {
  const styles = useStyles();
  const colors = useColors();
  const q = useQuickPlay();
  const state = q.state(song.id);
  return (
    <Card tone="hero" style={styles.fill}>
      <Motif color={colors.onHero} opacity={0.1} fade glow={coverGlow(song.id)} glow2={colors.heroGlow2} />
      <View style={styles.featured}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Kicker color={colors.heroKicker}>{kicker}</Kicker>
          <Text style={[styles.featuredTitle, { color: colors.onHero }]} numberOfLines={3}>
            {song.title}
          </Text>
          {song.composer ? (
            <Text style={styles.onHero} numberOfLines={1}>
              {song.composer}
            </Text>
          ) : null}
        </View>
        <Floating>
          <CoverArt song={{ id: song.id, title: song.title, cover: song.cover_key, solfa: song.solfa }} size={108} radius={16} title={false} playing={state === 'playing'} paused={state === 'paused'} />
        </Floating>
      </View>
      <View style={styles.row}>
        <Button kind="light" small label={state === 'playing' ? 'Pause' : state === 'paused' ? 'Carry on' : 'Play'} onPress={() => q.toggle(song)} />
        <Button kind="outlineLight" small label="Open" onPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })} />
      </View>
    </Card>
  );
}

/** Floats gently up and down, tilted a little, as a record cover on a stand. */
function Floating({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const reduce = useReducedMotion();
  const a = useSharedValue(0);
  useEffect(() => {
    if (!reduce) a.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [a, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * a.get() }, { rotate: `${-4 + 2 * a.get()}deg` }] }));
  return <Animated.View style={[styles.floating, style]}>{children}</Animated.View>;
}

/** The next rehearsal, on a feature card: when and where, and your attendance. */
function RehearsalSlide({ event, rate }: { event: GroupEvent; rate: number | null }) {
  const styles = useStyles();
  const colors = useColors();
  const when = relDay(event.starts_at);
  const open = () => router.push({ pathname: '/event/[id]', params: { id: event.id } });
  return (
    <Card tone="hero" style={styles.fill}>
      <Motif color={colors.onHero} opacity={0.12} fade glow={colors.heroGlow2} glow2={colors.heroGlow} />
      <Kicker color={colors.heroKicker}>Next rehearsal{when ? ` · ${when}` : ''}</Kicker>
      <Pressable onPress={open} accessibilityRole="link">
        <Text style={[styles.cardTitle, { color: colors.onHero }]}>{event.title}</Text>
        <Text style={styles.onHero}>{[fmtDate(event.starts_at), fmtTime(event.starts_at), event.venue].filter(Boolean).join(' · ')}</Text>
        {countdownText(event.starts_at) ? <Text style={styles.countdown}>{countdownText(event.starts_at)}</Text> : null}
      </Pressable>
      {rate != null ? (
        <Text style={styles.onHero}>
          Your attendance <Text style={{ fontFamily: fonts.heavy, color: colors.onHero }}>{rate}%</Text>
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button kind="light" small label="Details" onPress={open} />
      </View>
    </Card>
  );
}

/**
 * Happening now (from 3 hours before the start to 6 hours after): members
 * check in with the code; leaders and part leaders mark attendance or show the code.
 */
function HappeningNow({ group, event, details }: { group: MyGroup; event: GroupEvent; details: EventDetails }) {
  const styles = useStyles();
  const colors = useColors();
  const leaderish = details.my_role === 'leader' || details.my_role === 'part_leader';
  if (!leaderish) {
    if (!details.self_check_in) return null;
    return details.my_attendance === 'present' ? <CheckedIn /> : <CheckIn eventId={event.id} />;
  }
  return (
    <Card>
      <Kicker color={colors.accent}>
        {kindLabel(group.type, event.kind)} {hasStarted(event.starts_at) ? 'now' : `at ${fmtTime(event.starts_at)}`}
      </Kicker>
      <Text style={styles.cardTitle}>{event.title}</Text>
      <View style={styles.row}>
        <Button small label="Mark attendance" onPress={() => router.push({ pathname: '/event/[id]/attendance', params: { id: event.id } })} />
        {details.self_check_in ? (
          <Button small kind="ghost" label="Show the check-in code" onPress={() => router.push({ pathname: '/event/[id]/code', params: { id: event.id } })} />
        ) : null}
      </View>
    </Card>
  );
}

/** The red card: the next service, when and where, and your reply. */
function NextService({
  group,
  event,
  myReply,
  songs,
  canEditOrder,
}: {
  group: MyGroup;
  event: GroupEvent;
  myReply: Reply | null;
  songs?: number;
  canEditOrder: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (status: Reply) => api.reply(event.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event', event.id] }),
  });
  const mine = send.isPending ? (send.variables ?? null) : myReply;
  const personal = group.type === 'personal';
  const when = relDay(event.starts_at);
  const countdown = countdownText(event.starts_at);
  const open = () => router.push({ pathname: '/event/[id]', params: { id: event.id } });
  return (
    <Card tone="hero" style={styles.fill}>
      <Motif color={colors.onHero} opacity={0.12} fade glow={colors.heroGlow} glow2={colors.heroGlow2} />
      <Kicker color={colors.heroKicker}>
        Next {kindNoun(group.type, event.kind)}
        {when ? ` · ${when}` : ''}
      </Kicker>
      <Pressable onPress={open} accessibilityRole="link">
        <Text style={[styles.cardTitle, { color: colors.onHero }]}>{event.title}</Text>
        <Text style={styles.onHero}>{[fmtDate(event.starts_at), fmtTime(event.starts_at), event.venue].filter(Boolean).join(' · ')}</Text>
        {countdown ? <Text style={styles.countdown}>{countdown}</Text> : null}
      </Pressable>
      {!personal ? <ReplyButtons light value={mine} onChange={(v) => send.mutate(v)} /> : null}
      {send.error ? <ErrorText message={send.error.message} /> : null}
      <View style={styles.row}>
        <Button
          kind="light"
          small
          label={songs === 0 ? (canEditOrder ? 'Add songs' : 'No songs yet') : songs === undefined ? 'Song order' : `Song order · ${songs} ${songs === 1 ? 'song' : 'songs'}`}
          onPress={() => (songs === 0 && canEditOrder ? router.push({ pathname: '/event/[id]/order', params: { id: event.id } }) : open())}
        />
        {songs ? <Button kind="outlineLight" small label="Perform" onPress={() => router.push({ pathname: '/event/[id]/perform', params: { id: event.id, i: '0' } })} /> : null}
      </View>
    </Card>
  );
}

/** Songs coming up, by service, with how far along you are on each (your own practice, seen only by you). */
function LearnForUpcoming({
  groups,
  practice,
  part,
  type,
  feed,
}: {
  groups: { event: GroupEvent; items: OrderItem[] }[];
  practice?: Practice[];
  part: string | null;
  type: GroupType;
  /** Home's feed: a song not kept on the phone yet takes its sol-fa and cover from there. */
  feed?: HomeFeed;
}) {
  const queryClient = useQueryClient();
  const bySong = new Map((practice ?? []).map((p) => [p.song_id, p]));
  const inFeed = new Map(feed ? [...feed.trending, ...feed.newest, ...feed.recent, ...feed.discover].map((x) => [x.id, x]) : []);
  // The songs themselves are kept on the phone for the services coming up (src/lib/keep-offline.ts): their
  // sol-fa draws each tile and lets it play, and their covers show.
  const kept = (id: string): Pick<Song, 'solfa' | 'cover_key'> | undefined => queryClient.getQueryData<Song>(['song', id]) ?? inFeed.get(id);
  return (
    <>
      {groups.map(({ event, items }) => {
        const known = items.filter((i) => bySong.get(i.song_id)?.knows_part).length;
        return (
          <Shelf
            key={event.id}
            title={`Learn for ${event.title || kindLabel(type, event.kind)}`}
            note={[fmtDate(event.starts_at), `${known} of ${items.length} known`, part ? partName(part) : null].filter(Boolean).join(' · ')}
          >
            {items.slice(0, 12).map((item) => {
              const p = bySong.get(item.song_id);
              return (
                <SongTile
                  key={item.song_id}
                  song={{
                    id: item.song_id,
                    title: item.title,
                    composer: item.composer,
                    doh: item.doh,
                    time: item.time_signature,
                    solfa: item.playable ? kept(item.song_id)?.solfa : undefined,
                    countable: true,
                    cover: kept(item.song_id)?.cover_key,
                    playable: item.playable,
                    sub: p?.knows_part ? 'You know your part' : p?.plays ? `${p.plays} ${p.plays === 1 ? 'play' : 'plays'}` : item.playable ? 'New to you' : 'Sheet only',
                  }}
                  badge={p?.knows_part ? 'known' : undefined}
                />
              );
            })}
          </Shelf>
        );
      })}
    </>
  );
}

/** Songs to try, built in so they play with no connection. */
function TrySongs() {
  return (
    <Shelf title="Try a song">
      {DEMO_SONGS.map((d) => (
        <SongTile key={d.id} song={{ id: d.id, title: d.title, composer: d.composer, sub: d.composer, doh: d.key, time: d.time, solfa: d.solfa, countable: true }} />
      ))}
    </Shelf>
  );
}

/** Home for someone browsing without an account: a welcome card, then the same feed of everyone's songs. */
function LookingAround() {
  const styles = useStyles();
  const colors = useColors();
  const s = useSession();
  const [genre, setGenre] = useState<string | null>(null);
  const feed = useHomeFeed(genre);
  const featured = featuredOf(feed.data);
  const featuredGlow = useSongGlow(featured?.song);
  const [slide, setSlide] = useState(0);
  const join = () => {
    s.setLookingAround(false);
    router.replace('/welcome');
  };
  const slides: Slide[] = [
    {
      key: 'welcome',
      glow: colors.heroGlow,
      node: (
        <Card tone="hero" style={[styles.fill, { alignItems: 'flex-start' }]}>
          <Motif color={colors.onHero} opacity={0.12} fade glow={colors.heroGlow} glow2={colors.heroGlow2} />
          <BrandMark size={72} />
          <Text style={[styles.cardTitle, { color: colors.onHero, marginTop: 4 }]}>Welcome to SolfaScores</Text>
          <Text style={styles.onHero}>Listen to any song’s parts now. Create an account to join your choir, save songs and see your song orders.</Text>
          <Button kind="light" small label="Create an account or sign in" onPress={join} />
        </Card>
      ),
    },
  ];
  if (featured && featuredGlow) slides.push({ key: 'featured', glow: featuredGlow, node: <FeaturedSong song={featured.song} kicker={featured.kicker} /> });
  const glow = genre ? (featuredGlow ?? colors.heroGlow) : (slides[Math.min(slide, slides.length - 1)]?.glow ?? colors.heroGlow);
  return (
    <Page>
      <AmbientGlow colour={glow} />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          {/* The app's icon, small: the mark on the main colour's gradient, readable on white and black alike. */}
          <View style={styles.appIcon}>
            <MainFill from={colors.primary} to={colors.primary2} />
            <BrandMark size={24} />
          </View>
          <Text style={styles.brandName}>SolfaScores</Text>
        </View>
        <Button small label="Sign in" onPress={join} />
      </View>
      {feed.data?.tags.length ? <GenreChips tags={feed.data.tags} value={genre} onChange={setGenre} /> : null}
      {genre && feed.data ? (
        <GenreFeed feed={feed.data} genre={genre} />
      ) : (
        <>
          <Appear>
            <Carousel peek={26} auto={7000} onIndex={setSlide}>
              {slides.map((x) => (
                <View key={x.key} style={styles.fill}>
                  {x.node}
                </View>
              ))}
            </Carousel>
          </Appear>
          {feed.data ? (
            <>
              <Appear delay={80}>
                <ListCards cards={[{ title: 'Find something new', songs: feed.data.discover, onMore: () => openLibrary() }]} />
              </Appear>
              <Library feed={feed.data} />
            </>
          ) : feed.isPending ? (
            <FeedSkeleton />
          ) : (
            <TrySongs />
          )}
        </>
      )}
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { fontFamily: fonts.heavy, fontSize: 22, color: colors.ink },
  groupLineBox: { alignSelf: 'flex-start', marginTop: 2 },
  groupLine: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  switchMark: { fontFamily: fonts.bold, color: colors.ink },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIcon: { width: 38, height: 38, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  // A carousel's card fills its page, so the cards are all as tall as the tallest.
  fill: { flex: 1 },
  cardTitle: { fontFamily: fonts.heavy, fontSize: 20, color: colors.ink },
  onHero: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: colors.onHeroSoft },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  countdown: { fontFamily: fonts.heavy, fontSize: 14, color: colors.onHero, marginTop: 2 },
  featured: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featuredTitle: { fontFamily: fonts.display, fontSize: 25, lineHeight: 30 },
  floating: { borderRadius: 16, boxShadow: '0 14px 30px rgba(0,0,0,0.45)', marginRight: 4 } as object,
}));
