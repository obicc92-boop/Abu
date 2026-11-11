# Abụ API (Cloudflare Worker)

One Worker, `abu`, at https://abu.adalingo.workers.dev:

- **Website:** the web build of `../abu-app` (`dist/`), served as static assets. Pages and files never run Worker code.
- **API:** everything under `/api/*`, built with [Hono](https://hono.dev).
- **Database:** D1 database `abu` (Western Europe, the closest location D1 offers to Nigeria), schema in `migrations/`.

## Run

```sh
npm install
npm test             # access rules and API, inside the Workers runtime with a local D1
npm run typecheck
npm run dev          # local Worker on http://localhost:8787 (build ../abu-app first for the pages)
npm run deploy       # build the web app, apply D1 migrations, deploy the Worker
npm run types        # regenerate worker-configuration.d.ts after changing wrangler.jsonc
```

Wrangler uses the Cloudflare account it's signed in to on this Mac. Tests never touch the real account.

## Who can see and change what

D1 has no row-level security, so every action in `src/domain/` checks access first (`src/domain/access.ts`). The rules come from the owner's decisions in `../CLAUDE.md`:

- Joining with a code is instant, unless the leader switches on approval. Someone waiting sees only the group's name.
- Only leaders change roles, approve members, plan services and song orders, and build the repertoire.
- Leaders mark anyone's attendance; part leaders mark only their own part.
- Self check-in needs the 4-digit code, which only leaders and part leaders can show. It works from 3 hours before the start to 6 hours after, and locks after five wrong codes.
- Practice is private. Leaders and part leaders see only totals per part (`partReadiness`).
- Songs are public, even signed out. Whoever shared a song, or anyone in the group it came from, can edit it.

The database itself guarantees what must never break: a group always keeps a leader, a song in a song order can't be deleted, and values stay valid.

`test/rules.test.ts` runs all of this as the prototype's personas (Emeka the choirmaster, Chiamaka the soprano part leader, and so on).

## Layout

- `src/index.ts`: the Hono app. Today: `/api/health`, `/api/songs`, `/api/songs/:id`. Routes for the rest come with sign-in (milestone 2).
- `src/domain/`: groups and people, songs and repertoire, events and replies, attendance and check-in, practice, notices.
- `src/errors.ts`: errors with an HTTP status and a message safe to show people.
- `migrations/`: D1 migrations, applied by `npm run deploy` (or `npm run db:migrate`).
