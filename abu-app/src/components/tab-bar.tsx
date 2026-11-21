/**
 * The tabs' bar, as on Suno (owner's request, 21 November 2026, from Suno's screens): the tab you're on has its
 * icon in a pill, and in the middle a round gradient "+" (Suno's Create button) opens Add a song. The names stay
 * small under the icons, for choir members finding their way on a cheap phone. The song playing sits over them
 * (`MiniPlayer`).
 */
import { router, type Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useSession } from '@/state/session';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { MainFill } from './brand';
import { PlusIcon } from './icons';
import { MiniPlayer } from './mini-player';

type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BarProps) {
  const styles = useStyles();
  const colors = useColors();
  const { status } = useSession();
  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const focused = index === state.index;
    const label = typeof options.title === 'string' ? options.title : route.name;
    const press = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    return (
      <Pressable
        key={route.key}
        onPress={press}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        style={styles.tab}
        hitSlop={4}
      >
        <View style={[styles.pill, focused && styles.pillOn]}>{options.tabBarIcon?.({ focused, color: focused ? colors.onInk : colors.muted, size: 22 })}</View>
        <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  });
  // Adding a song needs an account; someone looking around gets the five tabs alone.
  const add =
    status === 'signedIn' ? (
      <View key="add" style={styles.tab}>
        <Pressable onPress={() => router.push('/create')} accessibilityRole="button" accessibilityLabel="Add a song" style={({ pressed }) => [styles.add, pressed && { opacity: 0.85 }]}>
          <MainFill from={colors.primary} to={colors.primary2} />
          {/* In a view of its own, so it sits over the gradient (on the web an svg alone is drawn under it). */}
          <View>
            <PlusIcon color={colors.onPrimary} size={26} />
          </View>
        </Pressable>
      </View>
    ) : null;
  // Home and Songs, the "+", then the rest.
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <MiniPlayer />
      <View style={styles.bar} accessibilityRole="tablist">
        {tabs.slice(0, 2)}
        {add}
        {tabs.slice(2)}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { backgroundColor: colors.sand, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  bar: { flexDirection: 'row', alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 52 },
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: colors.muted },
  labelOn: { fontFamily: fonts.heavy, color: colors.ink },
  add: { width: 58, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
}));
