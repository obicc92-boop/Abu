/**
 * Brand pieces drawn in SVG: the mark from the app icon and the motif.
 * Sources and usage rules: design/brand/ and design/brand-draft.html.
 */
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/** The four voice-part bars and the gold dot, as on the app icon. */
export function BrandMark({ size = 48, color = colors.white, dot = colors.gold }: { size?: number; color?: string; dot?: string }) {
  return (
    <Svg width={size} height={(size * 548) / 534} viewBox="245 238 534 548" accessibilityElementsHidden importantForAccessibility="no">
      <G fill={color}>
        <Rect x={245} y={339} width={96} height={218} rx={48} />
        <Rect x={391} y={276} width={96} height={344} rx={48} />
        <Rect x={537} y={238} width={96} height={420} rx={48} />
        <Rect x={683} y={313.5} width={96} height={269} rx={48} />
      </G>
      <Circle cx={512} cy={750} r={36} fill={dot} />
    </Svg>
  );
}

/** One 64×64 repeat: corner arcs that join into sound rings, and a small star in the middle. */
const TILE = [
  'M10 0A10 10 0 0 1 0 10M18 0A18 18 0 0 1 0 18M26 0A26 26 0 0 1 0 26',
  'M54 0A10 10 0 0 0 64 10M46 0A18 18 0 0 0 64 18M38 0A26 26 0 0 0 64 26',
  'M0 54A10 10 0 0 1 10 64M0 46A18 18 0 0 1 18 64M0 38A26 26 0 0 1 26 64',
  'M64 54A10 10 0 0 0 54 64M64 46A18 18 0 0 0 46 64M64 38A26 26 0 0 0 38 64',
  'M32 24.5v-4M32 39.5v4M24.5 32h-4M39.5 32h4',
].join('');

interface MotifProps {
  /** One colour: white on red, gold on sand, red on the dark Perform page. */
  color: string;
  /** Keep it low: about 0.10 on red, 0.28 on sand; 0.16 on red cards that fade. */
  opacity: number;
  /** 1.5 draws each repeat at 96 points, the calm default. */
  scale?: number;
  /** Fade out towards the left so text on the card sits on a clean background. */
  fade?: boolean;
}

/**
 * The Abụ motif (adire rings and dots, uli lines), filling its parent.
 * Put it first inside a card that has `overflow: 'hidden'`. Use it on the
 * welcome screen, the next-service card and empty screens only; never
 * behind the score, words or lists.
 */
export function Motif({ color, opacity, scale = 1.5, fade = false }: MotifProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const size = 64 * scale;
  return (
    <View style={styles.fill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`p${id}`} width={size} height={size} patternUnits="userSpaceOnUse">
            <G scale={scale}>
              <Path d={TILE} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
              <Circle cx={32} cy={32} r={2.4} fill={color} />
            </G>
          </Pattern>
          {fade ? (
            <LinearGradient id={`g${id}`} x1="1" y1="0" x2="0" y2="0">
              <Stop offset="0.15" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          ) : null}
          {fade ? (
            <Mask id={`m${id}`}>
              <Rect width="100%" height="100%" fill={`url(#g${id})`} />
            </Mask>
          ) : null}
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#p${id})`} opacity={opacity} mask={fade ? `url(#m${id})` : undefined} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
});
