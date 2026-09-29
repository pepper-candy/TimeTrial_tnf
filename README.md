# HKUST T&F Time Trial

Mobile-first web app for distance time trials. Two or three helpers: **Timer** (tap the line), **Marker** (assign bibs), **Board** (live dashboard). Built for the HKUST track & field club.

## Stack

- Next.js App Router, TypeScript, Tailwind
- **Upstash Redis only** for event state and runner photos (no Vercel Blob)
- Live updates via ~1s polling: one cheap version-key read per tick; full state only when it changed
- Serverless functions pinned to **Hong Kong (`hkg1`)**
- Vitest for lap / pairing / ranking / results-text logic

## Local

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Tap **Demo** to seed an 18-runner 5000 m (no Redis required locally; state is stored in `.data/`). The Board is public; Timer / Marker / Admin use helper PIN `1234` (remembered on that device). Play at **10x** (default) or **1x** from Admin.

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

### Optional: owner master key (`ADMIN_MASTER_KEY`)

For when an organiser forgets the helper PIN and the creating phone is gone.

1. Vercel → Settings → Environment Variables → add **`ADMIN_MASTER_KEY`** with a long random value (**at least 12 characters**; shorter values are ignored). Redeploy.
2. On any PIN screen (Timer, Marker, Admin), tap **Key**, enter the master key, **Unlock**. That device remembers the key.
3. In **Admin**, tap the PIN tile to reveal it, or **Reset PIN** to set a new one.

The key is only read from the environment. It is never stored in the repo or sent to other clients. Leave it unset to disable master unlock.

## How a race works

1. **Admin** creates an event (default **5000 m / 400 m track** = 12.5 laps, start at the 200 m mark, **13 finish-line crossings**) and sets a **helper PIN**. Share:
   - **Board** — public read-only `/e/{code}/board` (no PIN). Spectators can open this on any phone.
   - **Helper code** — Timer, Marker, and Admin unlock once per device with the PIN. Admin shows the code and PIN (tap to reveal, copy). **Share helper** copies one link, the same URL as the Helper QR (`/e/{code}/help`, no PIN). That page is two buttons, Timer and Marker; the PIN pad is the one already on those tools. The phone that created an event remembers it quietly, so Admin opens there without retyping the PIN. Home does not list past codes.
2. Admin adds runners (bib, name, student ID, optional **Boys** / **Girls** chip — tap again to clear — optional photo). Older events with custom categories load with no category. Admin can hide student IDs on the public board.
3. Admin or Timer hits **Start**. The race clock is a server timestamp; phones correct for clock offset.
4. **Timer**: full-screen tap on every crossing. Rapid taps (0.2s) count separately. Queued offline, retried, idempotent IDs. Undo last.
5. **Marker**: mark #n pairs with tap #n. The pad is the only input. Bibs are zero-padded to the longest roster bib, and the mark is saved when that many digits are typed. Delete a row to drop a bib; Undo puts it back. Photos in the list are not tappable.
6. **Board**: bowling-scoreboard grid, one row per runner (rank, photo, bib, name), one column per crossing, big **Total** at the right. Each cell shows the lap split small on top and the running time big below; the menu (⋯) swaps which is big (remembered on the device). The race's fastest lap has a filled orange ring, each runner's own best lap has a blue ring, and edited or estimated (~) crossings have a yellow corner flag. Rows re-rank with an animated swap. Filter **All / Boys / Girls**. Lapped runners show `−N laps`. Bell lap is highlighted. On phones the grid scrolls sideways with name and Total pinned; on a laptop or TV it fills the screen.
7. **End race** (Admin) freezes the clock and keeps unfinished runners at their last crossing / partial laps (e.g. `11.5 laps`).
8. **Stats** (PIN): **Copy results** pastes WhatsApp-ready text (per-category rank for Girls / Boys, `M'SS` times, 1K/3K splits, avg /K). CSV export is still there.

On a default 5000 m / 200 m start, 1K is crossing #3 and 3K is crossing #8. Other distances include whichever whole-km marks land on a crossing; Admin can pick which km appear in the **Summary** paste. **Copy results** has Summary (coach format) and Detailed (every km, ~ if estimated, fast/slow lap, half-split, consistency).

## Demo race

**Demo race** starts a simulated 5000 m from the gun, using realistic 28 Sep 2026 club times with **fake names and fake 8-digit student IDs**. Default playback is **10x**; switch to **1x** in Admin. Helper PIN is `1234`.

## Scripts

| Command        | Purpose              |
| -------------- | -------------------- |
| `npm run dev`  | Dev server           |
| `npm test`     | Core timing tests    |
| `npm run build`| Production build     |
