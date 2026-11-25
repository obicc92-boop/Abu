/**
 * The glow colour of a cover picture, on the web: the picture drawn small on a canvas and its pixels averaged
 * (`averageColour` and `glowFrom` in src/lib/cover-look.ts). Each picture is read once; a picture from another
 * address that won't let its pixels be read gives none, and the drawn cover's colour is used.
 */
import { useEffect, useState } from 'react';

import { averageColour, glowFrom } from './cover-look';

const known = new Map<string, string | null>();

function readColour(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 12, 12);
    const [r, gr, b] = averageColour(g.getImageData(0, 0, 12, 12).data);
    return glowFrom(r, gr, b);
  } catch {
    return null;
  }
}

export function useCoverColour(uri: string | null): string | null {
  // The colour read for a picture, once it has loaded (pictures read before come straight from `known`).
  const [read, setRead] = useState<{ uri: string; colour: string | null } | null>(null);
  useEffect(() => {
    if (!uri || known.has(uri)) return;
    let live = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const colour = readColour(img);
      known.set(uri, colour);
      if (live) setRead({ uri, colour });
    };
    img.onerror = () => known.set(uri, null);
    img.src = uri;
    return () => {
      live = false;
    };
  }, [uri]);
  if (!uri) return null;
  return known.get(uri) ?? (read?.uri === uri ? read.colour : null);
}
