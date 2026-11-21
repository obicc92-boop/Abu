/**
 * Shared building blocks in the prototype's style: pages, top bars, buttons,
 * fields, cards and the voice-part picker.
 */
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/api/client';
import { useOnline } from '@/lib/online';
import { partName } from '@/solfa';
import { makeStyles, useColors, usePartInk } from '@/theme/theme';
import { brand, fonts, type Palette, partColor } from '@/theme/tokens';

import { MainFill } from './brand';
import { BackIcon } from './icons';

export const MAX_WIDTH = 560;

/** A scrolling page, centred and no wider than a phone on big screens. */
/**
 * A screen's page, scrolling; `footer` stays at the bottom under it (the sol-fa keypad while it's in use), and
 * `floating` floats over its bottom (the Songs tab's "+"), with room left under the last thing in the page.
 */
export function Page({
  children,
  background,
  edges,
  footer,
  floating,
}: {
  children: ReactNode;
  background?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  footer?: ReactNode;
  floating?: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: background ?? colors.sand }]} edges={edges ?? ['top', 'left', 'right']}>
      <ScrollView style={styles.page} contentContainerStyle={[styles.body, floating ? styles.bodyUnderFloating : null]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      {floating}
    </SafeAreaView>
  );
}

/** Title row; with `back`, a back button that returns or goes home. */
export function TopBar({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.topbar}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={styles.back}
        >
          <BackIcon color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

type ButtonKind = 'primary' | 'ghost' | 'light' | 'outlineLight' | 'danger' | 'whatsapp';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  small,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const k = buttonsFor(colors)[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, k.box, pressed && { opacity: 0.85 }, (disabled || busy) && { opacity: 0.55 }, style]}
    >
      {kind === 'primary' ? <MainFill from={colors.primary} to={colors.primary2} /> : null}
      {busy ? <ActivityIndicator color={k.text.color} /> : <Text style={[styles.buttonText, small && styles.buttonTextSmall, k.text]}>{label}</Text>}
    </Pressable>
  );
}

/** Each kind of button in a palette. "light" and "outlineLight" sit on the feature cards (`hero`). */
const buttonsFor = (colors: Palette): Record<ButtonKind, { box: ViewStyle; text: { color: string } }> => ({
  primary: { box: { backgroundColor: colors.primary, overflow: 'hidden' }, text: { color: colors.onPrimary } },
  ghost: { box: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line }, text: { color: colors.ink } },
  light: { box: { backgroundColor: colors.onHero }, text: { color: colors.hero } },
  outlineLight: { box: { borderWidth: 1.5, borderColor: colors.onHeroSoft }, text: { color: colors.onHero } },
  danger: { box: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.dangerLine }, text: { color: colors.danger } },
  /** Sharing to WhatsApp, in its own green with white text in every look. */
  whatsapp: { box: { backgroundColor: brand.whatsapp }, text: { color: brand.white } },
});

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.placeholder} {...input} style={[styles.input, input.multiline && { minHeight: 90, textAlignVertical: 'top' }, input.style]} accessibilityLabel={label} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <ErrorText message={error} /> : null}
    </View>
  );
}

export function Card({ children, style, tone = 'white' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'white' | 'sand' | 'hero' }) {
  const styles = useStyles();
  return <View style={[styles.card, tone === 'sand' && styles.cardSand, tone === 'hero' && styles.cardHero, style]}>{children}</View>;
}

/** Small uppercase label above a section or inside a card. */
export function Kicker({ children, color }: { children: ReactNode; color?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return <Text style={[styles.kicker, { color: color ?? colors.muted }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const styles = useStyles();
  const colors = useColors();
  return <Text style={[styles.text, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function ErrorText({ message }: { message: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {message}
    </Text>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const styles = useStyles();
  const colors = useColors();
  const online = useOnline();
  // Offline, a query with nothing saved waits for a connection: say so instead of spinning.
  if (!online) {
    return (
      <View style={styles.loading}>
        <Text style={[styles.hint, { textAlign: 'center' }]}>This isn’t saved on this phone yet. It will load when you’re back online.</Text>
      </View>
    );
  }
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.link} />
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

/** Round badge with a person's initials, ringed in their part's colour. */
/** Someone's profile picture (`photo`: its key), or their initials on their part's colour. */
export function Avatar({ name, part, size = 38, photo }: { name: string; part?: string | null; size?: number; photo?: string | null }) {
  const styles = useStyles();
  const colors = useColors();
  // A picture that doesn't load (offline, say) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  const uri = avatarUrl(photo);
  if (uri && failed !== uri) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(uri)}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.board }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: part ? partColor(part) : colors.ink }]}>
      {/* With no part yet the circle is ink (white in dark), so the letters are the page's colour. */}
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }, !part && { color: colors.onInk }]}>{initials || '?'}</Text>
    </View>
  );
}

