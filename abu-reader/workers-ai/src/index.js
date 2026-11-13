/** POST {model, input} → {ok, ms, out} from env.AI.run(model, input), or {ok: false, error}. */
export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('POST {model, input}', { status: 405 });
    const { model, input } = await req.json();
    const t0 = Date.now();
    try {
      const out = await env.AI.run(model, input);
      return Response.json({ ok: true, ms: Date.now() - t0, out });
    } catch (e) {
      return Response.json({ ok: false, ms: Date.now() - t0, error: String((e && e.message) || e) });
    }
  },
};
