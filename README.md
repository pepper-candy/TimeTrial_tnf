# HKUST T&F Time Trial

Mobile-first web app for the HKUST track & field club. Supports two event types on the same stack:

- **Distance time trial** — Timer (tap the line), Marker (assign bibs), Board (live dashboard).
- **Sprint** — Starter (arm → bang → server race start) + Finish Cam (record → marks → Analyse with optional on-device YOLO).

## Stack

- Next.js App Router, TypeScript, Tailwind
- **Upstash Redis only** for event state and runner photos (no Vercel Blob)
- Live updates via ~1s polling: one cheap version-key read per tick; full state only when it changed
- Serverless functions pinned to **Hong Kong (`hkg1`)**
- Vitest for lap / pairing / ranking / results-text / miss-guess / grouping / sprint timing logic
- Sprint Finish Cam: **MediaRecorder** + optional **YOLOv8n** (ONNX) in the browser via **onnxruntime-web**

## Local

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Tap **Demo** to seed an 18-runner 5000 m (no Redis required locally; state is stored in `.data/`). The Board is public; Timer / Marker / Admin / Starter / Finish Cam helpers use helper PIN `1234` (remembered on that device). Distance demo play is **10x** (default) or **1x** from Admin.

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

---

## How a distance race works

1. **Admin** creates an event (default **5000 m / 400 m track** = 12.5 laps, start at the 200 m mark, **13 finish-line crossings**) and sets a **helper PIN**. Share:
   - **Board** — public read-only `/e/{code}/board` (no PIN). Spectators can open this on any phone.
   - **Helper code** — Timer, Marker, and Admin unlock once per device with the PIN. Admin shows the code and PIN (tap to reveal, copy). **Share helper** copies one link, the same URL as the Helper QR (`/e/{code}/help`, no PIN). That page is two buttons, Timer and Marker; the PIN pad is the one already on those tools. The phone that created an event remembers it quietly, so Admin opens there without retyping the PIN. Home does not list past codes.
2. Admin adds runners (bib, name, student ID, optional **Boys** / **Girls** chip — tap again to clear — optional photo). Older events with custom categories load with no category. Admin can hide student IDs on the public board. After the gun, **Fix** on a runner opens their crossings: **DNF** (tap again to clear), **↑ Insert above** / **↓ Insert below** (estimated time = midpoint of this split and the previous / next; above the first split is halfway from the gun), or **Insert crossing** at the expected next time. A DNF runner gets ❌ on their photo everywhere (Admin, Marker, Bell, Board, Records) and a **DNF** status on the board; the rank chip stays on top of that overlay. Miss-guess and hold-Miss “add all” skip them after the DNF time (a miss whose tap is *before* DNF can still list them).
3. Admin hits **READY** (irreversible, green). Timer stays **WAITING** until then, then **Start**. The race clock is a server timestamp; phones correct for clock offset.
4. **Timer**: one full-height **TAP**. The header is the race clock plus taps·bibs *since the last sync*. The list is newest first: index, split, cumulative, delete (soft). Pack grouping is a thick green bar on the left. After 4s with no tap, TAP reads **Grouping in N**, then **Make Grouping (HOLD)**; hold ~0.5s to start a new pack. Grey TAP reads **Idle**. Quick taps still count separately. They queue offline, retry, and keep their ids.
5. **Marker**: mark #n pairs with tap #n. The pad is the only input. Bibs are zero-padded to the longest roster bib, and the mark is saved when that many digits are typed. **Miss** writes `?`. Hold Miss ~2s to append every still-racing bib. **0** types a zero; hold ~0.5s for **Make Grouping (HOLD)** (same pack bars as Timer). **?** in the header filters misses and unknown bibs. **Sync** (cycling arrows, left of back) draws a cutoff so the next tap and bib pair together even if counts differed — both sides pad to `max(taps, bibs)`, helpers hide the pads (numbers jump), Records keeps the empty slots, and the header counts reset. Sync is off when there is nothing new. Tap a miss or unknown row for up to three likely runners (expected arrival vs that tap’s time): photo+bib in the **1–4–7 / 2–5–8 / 3–6–9** columns, **Return** restores the pad, a pick fills the prompt, **Modify** overwrites that `?` in place (it does not insert another mark). Delete a row to drop a bib.
6. **Records** (Admin): **Modify records** opens one row per crossing. The left side is timer tap n (cumulative and split); the right side is marker bib n. Pack bars sit left of times and right of bibs and run through a group; the last bar in a pack stops at the card. A missing tap or bib is an empty slot. A blue cutoff line marks a Marker Sync. Suspicious rows carry a short tag (too fast, too slow, unknown bib, no tap, no bib, duplicate, edited). **All / Flagged** filters the list. Delete, edit the time or bib, or insert either side — insert shifts later pairs. A dot on the button means the tap and bib counts differ. The keypad tray matches Marker. The board does not show these tags.
7. **Board**: bowling-scoreboard grid, one row per runner (rank, photo, bib, name), one column per crossing, big **Total** at the right. Each cell shows the lap split small on top and the running time big below; the menu (⋯) swaps which is big (remembered on the device). The race's fastest lap fills that cell orange, and each runner's own best lap has a blue border. An estimated time keeps a ~. Live taps are not marked as edits. Rows re-rank with an animated swap. Filter **All / Boys / Girls**. Lapped runners show `−N laps`. Bell lap is highlighted. DNF rows show **DNF** and ❌ on the photo. On phones the grid scrolls sideways with name and Total pinned; on a laptop or TV it fills the screen.
8. **End race** (Admin) freezes the clock and keeps unfinished runners at their last crossing / partial laps (e.g. `11.5 laps`).
9. **Results** (PIN): Summary is a compact table (rank, bib, name, category, laps, time, avg/K, gap). Detailed adds kilometre columns (`~` if that km is estimated), fastest and slowest lap, half splits and consistency, and scrolls sideways with rank, bib and name pinned. DNF runners get a **DNF** chip. The monospace box under the table is exactly what **Copy** pastes. Copy stays the same width and reads **✓ Copied**. CSV export is still there. A split quicker than 20s per 400 m is not a best lap, last lap, or speed.