export const PARTS = ['S', 'A', 'T', 'B'];

/** Choose a voice part: S, A, T, B, and optionally "I don't sing". */
export function PartPicker({ value, onChange, allowNone }: { value: string | null; onChange: (part: string | null) => void; allowNone?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const options: (string | null)[] = allowNone ? [...PARTS, null] : PARTS;
  return (
    <View style={styles.parts} accessibilityRole="radiogroup">
      {options.map((p) => {
        const on = value === p;
        return (
          <Pressable
            key={p ?? 'none'}
            onPress={() => onChange(p)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={p ? partName(p) : 'I don’t sing'}
            style={[styles.partOption, on && styles.partOptionOn]}
          >
            {p ? <View style={[styles.partDot, { backgroundColor: partColor(p) }]} /> : null}
            <Text style={[styles.partLabel, on && { color: colors.ink }]}>{p ? partName(p) : 'I don’t sing'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A rounded toggle, for filters and tags. */
/** A choice that's on or off; `dot` puts a colour before the label (a part's colour). */
export function Chip({ label, on, onPress, dot }: { label: string; on: boolean; onPress: () => void; dot?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, dot ? styles.chipDotted : null, on && styles.chipOn]}>
      {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipText, on && { color: colors.onInk }]}>{label}</Text>
    </Pressable>
  );
}

/** Where you are in a few steps, as a bar for each and "Step 1 of 2 · The song". */
export function Steps({ at, names }: { at: number; names: string[] }) {
  const styles = useStyles();
  return (
    <View style={styles.steps} accessibilityLabel={`Step ${at} of ${names.length}: ${names[at - 1]}`}>
      <View style={styles.stepBars}>
        {names.map((n, i) => (
          <View key={n} style={[styles.stepBar, i < at && styles.stepBarOn]} />
        ))}
      </View>
      <Text style={styles.stepText}>
        Step {at} of {names.length} · <Text style={styles.stepName}>{names[at - 1]}</Text>
      </Text>
    </View>
  );
}

/** A part's name in its colour, e.g. for "Alto" next to a name. */
export function PartTag({ part }: { part: string | null }) {
  const ink = usePartInk();
  const styles = useStyles();
  if (!part) return null;
  return <Text style={[styles.partTag, { color: ink(part) }]}>{partName(part)}</Text>;
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1 },
  footer: { backgroundColor: colors.sand, borderTopWidth: 1, borderColor: colors.line },
  body: { padding: 16, paddingBottom: 32, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  bodyUnderFloating: { paddingBottom: 96 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  // Round, as Suno's icon buttons are.
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.heavy, fontSize: 21, lineHeight: 26, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, marginTop: 1 },
  // Pills, as on Suno.
  button: { minHeight: 50, borderRadius: 999, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { minHeight: 38, borderRadius: 999, paddingHorizontal: 14 },
  buttonText: { fontFamily: fonts.heavy, fontSize: 15.5 },
  buttonTextSmall: { fontSize: 13.5 },
  field: { gap: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    // The focus ring, in the brand red instead of the browser's blue.
    outlineColor: colors.primary,
  },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  error: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.danger },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  cardSand: { backgroundColor: colors.board, borderColor: colors.board },
  cardHero: { backgroundColor: colors.hero, borderColor: colors.hero, overflow: 'hidden' },
  kicker: { fontFamily: fonts.heavy, fontSize: 11.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  loading: { padding: 32, alignItems: 'center', gap: 10 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.heavy, color: brand.white },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  partOption: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  partOptionOn: { borderColor: colors.ink, borderWidth: 2 },
  partDot: { width: 22, height: 22, borderRadius: 11 },
  partLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.muted },
  partTag: { fontFamily: fonts.bold, fontSize: 13 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  chipDotted: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chipDot: { width: 9, height: 9, borderRadius: 4.5 },
  steps: { gap: 8, marginTop: -4 },
  stepBars: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  stepBarOn: { backgroundColor: colors.primary },
  stepText: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  stepName: { fontFamily: fonts.heavy, color: colors.ink },
}));
