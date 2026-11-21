/**
 * The five tabs: Home, Songs, Schedule, Group, Me (docs/app-plan.md), in a bar like Suno's with Add a song's
 * "+" in the middle (src/components/tab-bar.tsx).
 * Without a group, Schedule reads "Setlists" and Group reads "Groups".
 * People who are neither signed in nor looking around go to the welcome screen.
 */
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';

import { CalendarIcon, HomeIcon, PeopleIcon, PersonIcon, SongsIcon } from '@/components/icons';
import { TabBar } from '@/components/tab-bar';
import { useSession } from '@/state/session';
import { useColors } from '@/theme/theme';

export default function TabsLayout() {
  const colors = useColors();
  const { status, lookingAround, group } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.sand }} />;
  if (status === 'signedOut' && !lookingAround) return <Redirect href="/welcome" />;

  const personal = !group || group.type === 'personal';
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.sand } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }} />
      <Tabs.Screen name="songs" options={{ title: 'Songs', tabBarIcon: ({ color }) => <SongsIcon color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: personal ? 'Setlists' : 'Schedule', tabBarIcon: ({ color }) => <CalendarIcon color={color} /> }} />
      <Tabs.Screen name="group" options={{ title: personal ? 'Groups' : 'Group', tabBarIcon: ({ color }) => <PeopleIcon color={color} /> }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: ({ color }) => <PersonIcon color={color} /> }} />
    </Tabs>
  );
}
