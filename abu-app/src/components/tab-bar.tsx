/**
 * The tabs' bar, as on Suno (owner's request, 21 November 2026, from Suno's screens): the tab you're on has its
 * icon in a pill. The names stay small under the icons, for choir members finding their way on a cheap phone. The
 * song playing sits over them (`MiniPlayer`). Add a song's "+" was here at first; the owner moved it to float at
 * the bottom right of the Songs tab the same day (src/components/add-song-sheet.tsx).
 */
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { MiniPlayer } from './mini-player';

type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BarProps) {
  const styles = useStyles();
  const colors = useColors();
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
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <MiniPlayer />
      <View style={styles.bar} accessibilityRole="tablist">
        {tabs}
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
}));
