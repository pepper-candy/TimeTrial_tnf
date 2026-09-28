# HKUST T&F Time Trial

Mobile-first web app for distance time trials. Two or three helpers: **Timer** (tap the line), **Marker** (assign bibs), **Board** (live dashboard). Built for the HKUST track & field club.

## Stack

- Next.js App Router, TypeScript, Tailwind
- **Upstash Redis only** for event state and runner photos (no Vercel Blob)
- Live updates via ~1s polling: one cheap version-key read per tick; full state only when it changed
- Serverless functions pinned to **Hong Kong (`hkg1`)**
- Vitest for lap / pairing / ranking logic

## Local

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Tap **Demo race** to seed 18 runners on a live 5k (no Redis required locally; state is stored in `.data/`).

## Vercel + Upstash setup

Functions are pinned to **Hong Kong (`hkg1`)** in `vercel.json` so Timer/Marker hops stay close to campus.

The Redis database is created in the **Upstash console** (society account), not via the Vercel Marketplace.

1. Push this repo and import it in Vercel.
2. In [Upstash Console](https://console.upstash.com/) → Redis → **Create database**:
   - Region: **Singapore** or **Tokyo** (closest to HK).
   - Copy **`UPSTASH_REDIS_REST_URL`** and **`UPSTASH_REDIS_REST_TOKEN`**.
3. In the Vercel project → Settings → Environment Variables, paste those two. (Optional fallback names `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work if you ever link a Marketplace store.)
4. Redeploy. **Do not add a Blob store** — photos live in Redis under `tt:photo:{eventId}:{runnerId}` and are served from `/api/photo/...` with a long immutable cache. Live polling never includes photo bytes.
5. Event keys expire after **21 days** (TTL refreshed on writes). Admin can **Delete** an event (and its photos) sooner.

Copy `.env.example` for local overrides. Redis is required in production; without it, each serverless instance has its own memory.

## How a race works

1. **Admin** creates an event (default **5000 m / 400 m track** = 12.5 laps, start at the 200 m mark, **13 finish-line crossings**). Share the 5-character code or QR.
2. Helpers join with the code and pick a role.
3. Admin adds runners (bib, name, student ID, optional photo — camera or upload, cropped/resized on-device to ~320px WebP, ~20–40 KB).
4. Admin or Timer hits **Start**. The race clock is a server timestamp; phones correct for clock offset.
5. **Timer**: full-screen tap on every crossing. Rapid taps (0.2s) count separately. Queued offline, retried, idempotent IDs. Undo last.
6. **Marker**: tap #n pairs with mark #n. First sightings use the on-screen pad (no native keyboard). After a runner has a crossing, tiles appear in **predicted next arrival** order (last time + recent lap). Finished bibs drop off. The strip at the top shows unmatched taps/marks; open it to delete, insert, swap, or reassign.
7. **Board**: leaderboard (most crossings, then earliest last time). Lapped runners show `−N lap`. Bell lap is highlighted. Tap a row for pace chart and splits.

## Demo race

**Demo race** on the home screen starts a simulated 5000 m with 18 club runners already several minutes in — finishers, bell lap, and lapped athletes — so Board and Marker can be tried without a track session.

## Scripts

| Command        | Purpose              |
| -------------- | -------------------- |
| `npm run dev`  | Dev server           |
| `npm test`     | Core timing tests    |
| `npm run build`| Production build     |
