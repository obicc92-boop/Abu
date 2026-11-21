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

/** Add a song's ways in (the design canvas's "One place to add a song" board). */
export function PencilIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" {...line(color)} />
    </Svg>
  );
}

export function ScanLineIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M4 12h16" {...line(color)} />
    </Svg>
  );
}

export function ClipboardIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 4h6v3H9z M8 5.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-2 M9 12h6 M9 16h4" {...line(color)} />
    </Svg>
  );
}

export function ChevronIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.5 6l6 6-6 6" {...line(color)} strokeWidth={2.2} />
    </Svg>
  );
}

/** The profile's settings rows (src/app/(tabs)/me.tsx). */
export function MoonIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" {...line(color)} />
    </Svg>
  );
}

export function StageIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 4.5h16v11H4z M12 15.5V20 M8 20h8 M8 8.5h8 M8 11.5h5" {...line(color)} />
    </Svg>
  );
}

export function DownloadIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 20h14" {...line(color)} />
    </Svg>
  );
}

export function PhoneIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3z M11 18h2" {...line(color)} />
    </Svg>
  );
}

export function MailIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 6h16v12H4z M4.5 7l7.5 6 7.5-6" {...line(color)} />
    </Svg>
  );
}

export function LockIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3 M5.5 11h13v9h-13z" {...line(color)} />
    </Svg>
  );
}

export function SignOutIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 4h5v16h-5 M9.5 8 5.5 12l4 4 M5.5 12H15" {...line(color)} />
    </Svg>
  );
}
