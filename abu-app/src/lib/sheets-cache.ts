/** Phones: sheets aren't kept for offline yet (the web app keeps them). */
export function connectionKind(): 'wifi' | 'cellular' | 'unknown' {
  return 'unknown';
}
export function browserSavesData(): boolean {
  return false;
}
export const canKeepSheets = () => false;
export async function keepSheets(_urls: string[]): Promise<number> {
  return 0;
}
export async function keptSheetCount(): Promise<number> {
  return 0;
}
export async function clearSheets(): Promise<void> {}
