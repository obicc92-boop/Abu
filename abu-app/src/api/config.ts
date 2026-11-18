/** Phones talk to the live Worker (or EXPO_PUBLIC_API_URL, e.g. a local `wrangler dev`). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://solfascores.com').replace(/\/$/, '');

/** Where people open SolfaScores in a browser, for invite links. */
export const SITE_URL = 'https://solfascores.com';
