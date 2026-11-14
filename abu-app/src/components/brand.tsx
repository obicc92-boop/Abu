/**
 * Brand pieces drawn in SVG: the mark from the app icon and the motif.
 * Sources and usage rules: design/brand/ and design/brand-draft.html.
 */
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { brand as colors } from '@/theme/tokens';

/**
 * The open music book from the app icon (design/brand/icon.svg): notation on
 * the left page, a pair of notes on the right, and a gold ribbon. Drawn for a
 * red background. `size` is the width.
 */
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={(size * 556) / 692} viewBox="166 314 692 556" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M488 736H536V862L512 840L488 862Z" fill={colors.gold} />
      <Path d="M512 394C430 344 300 334 176 358V732C300 708 430 718 512 768C594 718 724 708 848 732V358C724 334 594 344 512 394Z" fill={colors.redDeep} />
      <Path d="M512 372C430 322 300 312 196 336V708C300 684 430 694 512 744C594 694 724 684 828 708V336C724 312 594 322 512 372Z" fill={colors.white} />
      <Path d="M512 380V738" stroke="#EBD9D3" strokeWidth={6} />
      <Path d="M244 430L468 452M244 500L468 522M244 570L468 592" fill="none" stroke="#F0C9BF" strokeWidth={14} strokeLinecap="round" />
      <G fill={colors.red}>
        <Ellipse cx={306} cy={506} rx={27} ry={20} transform="rotate(-22 306 506)" />
        <Ellipse cx={412} cy={446} rx={27} ry={20} transform="rotate(-22 412 446)" />
        <Ellipse cx={604} cy={616} rx={42} ry={31} transform="rotate(-22 604 616)" />
        <Ellipse cx={740} cy={590} rx={42} ry={31} transform="rotate(-22 740 590)" />
        <Rect x={631} y={440} width={18} height={172} />
        <Rect x={767} y={414} width={18} height={172} />
        <Path d="M631 428L785 402V446L631 472Z" />
      </G>
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
