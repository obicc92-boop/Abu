/**
 * Brand pieces drawn in SVG: the mark from the app icon and the background for red screens and feature cards.
 * Sources and usage rules: design/brand/ and design/brand-draft.html.
 */
import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Mask, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { brand as colors } from '@/theme/tokens';

/**
 * The mark from the app icon (design/brand/icon.svg and mark.svg): "s:s", soh,
 * the sol-fa colon in gold, soh, as a beat is written on a sol-fa sheet, in
 * Marcellus like the name. Drawn for a red background. `size` is the width.
 */
export const MARK_ASPECT = 373 / 620;

export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size * MARK_ASPECT} viewBox="0 0 620 373" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M185.3 26.9L188.6 82.1L184.0 82.7Q181.7 75.1 176.5 66.4Q171.4 57.8 163.2 50.5Q155.1 43.2 143.6 38.4Q132.2 33.6 117.2 33.6L117.2 33.6Q107.0 33.6 97.8 36.6Q88.7 39.6 81.9 45.4Q75.1 51.2 71.1 59.8Q67.1 68.4 67.1 80.1L67.1 80.1Q67.1 96.3 77.2 111.1Q87.4 125.9 102.6 140.3Q117.9 154.8 135.7 169.4Q153.4 184.0 168.7 199.9Q184.0 215.9 194.1 234.0Q204.2 252.1 204.2 273.0L204.2 273.0Q204.2 289.9 198.3 306.0Q192.3 322.1 179.8 334.7Q167.4 347.3 148.0 355.1Q128.5 362.9 101.6 362.9L101.6 362.9Q85.7 362.9 71.9 360.0Q58.1 357.0 46.7 352.5Q35.2 348.0 26.1 342.5Q17.0 337.1 10 332.1L10 332.1L13.3 269.0L18.6 269.0Q22.0 284.6 28.6 297.5Q35.2 310.5 45.0 319.6Q54.8 328.8 67.4 333.9Q80.1 339.0 95 339.0L95 339.0Q119.6 339.0 134.0 325.4Q148.5 311.8 148.5 289.9L148.5 289.9Q148.5 272.3 138.7 257.5Q128.9 242.8 113.9 229.1Q99.0 215.5 81.9 201.9Q64.8 188.3 49.8 172.9Q34.9 157.4 25.1 139.0Q15.3 120.6 15.3 97.0L15.3 97.0Q15.3 77.7 22.5 61.6Q29.6 45.5 42.4 34.1Q55.2 22.6 72.8 16.3Q90.4 10 111.3 10L111.3 10Q138.8 10 157.3 15.8Q175.7 21.6 185.3 26.9L185.3 26.9Z" fill={colors.white} />
      <Path d="M591.6 26.9L594.9 82.1L590.2 82.7Q587.9 75.1 582.8 66.4Q577.6 57.8 569.5 50.5Q561.3 43.2 549.9 38.4Q538.4 33.6 523.5 33.6L523.5 33.6Q513.2 33.6 504.1 36.6Q494.9 39.6 488.1 45.4Q481.3 51.2 477.3 59.8Q473.3 68.4 473.3 80.1L473.3 80.1Q473.3 96.3 483.5 111.1Q493.6 125.9 508.9 140.3Q524.1 154.8 541.9 169.4Q559.7 184.0 574.9 199.9Q590.2 215.9 600.3 234.0Q610.5 252.1 610.5 273.0L610.5 273.0Q610.5 289.9 604.5 306.0Q598.5 322.1 586.1 334.7Q573.6 347.3 554.2 355.1Q534.8 362.9 507.9 362.9L507.9 362.9Q491.9 362.9 478.2 360.0Q464.4 357.0 452.9 352.5Q441.5 348.0 432.3 342.5Q423.2 337.1 416.2 332.1L416.2 332.1L419.6 269.0L424.9 269.0Q428.2 284.6 434.8 297.5Q441.5 310.5 451.3 319.6Q461.1 328.8 473.7 333.9Q486.3 339.0 501.2 339.0L501.2 339.0Q525.8 339.0 540.3 325.4Q554.7 311.8 554.7 289.9L554.7 289.9Q554.7 272.3 544.9 257.5Q535.1 242.8 520.2 229.1Q505.2 215.5 488.1 201.9Q471.0 188.3 456.1 172.9Q441.1 157.4 431.3 139.0Q421.6 120.6 421.6 97.0L421.6 97.0Q421.6 77.7 428.7 61.6Q435.8 45.5 448.6 34.1Q461.4 22.6 479.0 16.3Q496.6 10 517.5 10L517.5 10Q545.1 10 563.5 15.8Q581.9 21.6 591.6 26.9L591.6 26.9Z" fill={colors.white} />
      <Circle cx={310.2} cy={94.7} r={44} fill={colors.gold} />
      <Circle cx={310.2} cy={278.2} r={44} fill={colors.gold} />
    </Svg>
  );
}

