/**
 * Covers made by AI (Home's redesign, 25 November 2026): a square picture for a song, painted by Cloudflare's own
 * image model (Workers AI, the AI binding, FLUX.1 [schnell]) from the song's title and tags, and the creator's own
 * words for what it should show. Cloudflare's first, as with everything (the owner's rule); a picture costs a
 * fraction of a US cent. The daily allowance is in src/domain/covers.ts. Nothing a person sees names the model or
 * the company: messages say "the cover".
 */

/** Fast and cheap: 4 steps is the model's own default, and plenty for a painterly picture. */
export const COVER_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const STEPS = 4;

/** How the picture is made. The tests replace `make`, so they never reach the AI. */
export const coverMaker = {
  /** The picture for `prompt`, as the model gives it back (a JPEG). Throws if there's no picture. */
  async make(env: Env, prompt: string): Promise<Uint8Array> {
    const out = await env.AI.run(COVER_MODEL, { prompt, steps: STEPS });
    if (!out?.image) throw new Error('The image model answered without a picture.');
    return Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
  },
};

/** The creator's words for what the picture should show, at most this long. */
export const MAX_IDEA = 200;

/** Text as one tidy line: control characters (new lines, tabs and the like) become spaces, runs of spaces one. */
export const oneLine = (text: string) => text.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Tags as mood and scene, most telling first: a season or what the song is for says more than "Entrance", whose
 * church interior is only used when nothing else fits. Tags are compared ignoring case (as the library's filter does).
 */
const SCENES: { tags: string[]; scene: string }[] = [
  { tags: ['christmas', 'nativity', 'carol'], scene: 'a starry night, the nativity star, warm lamplight' },
  { tags: ['easter', 'resurrection'], scene: 'sunrise, white lilies, an empty tomb in morning light' },
  { tags: ['lent', 'lenten'], scene: 'muted purple, stillness, a quiet desert' },
  { tags: ['advent'], scene: 'candles, deep blue, a feeling of waiting' },
  { tags: ['pentecost', 'holy spirit'], scene: 'tongues of flame, rushing wind, deep red' },
  { tags: ['marian', 'mary', 'ave maria'], scene: 'blue and white, roses' },
  { tags: ['communion', 'eucharist'], scene: 'bread and a chalice, candlelight' },
  { tags: ['thanksgiving', 'harvest'], scene: 'a rich harvest, joyful colour' },
  { tags: ['praise', 'worship', 'praise and worship'], scene: 'bright and joyful, rays of light' },
  { tags: ['highlife'], scene: 'lively, dancing rhythm, bright colour' },
];
/** What a song is sung for in a service, and kinds of song, with nothing more to say than a church. */
const CHURCH = ['entrance', 'offertory', 'recessional', 'kyrie', 'gloria', 'sanctus', 'agnus dei', 'psalm', 'alleluia', 'creed', 'mass', 'hymn', 'anthem'];
const CHURCH_SCENE = 'a church interior with warm light';
/** Songs in a Nigerian language get the cloth of the region. */
const WEST_AFRICAN = ['igbo', 'yoruba', 'hausa'];
const TEXTILES = 'West African textile patterns (akwete, adire, aso-oke) and their colours woven into the design';
const STYLE = 'An elegant painterly illustration, rich warm colour, soft light, a simple centred composition';
const NO_TEXT = 'no text, no letters, no words, no watermark';

/**
 * What to ask the image model for: square album-cover artwork for a choir song, from its title and its tags as mood
 * and scene, led by the creator's own idea when they gave one. Always under 1,000 characters, and always asks for no
 * lettering (a title in a prompt tends to come out written on the picture). The composer isn't used: a name in a
 * prompt comes out as lettering or a made-up portrait.
 */
export function coverPrompt(song: { title: string; composer: string; tags: string[] }, idea?: string): string {
  const tags = new Set(song.tags.map((t) => oneLine(t).toLowerCase()));
  const scenes = SCENES.filter((s) => s.tags.some((t) => tags.has(t)))
    .map((s) => s.scene)
    .slice(0, 2);
  if (!scenes.length && CHURCH.some((t) => tags.has(t))) scenes.push(CHURCH_SCENE);
  const title = oneLine(song.title).slice(0, 120);
  const show = oneLine(idea ?? '').slice(0, MAX_IDEA);
  return [
    show && `Show: ${show}.`,
    `Square album cover artwork for a choir song, inspired by its title: ${title}.`,
    scenes.length ? `Mood and scene: ${scenes.join('; ')}.` : 'Mood: peaceful and uplifting.',
    WEST_AFRICAN.some((t) => tags.has(t)) && `${TEXTILES}.`,
    `${STYLE}; ${NO_TEXT}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** What kind of picture some bytes are, from their first bytes, or null if they aren't one SolfaScores serves. */
export function pictureType(bytes: Uint8Array): { type: string; ext: string } | null {
  const starts = (...b: number[]) => b.every((x, i) => bytes[i] === x);
  if (starts(0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' };
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { type: 'image/png', ext: 'png' };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}
