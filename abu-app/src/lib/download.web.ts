/**
 * Downloads a file from Abụ's own API (signed in) without opening a blank tab:
 * a link with `download` saves it in place, and the session cookie goes with it.
 */
export function download(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
