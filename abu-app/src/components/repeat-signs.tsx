/**
 * The repeat signs, drawn (phones' fonts may have no 𝄋 or 𝄌): the segno, an S with a slanting stroke through it
 * and a dot each side; the coda, an oval with a cross through it; and a repeat's double bar with its two dots, for
 * the keypad's keys. Used on the score (src/components/score.tsx) and the keypad's Marks (solfa-keypad.tsx).
 */
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

/** The segno 𝄋, `size` points tall. */
export function SegnoSign({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size * 0.8} height={size} viewBox="0 0 16 20">
      <Path
        d="M11.6 5.4C11.6 3.4 10 2.2 8 2.2 5.9 2.2 4.4 3.5 4.4 5.4 4.4 9.2 11.6 8.6 11.6 13.6 11.6 16 9.9 17.8 7.8 17.8 5.6 17.8 4.2 16.4 4.2 14.6"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Line x1={2.6} y1={16.8} x2={13.4} y2={3.2} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Circle cx={3.2} cy={9.6} r={1.35} fill={color} />
      <Circle cx={12.8} cy={10.4} r={1.35} fill={color} />
    </Svg>
  );
}

/** The coda sign 𝄌, `size` points tall. */
export function CodaSign({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size * 0.9} height={size} viewBox="0 0 18 20">
      <Ellipse cx={9} cy={10} rx={4.7} ry={6.2} fill="none" stroke={color} strokeWidth={1.7} />
      <Line x1={9} y1={1} x2={9} y2={19} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Line x1={1.4} y1={10} x2={16.6} y2={10} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

/** A repeat's bar line as a sheet prints it: a start repeat ‖: or an end repeat :‖, `size` points tall. */
export function RepeatBarSign({ end, size, color }: { end: boolean; size: number; color: string }) {
  // Drawn as a start repeat, and turned round for an end.
  return (
    <Svg width={size * 0.7} height={size} viewBox="0 0 14 20">
      <Rect x={end ? 10.2 : 1.2} y={1} width={2.6} height={18} rx={0.4} fill={color} />
      <Rect x={end ? 7.2 : 5.6} y={1} width={1.2} height={18} fill={color} />
      <Circle cx={end ? 3 : 11} cy={7} r={1.5} fill={color} />
      <Circle cx={end ? 3 : 11} cy={13} r={1.5} fill={color} />
    </Svg>
  );
}
