# Finish Cam locked prefs — build now (24 Oct 2026)

**Hermes (DeepSeek):** one focused task. Do **not** split into parallel agents. Do **not** redo bangAt clock sync, Analyse scrubber P0, lane guides, or YOLO helper (already on Sprint-Event / main).

Repo: `TimeTrial_tnf`. Branch: **`Sprint-Event`** (or current local Sprint worktree). Edit in place; leave git commit to the human unless they ask you to commit.

Plans live only under `TimeTrial_tnf/.cursor/plan` (no repo-root copies).

---

## Before coding — read end-to-end (find real paths in-repo)

1. Finish Cam page / record flow — Mark1 / Mark2, any ~1s post–Mark2 wait/pad (remove it), recording stop
2. Finish Cam Analyse — scrubber, ±0.5s buffer, Accept → sprint-finish POST
3. Any “rotate your phone” / landscape-only overlay or gate on Finish Cam, fullscreen, camera-test
4. Upload after finish capture — must become **snapshot still only**; find admin person-photo capture and mirror that pattern (dashboard-reviewable still; never upload video)
5. Starter race state — Arm / running / pause / ENDED / Reset; how Mark2 / finish currently signals Starter
6. Keyboard listeners (Space / hardware keydown); soft keyboard must not be the only path

Also skim: `lib/client/finish-cam.ts`, finish-analyse / analyse-time, starter page, any upload helpers used by admin photo.

Run: `npm test` (vitest) and keep `tsc` clean.

---

## Implement all six locks

### 1) Snapshot upload (not video)
- Edit/review stays on mobile.
- Upload **only** the snapped finish-line still (same pattern as admin person-photo capture).
- Snapshot reviewable later on the dashboard.
- Record locally for Analyse is fine; **never** POST/PUT video to server storage at any time.

### 2) Orientation
- Remove “rotate your phone” overlay / forced-landscape requirement.
- Portrait must work for record + Analyse (and fullscreen / camera-test).
- No landscape-only CSS gates that block vertical use.

### 3) Race end (Starter ↔ Finish Cam)
- **Mark 2 (exit)** ends the race clock — **not** Analyse Accept.
- Starter → **ENDED** (paused); **never** re-Arm / resume after that end.
- **Reset** stays intentional.
- Analyse is review-only — not the end trigger.

### 4) Hardware keys
- Mark 1 / Mark 2 also from **physical keyboard keydown** (e.g. Space on external keyboard on the phone).
- Listen for hardware `keydown`, not soft-keyboard-only input.

### 5) Mark modes (switchable UI)
Both modes accept on-screen buttons **and** hardware Space/keys:

- **(A) Two-press:** Mark1 enter / Mark2 exit. Space advances start → end.
- **(B) Single-press:** one press per sprinter as they cross; resolve finish with ~±0.5s Analyse buffer. Space logs each passer.

Persist the mode choice sensibly (e.g. localStorage keyed by event if that pattern already exists).

### 6) Mark timing
- **Two-press:** on Mark 2, **stop recording immediately** — remove the old ~1s post–Mark2 wait/pad.
- **Single-press:** keep ±0.5s Analyse buffer around the press (may keep recording briefly for that window only).
- Race timer ends on Mark 2 / single-press stop → Starter **ENDED**.

---

## Out of scope — do not touch
- bangAt / `startedAt` clamp / Starter optimistic bang UI
- YOLO / lane guides / Board LANE CSS / distance Timer semantics
- New server race states beyond ENDED behaviour above

---

## Done when (all must pass)
1. Snapshot-only upload; no video upload on finish flow.
2. No rotate-phone / forced-landscape gate on Finish Cam mobile paths.
3. Mark 2 (or single-press stop) → Starter ENDED; Analyse does not end the race; Reset still works.
4. Hardware Space/keys drive marks in both modes.
5. Modes A and B switchable; Mark2 has **no** extra post-wait; single-press keeps ±0.5s only.
6. `npm test` + `tsc` clean (note pre-existing failures; do not “fix” unrelated ones).

## Report back
Files touched; how snapshot mirrors admin person-photo; how Starter reaches ENDED; mode switch + hardware keys; leftover risk for multi-device race-day test.
