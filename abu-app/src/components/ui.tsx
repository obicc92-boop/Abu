/**
 * Shared building blocks in the prototype's style: pages, top bars, buttons,
 * fields, cards and the voice-part picker.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { partName } from '@/solfa';
import { colors, fonts, partColor, partLetter } from '@/theme/tokens';

import { BackIcon } from './icons';

export const MAX_WIDTH = 560;

/** A scrolling page, centred and no wider than a phone on big screens. */
export function Page({ children, background = colors.sand, edges }: { children: ReactNode; background?: string; edges?: ('top' | 'bottom' | 'left' | 'right')[] }) {
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: background }]} edges={edges ?? ['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Title row; with `back`, a back button that returns or goes home. */
export function TopBar({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
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

type ButtonKind = 'primary' | 'ghost' | 'light' | 'outlineLight' | 'danger';

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
  const k = BUTTONS[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, k.box, pressed && { opacity: 0.85 }, (disabled || busy) && { opacity: 0.55 }, style]}
    >
      {busy ? <ActivityIndicator color={k.text.color} /> : <Text style={[styles.buttonText, small && styles.buttonTextSmall, k.text]}>{label}</Text>}
    </Pressable>
  );
}

const BUTTONS: Record<ButtonKind, { box: ViewStyle; text: { color: string } }> = {
  primary: { box: { backgroundColor: colors.red }, text: { color: colors.white } },
  ghost: { box: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line }, text: { color: colors.ink } },
  light: { box: { backgroundColor: colors.white }, text: { color: colors.redDeep } },
  outlineLight: { box: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)' }, text: { color: colors.white } },
  danger: { box: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: '#E7B9AE' }, text: { color: colors.redDeep } },
};

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#B3A39A" {...input} style={[styles.input, input.multiline && { minHeight: 90, textAlignVertical: 'top' }, input.style]} accessibilityLabel={label} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <ErrorText message={error} /> : null}
    </View>
  );
}

export function Card({ children, style, tone = 'white' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'white' | 'sand' | 'red' }) {
  return <View style={[styles.card, tone === 'sand' && styles.cardSand, tone === 'red' && styles.cardRed, style]}>{children}</View>;
}

/** Small uppercase label above a section or inside a card. */
export function Kicker({ children, color = colors.muted }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.kicker, { color }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[styles.text, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function ErrorText({ message }: { message: string }) {
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {message}
    </Text>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.red} />
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

/** Round badge with a person's initials, ringed in their part's colour. */
export function Avatar({ name, part, size = 38 }: { name: string; part?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: part ? partColor(part) : colors.ink }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
    </View>
  );
}

export const PARTS = ['S', 'A', 'T', 'B'];

/** Choose a voice part: S, A, T, B, and optionally "I don't sing". */
export function PartPicker({ value, onChange, allowNone }: { value: string | null; onChange: (part: string | null) => void; allowNone?: boolean }) {
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
            {p ? (
              <View style={[styles.partDot, { backgroundColor: partColor(p) }]}>
                <Text style={styles.partDotText}>{partLetter(p)}</Text>
              </View>
            ) : null}
            <Text style={[styles.partLabel, on && { color: colors.ink }]}>{p ? partName(p) : 'I don’t sing'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A part's name in its colour, e.g. for "Alto" next to a name. */
export function PartTag({ part }: { part: string | null }) {
  if (!part) return null;
  return <Text style={[styles.partTag, { color: partColor(part) }]}>{partName(part)}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { padding: 16, paddingBottom: 32, gap: 14, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  back: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.heavy, fontSize: 21, lineHeight: 26, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, marginTop: 1 },
  button: { minHeight: 50, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12 },
  buttonText: { fontFamily: fonts.heavy, fontSize: 15.5 },
  buttonTextSmall: { fontSize: 13.5 },
  field: { gap: 6 },
  label: { fontFamily: fonts.heavy, fontSize: 13, color: colors.muted },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  error: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.redDeep },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  cardSand: { backgroundColor: colors.board, borderColor: colors.board },
  cardRed: { backgroundColor: colors.red, borderColor: colors.red, overflow: 'hidden' },
  kicker: { fontFamily: fonts.heavy, fontSize: 11.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  loading: { padding: 32, alignItems: 'center', gap: 10 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.heavy, color: colors.white },
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
    backgroundColor: colors.white,
  },
  partOptionOn: { borderColor: colors.ink, borderWidth: 2 },
  partDot: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  partDotText: { fontFamily: fonts.heavy, fontSize: 13, color: colors.white },
  partLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.muted },
  partTag: { fontFamily: fonts.bold, fontSize: 13 },
});
