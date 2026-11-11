/** On the web the app and the API share one origin, so the API is just /api. */
export const API_URL = '';

/** Where people open Abụ in a browser, for invite links. */
export const SITE_URL = typeof window === 'undefined' ? 'https://abu.adalingo.workers.dev' : window.location.origin;
