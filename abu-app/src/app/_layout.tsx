// Import each weight from its own path: the package index pulls in every weight and italic.
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { Marcellus_400Regular } from '@expo-google-fonts/marcellus/400Regular';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BrandMark } from '@/components/brand';
import { ConnectionBars } from '@/components/connection-bars';
import { useKeepOffline } from '@/lib/keep-offline';
import { persistOptions, queryClient } from '@/lib/offline';
import { startPwa } from '@/lib/pwa';
import { AnimatedSplash, BOOK_WIDTH } from '@/splash/animated-splash';
import { SessionProvider } from '@/state/session';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { brand } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/** Saves songs and song orders for upcoming services while online (see src/lib/keep-offline.ts). */
function KeepOffline() {
  useKeepOffline();
  return null;
}

export default function RootLayout() {
  // The app opens once the interface fonts are ready (the web page preloads them).
  const [loaded, error] = useFonts({
    Marcellus_400Regular,
    Figtree_500Medium,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  // The sol-fa font loads alongside without holding up the first screen: the
  // score is laid out in beat columns, so it lines up while the font arrives.
  useFonts({ JetBrainsMono_500Medium, JetBrainsMono_700Bold });

  // The opening animation covers the app until it finishes; its first frame
  // matches the still splash screen, which is hidden underneath it.
  const [opening, setOpening] = useState(true);
  const opened = useCallback(() => setOpening(false), []);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // On the web: the service worker that keeps Abụ on the phone, updates and "Install".
  useEffect(() => startPwa(), []);

  // While fonts load, show the same frame as the splash (and the web's first paint).
  // If a font fails, carry on with system fonts rather than a blank screen.
  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: brand.red, alignItems: 'center', justifyContent: 'center' }}>
        <BrandMark size={BOOK_WIDTH} />
      </View>
    );
  }

  return (
    // Data saved on the phone is restored first, so the app opens with it even without a connection.
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeProvider>
        <SessionProvider>
          <KeepOffline />
          <Screens opening={opening} />
          {opening ? <AnimatedSplash onDone={opened} /> : null}
        </SessionProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

/** Every screen, on the page colour of the light or dark theme. */
function Screens({ opening }: { opening: boolean }) {
  const { scheme, colors } = useTheme();
  return (
    <>
      {/* Light icons on the red opening and in the dark theme; dark ones on the light pages. */}
      <StatusBar style={opening || scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.sand }}>
        <ConnectionBars />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.sand } }} />
      </View>
    </>
  );
}
