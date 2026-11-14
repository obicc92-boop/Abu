import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { partLevel, type MixSettings } from '@/audio/engine';
import { partName } from '@/solfa';
import { colors, fonts, partColor, partInk } from '@/theme/tokens';

/* ---------- Part mixer: tap a part to mute it; Solo; Mine ---------- */

interface MixerProps {
  parts: string[];
  mix: MixSettings;
  onMute(part: string): void;
  onSolo(part: string): void;
  onMine(part: string): void;
}

export function PartMixer({ parts, mix, onMute, onSolo, onMine }: MixerProps) {
  return (
    <View style={styles.mixer}>
      {parts.map((p) => {
        const silent = partLevel(p, mix) === 0;
        const mine = mix.mine === p;
        return (
          <View key={p} style={[styles.part, mine && parts.length > 1 && styles.partMine]}>
            <Pressable
              onPress={() => onMute(p)}
              accessibilityRole="button"
              accessibilityLabel={`Mute or unmute ${partName(p)}`}
              accessibilityState={{ selected: !silent }}
              style={styles.partTap}
              hitSlop={4}
            >
              {/* The part's colour, as in the score; hollow when muted. */}
              <View style={[styles.swatch, silent ? { borderColor: colors.barline, backgroundColor: colors.white } : { borderColor: partColor(p), backgroundColor: partColor(p) }]} />
              <Text style={[styles.partName, { color: silent ? colors.muted : partInk(p) }]} numberOfLines={1}>
                {partName(p)}
              </Text>
            </Pressable>
            <View style={styles.partButtons}>
              <SmallToggle label="Solo" on={mix.solo === p} onPress={() => onSolo(p)} a11y={`Solo ${partName(p)}`} />
              {parts.length > 1 ? (
                <SmallToggle label="Mine" on={mine} onPress={() => onMine(p)} a11y={`${partName(p)} is my part`} />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SmallToggle({ label, on, onPress, a11y }: { label: string; on: boolean; onPress(): void; a11y: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on }}
      style={[styles.small, on && styles.smallOn]}
    >
      <Text style={[styles.smallText, on && styles.smallTextOn]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- On/off rows ---------- */

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange(): void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>
        {label}
        {hint ? <Text style={styles.toggleHint}> {hint}</Text> : null}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.switchOff, true: colors.red }}
        thumbColor={colors.white}
        // On the web, react-native-web colours the "on" knob separately.
        {...({ activeThumbColor: colors.white } as object)}
      />
    </View>
  );
}

/* ---------- Transport: tempo, play, key ---------- */

interface StepperProps {
  label: string;
  value: string | number;
  onStep(delta: number): void;
  lessLabel: string;
  moreLabel: string;
}

export function Stepper({ label, value, onStep, lessLabel, moreLabel }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={lessLabel} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={moreLabel} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PlayButton({ playing, onPress, size = 68 }: { playing: boolean; onPress(): void; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Stop' : 'Play'}
      style={({ pressed }) => [styles.play, { width: size, height: size, borderRadius: size / 2 }, pressed && { backgroundColor: colors.redDeep }]}
    >
      {playing ? <View style={styles.stopIcon} /> : <View style={styles.playIcon} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mixer: { flexDirection: 'row', gap: 6 },
  part: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingTop: 8,
    paddingHorizontal: 4,
    paddingBottom: 6,
    alignItems: 'center',
    gap: 4,
  },
  partMine: { borderColor: colors.ink },
  partTap: { alignItems: 'center', gap: 4, alignSelf: 'stretch' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5 },
  partName: { fontFamily: fonts.heavy, fontSize: 11.5 },
  partButtons: { alignSelf: 'stretch', gap: 3, paddingHorizontal: 4 },
  small: { borderRadius: 6, paddingVertical: 3, backgroundColor: colors.sand, alignItems: 'center' },
  smallOn: { backgroundColor: colors.ink },
  smallText: { fontFamily: fonts.heavy, fontSize: 10.5, color: colors.muted },
  smallTextOn: { color: colors.white },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  toggleLabel: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  toggleHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },

  stepper: { alignItems: 'center', gap: 3 },
  stepperLabel: { fontFamily: fonts.heavy, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { fontFamily: fonts.heavy, fontSize: 16, color: colors.ink },
  stepperValue: { fontFamily: fonts.monoBold, fontSize: 15, minWidth: 30, textAlign: 'center', color: colors.ink },

  play: {
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.redDeep,
    shadowOpacity: 0.45,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  playIcon: {
    marginLeft: 5,
    width: 0,
    height: 0,
    borderTopWidth: 13,
    borderBottomWidth: 13,
    borderLeftWidth: 22,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.white,
  },
  stopIcon: { width: 20, height: 20, borderRadius: 3, backgroundColor: colors.white },
});
