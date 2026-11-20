/**
 * The look (Gold, Silver or Violet) and light or dark. The app follows the
 * phone's dark mode ("Match phone") unless the person picks Light or Dark in
 * Me; both choices are kept on this phone.
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

export type ThemeChoice = 'system' | Scheme;

const CHOICE_KEY = 'abu.theme';
const LOOK_KEY = 'abu.look';

interface Theme {
  /** What the person picked: follow the phone, or always light or dark. */
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
  /** Gold, Silver or Violet. */
  look: LookId;
  setLook: (look: LookId) => void;
  /** The palette in use now. */
  scheme: Scheme;
  colors: Palette;
}

const ThemeContext = createContext<Theme>({ choice: 'system', setChoice: () => {}, look: 'gold', setLook: () => {}, scheme: 'light', colors: palettes.gold.light });

function savedChoice(): ThemeChoice {
  const v = readSetting(CHOICE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function savedLook(): LookId {
  const v = readSetting(LOOK_KEY);
  return LOOKS.find((l) => l.id === v)?.id ?? 'gold';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(savedChoice);
  const [look, setLookState] = useState<LookId>(savedLook);
  const phone = useColorScheme();
  const scheme: Scheme = choice === 'system' ? (phone === 'dark' ? 'dark' : 'light') : choice;
  const colors = palettes[look][scheme];

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeSetting(CHOICE_KEY, next === 'system' ? null : next);
  }, []);

  const setLook = useCallback((next: LookId) => {
    setLookState(next);
    writeSetting(LOOK_KEY, next === 'gold' ? null : next);
  }, []);

  // On phones, the app's own choice also sets the keyboard and system dialogs.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(choice === 'system' ? 'auto' : choice);
    } catch {
      // Older systems: the app's colours still follow the choice.
    }
  }, [choice]);

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

  const value = useMemo(() => ({ choice, setChoice, look, setLook, scheme, colors }), [choice, setChoice, look, setLook, scheme, colors]);
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
  const made: Partial<Record<`${LookId}-${Scheme}`, Readonly<S>>> = {};
  return function useStyles(): Readonly<S> {
    const { look, scheme, colors } = useContext(ThemeContext);
    return (made[`${look}-${scheme}`] ??= StyleSheet.create(build(colors)));
  };
}
