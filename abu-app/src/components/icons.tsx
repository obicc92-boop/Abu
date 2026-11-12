/** Line icons, from the prototype's icon set (prototype/index.html). */
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color: ColorValue;
}

export function HomeIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function SongsIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 18V5l11-2v13" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={6.5} cy={18} r={2.5} fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={17.5} cy={16} r={2.5} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function CalendarIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function PeopleIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={17} cy={9} r={2.6} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M17.5 14.6c2.3.3 3.6 2 4 4.6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M4.5 20.5c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={10.5} cy={10.5} r={6.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M15.5 15.5 21 21" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/* ---------- Scanning ---------- */

const line = (color: ColorValue) => ({ fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export function CameraIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" {...line(color)} />
      <Circle cx={12} cy={13.2} r={3.6} {...line(color)} />
    </Svg>
  );
}

export function FileIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3h8l4 4v14H6z M14 3v4h4" {...line(color)} />
      <Path d="M9 12h6 M9 16h6" {...line(color)} />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" {...line(color)} strokeWidth={2.6} />
    </Svg>
  );
}

export function AgainIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19 12a7 7 0 1 1-2.05-4.95 M19 4v4h-4" {...line(color)} />
    </Svg>
  );
}

export function PlusIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14 M5 12h14" {...line(color)} />
    </Svg>
  );
}

export function CloseIcon({ size = 16, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12 M18 6L6 18" {...line(color)} strokeWidth={2.4} />
    </Svg>
  );
}

export function ZoomIcon({ size = 18, color, out }: IconProps & { out?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={10.5} cy={10.5} r={6.5} {...line(color)} />
      <Path d={out ? 'M15.5 15.5 21 21 M7.5 10.5h6' : 'M15.5 15.5 21 21 M7.5 10.5h6 M10.5 7.5v6'} {...line(color)} />
    </Svg>
  );
}

export function ScanIcon({ size = 44, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M6 15V8a2 2 0 0 1 2-2h7 M33 6h7a2 2 0 0 1 2 2v7 M42 33v7a2 2 0 0 1-2 2h-7 M15 42H8a2 2 0 0 1-2-2v-7" {...line(color)} strokeWidth={2.6} />
      <Path d="M14 17h20 M14 24h20 M14 31h13" {...line(color)} strokeWidth={2.2} />
    </Svg>
  );
}
