/**
 * The glow colour of a cover picture (Home's top takes it from the song in front). Phones don't read a picture's
 * pixels yet, so they glow in the drawn cover's colour instead (src/lib/cover-colour.web.ts reads the picture).
 */
export function useCoverColour(_uri: string | null): string | null {
  return null;
}