On a default 5000 m / 200 m start, 1K is crossing #3 and 3K is crossing #8. Other distances include whichever whole-km marks land on a crossing; Admin can pick which km appear in the **Summary** paste. **Copy** has Summary (coach format) and Detailed (every km, ~ if estimated, fast/slow lap, half-split, consistency).

---

## Sprint events

Sprint is an **additive** create mode, not a replacement for distance Time Trial. Same create / PIN / share-helper pattern; helper hub `/e/{code}/help` exposes **Starter** and **Finish Cam**. Sprint Board shows lane · photo · name/SID · finish time (`—` until set). Sprint clocks display **2 decimal places**.

### Roles

| Role | Route | Job |
| ---- | ----- | --- |
| **Starter** | `/e/{code}/starter` | Arm → bang → POST `/start` with client `startedAt` in server-ms domain; race clock runs until Finish Cam ends the heat; **ENDED** + Reset for the next heat (no re-Arm after finished). |
| **Finish Cam** | `/e/{code}/finish-cam` | Continuous camera record; mark athletes; stop ends the race clock; **Analyse** is review-only (scrub + Set/Accept + optional YOLO). |
| **Board** | `/e/{code}/board` | Live sprint results. |

Portrait and landscape both work on Finish Cam (no rotate-phone gate).

### Clock sync (why bang and video share one timeline)

Phones disagree on wall clock. `useEvent` **pings** the server (half-RTT) and builds:

`offset ≈ serverNow + RTT/2 − localNow` → `serverNow ≈ Date.now() + offset`

- **Starter** stamps the bang as `bangAt = Date.now() + offset`, POSTs `{ startedAt: bangAt }`; server **clamps** then stores. Optimistic UI on bang; rollback on fail.
- **Finish Cam** calls `refresh()` immediately before `MediaRecorder.start()` and stores **`recServerAt`** in that same server-ms domain (never bare `Date.now()` alone).

Marks / scrubber times are **video-local offsets** (`videoMs`). Race elapsed time is derived, not read from the clip soundtrack.

### Finish time formula

In `lib/client/analyse-time.ts`:

```text
tapT     = recServerAt + videoMs − FINISH_TIME_CALIBRATION_MS
finishMs = max(0, tapT − startedAt)
```

- `startedAt` — Starter bang (server)
- `recServerAt` — Finish Cam record start (server-ms)
- `videoMs` — offset into the recording (scrubber / mark / YOLO cross)
- `FINISH_TIME_CALIBRATION_MS = 100` — flat **−0.10 s** so shown times match an external timer (mic+Space calibration: record was ~0.09–0.10 s late; mean ~0.096 s)

`videoMsFromFinishMs` adds the 100 ms back when seeking to a saved finish. **Set / Accept / YOLO / live scrubber label** all use the same helpers.

