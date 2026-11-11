// Import each weight from its own path: the package index pulls in every weight and italic.
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { Marcellus_400Regular } from '@expo-google-fonts/marcellus/400Regular';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

import { AnimatedSplash } from '@/splash/animated-splash';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Marcellus_400Regular,
    Figtree_500Medium,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  // The opening animation covers the app until it finishes; its first frame
  // matches the still splash screen, which is hidden underneath it.
  const [opening, setOpening] = useState(true);
  const opened = useCallback(() => setOpening(false), []);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Fall back to system fonts rather than a blank screen if a font fails to load.
  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style={opening ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.sand } }} />
      {opening ? <AnimatedSplash onDone={opened} /> : null}
    </>
  );
}
