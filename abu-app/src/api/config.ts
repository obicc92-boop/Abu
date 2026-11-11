/** Phones talk to the live Worker (or EXPO_PUBLIC_API_URL, e.g. a local `wrangler dev`). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://abu.adalingo.workers.dev').replace(/\/$/, '');

/** Where people open Abụ in a browser, for invite links. */
export const SITE_URL = 'https://abu.adalingo.workers.dev';