/** Where the faint colons sit in one 56×56 repeat: two sol-fa beat marks, staggered. */
const BEATS = [
  [14, 11],
  [14, 19],
  [42, 39],
  [42, 47],
];

interface MotifProps {
  /** The colons' colour: white on red. */
  color: string;
  /** Keep it low: about 0.16. */
  opacity: number;
  /**
   * Where the words sit, as fractions of the width and height. The light is
   * brightest there and the colons clear away around it.
   */
  focus?: { x: number; y: number };
  /** On a card: the colons fade out towards the left, so the card's words sit on clean red. */
  fade?: boolean;
  /**
   * On a feature card (`hero`): a soft glow of the look's colour from the top right, and a fainter second one
   * from below, in place of most of the light behind the words.
   */
  glow?: string;
  glow2?: string;
}

/**
 * The SolfaScores background for red screens and cards, filling its parent:
 * a soft light, brightest behind the words and deepening towards the edges,
 * with faint sol-fa colons (beat marks, like the gold colon in s:s) that clear
 * away from the words. The owner's choice (19 November 2026), after the rings
 * pattern clashed with the letters. Put it first inside a red card or screen
 * that has `overflow: 'hidden'`; never behind the score, words or lists.
 */
export function Motif({ color, opacity, focus = { x: 0.5, y: 0.33 }, fade = false, glow, glow2 }: MotifProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
  };
  const w = box?.w ?? 0;
  const h = box?.h ?? 0;
  const cx = w * focus.x;
  const cy = h * focus.y;
  const reach = Math.max(w, h);
  return (
    <View style={styles.fill} onLayout={onLayout}>
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id={`l${id}`} cx={cx} cy={cy} fx={cx} fy={cy} r={reach * 0.8} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={glow ? 0.05 : 0.14} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.1} />
            </RadialGradient>
            {glow ? (
              <RadialGradient id={`a${id}`} cx={w * 0.95} cy={-h * 0.2} fx={w * 0.95} fy={-h * 0.2} r={reach * 0.85} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={glow} stopOpacity={0.5} />
                <Stop offset="1" stopColor={glow} stopOpacity={0} />
              </RadialGradient>
            ) : null}
            {glow2 ? (
              <RadialGradient id={`b${id}`} cx={w * 0.7} cy={h * 1.25} fx={w * 0.7} fy={h * 1.25} r={reach * 0.6} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={glow2} stopOpacity={0.28} />
                <Stop offset="1" stopColor={glow2} stopOpacity={0} />
              </RadialGradient>
            ) : null}
            <Pattern id={`p${id}`} width={56} height={56} patternUnits="userSpaceOnUse">
              {BEATS.map(([x, y]) => (
                <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.7} fill={color} />
              ))}
            </Pattern>
            {fade ? (
              <LinearGradient id={`g${id}`} x1="1" y1="0" x2="0" y2="0">
                <Stop offset="0.15" stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            ) : (
              <RadialGradient id={`g${id}`} cx={cx} cy={cy} fx={cx} fy={cy} r={reach * 0.55} gradientUnits="userSpaceOnUse">
                <Stop offset="0.18" stopColor="#000000" stopOpacity={1} />
                <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={1} />
              </RadialGradient>
            )}
            <Mask id={`m${id}`}>
              <Rect width={w} height={h} fill={`url(#g${id})`} />
            </Mask>
          </Defs>
          {glow ? <Rect width={w} height={h} fill={`url(#a${id})`} /> : null}
          {glow2 ? <Rect width={w} height={h} fill={`url(#b${id})`} /> : null}
          <Rect width={w} height={h} fill={`url(#l${id})`} />
          <Rect width={w} height={h} fill={`url(#p${id})`} opacity={opacity} mask={`url(#m${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * The main buttons' fill, as on Suno's Create button: the main colour running into pink and back again, across
 * and a little down. Put it first inside the button, which clips it (`overflow: 'hidden'`).
 */
export function MainFill({ from, to }: { from: string; to: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={styles.fill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`f${id}`} x1="0" y1="0" x2="1" y2="0.4">
            <Stop offset="0" stopColor={from} />
            <Stop offset="0.5" stopColor={to} />
            <Stop offset="1" stopColor={from} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#f${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
});
