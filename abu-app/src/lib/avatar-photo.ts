/**
 * Choosing a profile picture (owner's request, 21 November 2026): a photo from the phone (its gallery or camera),
 * cut to a square from its middle and made at most 512 pixels across as a JPEG, tens of kilobytes, for phones on
 * little data; then sent with `api.setAvatar`. On phones without the web's canvas the photo goes as it is.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export const AVATAR_SIZE = 512;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The chosen photo, ready to send, or null if none was chosen. Throws with a message for a file that won't do. */
export async function pickAvatar(): Promise<{ image: Blob; type: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const a = result.assets[0];
  const original = a.file ?? (await (await fetch(a.uri)).blob());
  if (Platform.OS === 'web') {
    const square = await squareJpeg(original);
    if (square) return { image: square, type: 'image/jpeg' };
  }
  const type = (a.mimeType ?? original.type ?? '').toLowerCase();
  if (!TYPES.includes(type)) throw new Error('Choose a photo (JPEG, PNG or WebP).');
  if (original.size > 5 * 1024 * 1024) throw new Error('That photo is over 5 MB. Try a smaller one.');
  return { image: original, type };
}

/** The middle square of a picture, as a JPEG at most AVATAR_SIZE across (upright, as the camera took it). */
async function squareJpeg(file: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(AVATAR_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
  } catch {
    // A picture the browser can't open (an iPhone's HEIC on another browser): sent as it is, if it's a type that will do.
    return null;
  }
}
