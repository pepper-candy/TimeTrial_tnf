# Fix: Sprint start / finish clock — bang not late on 4G

**Hermes / any coding agent:** one focused task. Do **not** split into parallel agents. Do **not** touch YOLO, lane guides, Board LANE CSS, or distance Timer semantics.

Repo: `TimeTrial_tnf`. Branch: **`Sprint-Event`**. Prefer editing in place; leave git commit to the human (CMD) if asked.

**Before coding — read these files end-to-end:**

1. `app/e/[code]/starter/page.tsx` — `fireStart`, yellow “Starting race…”, `starting` guard  
2. `app/api/events/[code]/start/route.ts` — POST sets `startedAt = Date.now()` today; DELETE undo  
3. `lib/client/hooks.ts` — `useEvent` offset: `setOffset(data.now + (t1 - t0) / 2 - t1)` → `serverNow ≈ Date.now() + offset`  
4. `app/e/[code]/timer/page.tsx` — tap stamp pattern (`origin + performance.now() + offset`) for reference only  
5. `app/e/[code]/finish-cam/page.tsx` — `recServerAtRef = serverNowRef` at Record  
6. `lib/client/analyse-time.ts` (+ tests) — finish formula (do not change unless rename-only)  
7. `lib/client/bang-mic.ts` — onset only; **no** network inside mic code  

Run tests with: `npm test` (vitest).

---

## Problem (measured on race day)

On Starter (`/e/{code}/starter`), bang → yellow **“Starting race…”** for ~0.5–1s. Root cause:

1. Bang fires locally → `POST /api/events/{code}/start` with **empty body**.  
2. Server sets `startedAt = Date.now()` at **receive** time.  
3. On slow mobile data, receive is late → race clock starts **late** → every finish (`finish − startedAt`) is **shorter than reality**.

Ping / half-RTT in `useEvent` only builds **`offset`**. It does **not** fix stamping at POST arrival.

### Wrong “fixes” — do not do these

- `startedAt = recv - halfRTT` (or avg ping) on the server as the primary stamp  
- Bare phone `Date.now()` without `+ offset` as `startedAt`  
- Fake fixed subtract (e.g. always −500ms)  
- Waiting for POST success before flipping UI to running (kills realtime feel)  
- Changing mic onset / adding pitch / attack-foot traceback (out of scope)  
- Changing Finish Cam Mark1/Mark2 (they stay video-relative `performance.now()` deltas)  
- Changing distance Timer START behaviour  

### Correct approach

**Stamp the bang on the phone** in server-ms domain (`bangAt = Date.now() + offset`), POST `{ startedAt: bangAt }`, server **clamps** then stores. Optimistic UI on bang; rollback on fail.

Finish Cam already maps:

```text
tapT     = recServerAt + videoMs
finishMs = max(0, tapT − startedAt)
```

If `startedAt` is late, Accept times are systematically short even when marks are perfect.

---

## Product intent

- Stored race truth = server `startedAt` / finish ms (server **domain**).  
- Bang instant (mic onset) defines `startedAt`, not POST arrival.  
- Device wall clock may be wrong by seconds — **offset absorbs that**; still convert via offset.  
- Finish Cam `recServerAt` same domain (fresh offset before Record).  
- **Optimistic UI required** so Adrian can feel on 4G whether stamp works.  
- DELETE undo-start unchanged.

---

## Fix (required)

### 1) Starter — stamp bang, POST immediately, optimistic UI

In `fireStart` / bang handler:

1. **Before any `await`:**

   ```ts
   const bangAt = Math.round(Date.now() + offset);
   ```

   Pull `offset` from `useEvent` (Starter may only have `serverNow` today — add `offset`).

2. `POST /api/events/${code}/start` with JSON `{ startedAt: bangAt }` (`Content-Type: application/json`).  
3. `setStarting(true)` double-fire guard.  
4. **Optimistic (required):** immediately local `setEvent` → `status: "running", startedAt: bangAt`; clear yellow “Starting…” without waiting for network. On POST fail → **rollback** prior event + show error.  
5. Haptic + clear `starting` in `finally`. Reconcile with successful response body.

### 2) Server — prefer client bang, clamp

In `POST` `app/api/events/[code]/start/route.ts`:

- Parse body `startedAt` (number).  
- `const recv = Date.now()`  
- If client stamp finite:  
  `startedAt = clamp(client, recv - MAX_SKEW_MS, recv + SMALL_FUTURE_MS)`  
  Use `MAX_SKEW_MS = 3000`, `SMALL_FUTURE_MS = 250`.  
- If missing/invalid → `recv` (old behaviour).  
- **Not** `recv - halfRtt` as primary.  
- Keep idempotent: `startedAt: e.startedAt ?? startedAt`.  
- Return `{ event, now }` as today.

### 3) Finish Cam — same clock domain

- Before MediaRecorder start: ensure fresh offset (`refresh` if exposed, or recent poll).  
- `recServerAtRef.current = serverNowRef.current` — **never** bare `Date.now()` unless `serverNow` is 0.  
- Optional: one GET ping immediately before Record (one-line comment).  
- Do **not** change mark timing or `finishTimeFromVideoMs` formula.

### 4) Tests

- Unit tests: start-route clamp (client late / early / missing).  
- Confirm `analyse-time` still holds with an earlier corrected `startedAt`.  
- No e2e required. Run `npm test`.

---

## Out of scope

Multitask / YOLO / lane guides / Board LANE label / mic attack-foot / pitch / Admin Ready / PIN / measuring phone RTT from another machine.

---

## Done when

- [ ] POST body carries client `startedAt` via `offset` (server-ms domain).  
- [ ] Server persists clamped client stamp; receive = fallback only.  
- [ ] Optimistic UI on bang; yellow wait gone or tiny; rollback on fail.  
- [ ] With 500–1000ms artificial delay, stored `startedAt` near bang, not near receive.  
- [ ] Finish Cam `recServerAt` uses `serverNow`; marks still video-local.  
- [ ] DELETE undo-start still works; distance Timer unchanged.  
- [ ] `npm test` passes for touched tests.

## Commit message (human / CMD)

```text
fix(sprint): stamp Starter bang with clock offset, clamp on /start
```
