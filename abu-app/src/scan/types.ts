/** A page of a sheet, ready to cut lines from (a canvas in the browser). */
export interface ScanPage {
  canvas: unknown;
  width: number;
  height: number;
}

/** A line of music's place on its page, in the page's pixels. */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
