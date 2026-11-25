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
  /** The picture for `prompt`: the model's JPEG, made 800 pixels across. Throws if there's no picture. */
  async make(env: Env, prompt: string): Promise<Uint8Array> {
    const out = await env.AI.run(COVER_MODEL, { prompt, steps: STEPS });
    if (!out?.image) throw new Error('The image model answered without a picture.');
    return smaller(env, Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0)));
  },
};

/** As wide as a cover the app sends from the phone (COVER_SIZE in abu-app/src/lib/avatar-photo.ts). */
export const COVER_WIDTH = 800;

/**
 * The model's picture is 1024 pixels across and about 650 KB, ten times a chosen picture: too much for a Home full
 * of covers on a phone's data. Cloudflare's Images binding makes it 800 across at JPEG quality 82 (about 100 KB);
 * each cover is one transformation (5,000 a month free, then US$0.50 per 1,000 on a paid plan; past the free ones
 * on the Free plan it fails rather than charges). If it fails, the picture is kept as the model made it.
 */
export async function smaller(env: Env, picture: Uint8Array): Promise<Uint8Array> {
  try {
    const result = await env.IMAGES.input(new Blob([picture]).stream())
      .transform({ width: COVER_WIDTH })
      .output({ format: 'image/jpeg', quality: 82 });
    const bytes = new Uint8Array(await result.response().arrayBuffer());
    return bytes.byteLength && bytes.byteLength < picture.byteLength ? bytes : picture;
  } catch (e) {
    console.warn('covers: kept the picture full size; it couldn’t be made smaller.', (e as Error).message);
    return picture;
  }
}

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
const NO_TEXT = 'no text, no letters, no words, no signature, no watermark';

/**
 * What to ask the image model for: square album-cover artwork for a choir song, from a scene written for it (by
 * `sceneWriter`, from its title) and its tags as mood and scene, led by the creator's own idea when they gave one.
 * Never the title itself: the model wrote titles on the pictures, and misspelt them ("Ammazing Grace", 25 November
 * 2026). Always under 1,000 characters, and always asks for no lettering. The composer isn't used: a name in a
 * prompt comes out as lettering or a made-up portrait.
 */
export function coverPrompt(song: { title: string; composer: string; tags: string[] }, idea?: string, scene?: string): string {
  const tags = new Set(song.tags.map((t) => oneLine(t).toLowerCase()));
  const scenes = SCENES.filter((s) => s.tags.some((t) => tags.has(t)))
    .map((s) => s.scene)
    .slice(0, 2);
  if (!scenes.length && CHURCH.some((t) => tags.has(t))) scenes.push(CHURCH_SCENE);
  const show = oneLine(idea ?? '').slice(0, MAX_IDEA);
  const picture = withoutTitle(oneLine(scene ?? ''), song.title).slice(0, 300);
  return [
    show && `Show: ${show}.`,
    picture ? `Square album cover artwork for a choir song: ${picture.replace(/[.\s]+$/, '')}.` : 'Square album cover artwork for a choir song.',
    scenes.length ? `Mood and scene: ${scenes.join('; ')}.` : 'Mood: peaceful and uplifting.',
    WEST_AFRICAN.some((t) => tags.has(t)) && `${TEXTILES}.`,
    `${STYLE}; ${NO_TEXT}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** A scene with the title taken out (and any quoted words), so the image model has nothing to write. */
function withoutTitle(scene: string, title: string): string {
  const t = oneLine(title);
  let out = scene.replace(/["“”‘’'«»][^"“”‘’'«»]{1,80}["“”‘’'«»]/g, '');
  if (t.length > 2) out = out.split(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join('');
  return out.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
}

/** The text model that writes the scene: the one scanning already uses (src/scan.ts). */
export const SCENE_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

/** How the scene is written. The tests replace `write`; when the AI can't, it's '' and the tags alone set the scene. */
export const sceneWriter = {
  /**
   * One sentence describing a picture for the song, from what its title means (translated if it isn't English, as
   * with Igbo and Yoruba titles), with no words in it. A collection is described by its tag.
   */
  async write(env: Env, song: { title: string; tags: string[] }, idea?: string, collection = false): Promise<string> {
    const about = collection
      ? `a collection of choir songs tagged "${oneLine(song.title)}" (a season, a part of the service, a language or a kind of song)`
      : `a choir song titled "${oneLine(song.title)}"${song.tags.length ? `, tagged ${song.tags.map(oneLine).join(', ')}` : ''}`;
    const prompt = `Describe in one sentence of at most 30 words a single painterly picture for the album cover of ${about}: what is in the picture, its light and its colours, drawn from what the title means (translate it first if it isn't English).${
      idea?.trim() ? ` The creator wants it to show: ${oneLine(idea).slice(0, MAX_IDEA)}.` : ''
    } Never quote or repeat the title, and never mention text, letters, words, signs or signatures. Answer with the sentence only.`;
    try {
      const out = (await (env.AI.run as (model: string, input: unknown) => Promise<unknown>)(SCENE_MODEL, {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 90,
        temperature: 0.6,
      })) as { choices?: { message?: { content?: string } }[]; response?: string };
      return oneLine(out?.choices?.[0]?.message?.content ?? out?.response ?? '').slice(0, 300);
    } catch (e) {
      console.warn('covers: no scene written; the tags set it', (e as Error).message);
      return '';
    }
  },
};

/** The prompt for a song's cover: a scene written from its title, then `coverPrompt`. */
export async function promptFor(env: Env, song: { title: string; composer: string; tags: string[] }, idea?: string, collection = false): Promise<string> {
  return coverPrompt(song, idea, await sceneWriter.write(env, song, idea, collection));
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
