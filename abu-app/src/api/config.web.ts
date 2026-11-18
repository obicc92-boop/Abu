/** On the web the app and the API share one origin, so the API is just /api. */
export const API_URL = '';

/** The app's own address. */
const HOME = 'https://solfascores.com';

/**
 * Where people open SolfaScores in a browser, for invite and share links: this page's own
 * address (so a local build links to itself), except on the old address, abu.adalingo.workers.dev,
 * whose links should open the new one.
 */
export const SITE_URL =
  typeof window === 'undefined' || window.location.hostname.endsWith('.workers.dev') ? HOME : window.location.origin;
