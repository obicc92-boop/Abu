/**
 * The look: White, Ebony, Gold, Silver or Violet, or "Match phone" (White by
 * day, Ebony when the phone is dark), picked in Me and kept on this phone.
 * White is the light look; the other four are dark.
 *
 * Screens read colours with `useColors()`, and make their styles with
 * `makeStyles((colors) => ({ ... }))`, which gives a hook returning the styles
 * for the palette in use (each palette's styles are made once).
 */
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';

import { readSetting, writeSetting } from '@/lib/storage';

import { LOOKS, palettes, partInk, type LookId, type Palette, type Scheme } from './tokens';

export type ThemeChoice = 'system' | LookId;

const LOOK_KEY = 'abu.look';
/** Before the five looks: "light" or "dark", read once as White or Ebony. */
const OLD_KEY = 'abu.theme';

interface Theme {
  /** What the person picked: follow the phone, or one look. */
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
  /** The look in use now, and whether it's light or dark. */
  look: LookId;
  scheme: Scheme;
  colors: Palette;
}

const ThemeContext = createContext<Theme>({ choice: 'system', setChoice: () => {}, look: 'white', scheme: 'light', colors: palettes.white });

function savedChoice(): ThemeChoice {
  const v = readSetting(LOOK_KEY);
  const look = LOOKS.find((l) => l.id === v);
  if (look) return look.id;
  const old = readSetting(OLD_KEY);
  return old === 'light' ? 'white' : old === 'dark' ? 'ebony' : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(savedChoice);
  const phone = useColorScheme();
  const look: LookId = choice === 'system' ? (phone === 'dark' ? 'ebony' : 'white') : choice;
  const scheme = LOOKS.find((l) => l.id === look)?.scheme ?? 'light';
  const colors = palettes[look];

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeSetting(LOOK_KEY, next === 'system' ? null : next);
    writeSetting(OLD_KEY, null);
  }, []);

  // On phones, the app's own choice also sets the keyboard and system dialogs.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(choice === 'system' ? 'auto' : scheme);
    } catch {
      // Older systems: the app's colours still follow the choice.
    }
  }, [choice, scheme]);

  // Behind the app (and the web page's own controls and scroll bars).
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.sand).catch(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = scheme;
      document.documentElement.dataset.theme = scheme;
      document.documentElement.dataset.look = look;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.sand);
    }
  }, [scheme, look, colors]);

  const value = useMemo(() => ({ choice, setChoice, look, scheme, colors }), [choice, setChoice, look, scheme, colors]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** A part's colour for text (its name, its notes) in the theme in use. */
export function usePartInk(): (part: string) => string {
  const { scheme } = useContext(ThemeContext);
  return useCallback((part: string) => partInk(part, scheme === 'dark'), [scheme]);
}

/** The palette in use. */
export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}

type Styles = Parameters<typeof StyleSheet.create>[0];

/**
 * Styles that use the theme's colours: `const useStyles = makeStyles((colors) => ({ ... }))`
 * at the top of a file, then `const styles = useStyles()` in each component.
 */
export function makeStyles<S extends Styles>(build: (colors: Palette) => S & Styles): () => Readonly<S> {
  const made: Partial<Record<LookId, Readonly<S>>> = {};
  return function useStyles(): Readonly<S> {
    const { look, colors } = useContext(ThemeContext);
    return (made[look] ??= StyleSheet.create(build(colors)));
  };
}
