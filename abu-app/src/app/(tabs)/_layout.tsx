/**
 * The five tabs: Home, Songs, Schedule, Group, Me (docs/app-plan.md).
 * Without a group, Schedule reads "Setlists" and Group reads "Groups".
 * People who are neither signed in nor looking around go to the welcome screen.
 */
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';

import { CalendarIcon, HomeIcon, PeopleIcon, PersonIcon, SongsIcon } from '@/components/icons';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { status, lookingAround, group } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.sand }} />;
  if (status === 'signedOut' && !lookingAround) return <Redirect href="/welcome" />;

  const personal = !group || group.type === 'personal';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, height: 70, paddingTop: 6, paddingBottom: 12 },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11.5, lineHeight: 15 },
        sceneStyle: { backgroundColor: colors.sand },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }} />
      <Tabs.Screen name="songs" options={{ title: 'Songs', tabBarIcon: ({ color }) => <SongsIcon color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: personal ? 'Setlists' : 'Schedule', tabBarIcon: ({ color }) => <CalendarIcon color={color} /> }} />
      <Tabs.Screen name="group" options={{ title: personal ? 'Groups' : 'Group', tabBarIcon: ({ color }) => <PeopleIcon color={color} /> }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: ({ color }) => <PersonIcon color={color} /> }} />
    </Tabs>
  );
}
