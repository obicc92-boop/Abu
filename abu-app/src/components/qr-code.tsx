/** A QR code for a link, drawn as one SVG path, with the white border scanners need. */
import makeQr from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

const QUIET = 4;

export function QrCode({ value, size = 240, color = '#22160F' }: { value: string; size?: number; color?: string }) {
  const { path, count } = useMemo(() => {
    const qr = makeQr(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  const box = count + QUIET * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} accessibilityLabel="QR code">
      <Rect width={box} height={box} fill="#FFFFFF" />
      <Path d={path} fill={color} />
    </Svg>
  );
}