### Finish Cam mark modes

Switchable until the first Mark / passer press (recording alone does not lock the mode):

| Mode | Behaviour |
| ---- | --------- |
| **Two-press** | Mark 1 = enter window; Mark 2 = exit and **stop recording immediately** (no extra wait after Mark 2). Race timer ends on Mark 2. |
| **Single-press** | One press per sprinter (lane order). Stop ends the heat. Analyse uses a **±0.5 s** buffer around presses. **YOLO is skipped** in this mode. |

Hardware **Space** (and configured keys) advance marks the same as the on-screen buttons.

### Side-on lane guides

Sprint Finish Cam is **side-on only** (head-on preset hidden; any saved head-on guides migrate on load).

- Lanes = **horizontal bands** (far / top thinner → near / bottom taller — never equal 1/N as the only side-on default).
- One **vertical** red finishing line at frame centre (`FINISH_LINE_X = 0.5`).
- Drag blue handles on the line to match painted lanes; guides persist in `localStorage` per event.

YOLO does **not** crop the video to a band. It detects people on full Mark1…Mark2 frames, then maps each box by **feet / bottom-centre** into a band. A body whose feet land in the wrong band can be assigned to the wrong lane — calibrate guides carefully. Manual Set/Accept always wins.

### Analyse UX

1. After RACE END, **Analyse** opens the Mark1…Mark2 scrubber **immediately** (no YOLO wait).
2. Scrub / frame-step / Play; pick lane with a single **L# ⇌** cycle switch; **Set finish here**.
3. Per-lane table: thumb · athlete · time · Edit / Clear / Accept. Accept writes the Board and uploads a **finish-frame snapshot only** (never the full video).
4. Tap a row thumb → snapshot fills the preview (**Lane N · time**). Scrubber greys out. **Tap preview / continue editing** dismisses the still and **seeks the scrubber to that snapshot’s video time** so officials can fine-adjust from the same frame.
5. Download (MP4 when recorder supports it, else WEBM) appears **only after Analyse has started**, outermost top-right.

### YOLO helper (background)

- Model: **YOLOv8n** ONNX at `/models/yolov8n.onnx`
- Runtime: **onnxruntime-web**, providers **WebGPU → WebGL → WASM**
- Lazy-load on first Analyse; progress chip `YOLO scanning…` / `YOLO done a/b`
- Samples ~every **80 ms** on Mark1…Mark2 only (not the whole roll; not the +pad when present)
- Per lane: track box **mid-X (`chestX`)** vs the finish line; interpolate the cross; fallback = closest-to-line sample within ~8% of frame width
- Proposes only into **empty / unlocked** lanes (`canProposeLaneFinish`); never overwrites Accepted or manual Set

### Seekable download (Android Gallery)

Chunked `MediaRecorder` WebM often lacks **Duration + Cues**, so Gallery shows ~1 s and cannot scrub. Finish Cam:

- Starts the recorder **without timeslice**
- Runs **`ts-ebml`** post-process to inject Duration/Cues before download (`makeGalleryFriendlyClip`)

Renaming `.webm` → `.mp4` alone does **not** fix this.

### Key sprint files

| Path | Role |
| ---- | ---- |
| `app/e/[code]/starter/page.tsx` | Bang UI, ENDED + Reset |
| `app/e/[code]/finish-cam/page.tsx` | Record, marks, stage preview, download gate |
| `components/finish-analyse.tsx` | Scrubber, lane switch, table, YOLO orchestration |
| `components/lane-guides.tsx` + `lib/client/lane-guides.ts` | Side-on bands, load/migrate, draw on snapshots |
| `lib/client/analyse-time.ts` | `finishTimeFromVideoMs` / calibration / propose gates |
| `lib/client/analyse-finish.ts` | YOLO sample loop + cross detection |
| `lib/client/yolo-person.ts` | ONNX session + person boxes |
| `lib/client/hooks.ts` | Half-RTT `offset` / `refresh` |
| `lib/start-clock.ts` | Server clamp for client `startedAt` |

---

## Demo race

**Demo race** starts a simulated 5000 m from the gun, using realistic 28 Sep 2026 club times with **fake names and fake 8-digit student IDs**. Default playback is **10x**; switch to **1x** in Admin. Helper PIN is `1234`.

## Scripts

| Command         | Purpose           |
| --------------- | ----------------- |
| `npm run dev`   | Dev server        |
| `npm test`      | Core timing tests |
| `npm run build` | Production build  |
