import type { PageText } from './pdf-text';

/** A page of a sheet, ready to cut lines from (a canvas in the browser). */
export interface ScanPage {
  canvas: unknown;
  width: number;
  height: number;
  /** A PDF page's own text and drawn lines (pdf-text.ts), for reading typed sheets without pictures. */
  text?: PageText;
  /** The page's pixels per PDF point, for placing what the text says on the picture. */
  pointScale?: number;
}

/** A line of music's place on its page, in the page's pixels. */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A line of music found on a page picture (page-lines.ts), with where its rows of words are. */
export interface FoundLine {
  box: Box;
  parts: string[];
  words: number;
  /** Each row of words, and which part's row it comes after (0 for the first part). */
  wordRows: { box: Box; after: number }[];
}
