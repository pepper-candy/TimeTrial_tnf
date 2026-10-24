# Finish Cam locked prefs (24 Oct 2026) — build when Adrian says go

Source: Main Bot profile locks from 23–24 Oct 2026 chat. Do not start a Cursor agent until he confirms the last note and says to build. Save any plan under `TimeTrial_tnf/.cursor/plan` only (no repo-root copies).

## Snapshot upload (not video)
- Edit/review stays on mobile.
- Upload only the snapped finish-line still (same pattern as admin person-photo capture).
- Snapshot reviewable later on the dashboard.
- Never upload video at any time.

## Orientation
- Remove “rotate your phone” overlay / forced landscape.
- Portrait must work for record + Analyse (and fullscreen / camera-test paths).

## Race end (Starter ↔ Finish Cam)
- Mark 2 (exit) ends the race clock.
- Starter goes ENDED (paused); never re-Arm / resume after that.
- Reset stays intentional.
- Analyse is review only — not the end trigger.

## Hardware keys
- Mark 1 / Mark 2 also from physical keyboard keydown (e.g. Space on an external keyboard), not the soft keyboard.

## Mark modes (switchable)
- (A) Two-press: Mark1 enter / Mark2 exit window. Space advances start/end marks.
- (B) Single-press: one press per sprinter as they cross; resolve finish with ~±0.5s Analyse buffer. Space logs each passer.

## Mark timing
- Two-press: on Mark 2, stop recording immediately — remove the old ~1s post–Mark 2 wait/pad.
- Single-press: keep ±0.5s Analyse buffer around the press (may keep recording briefly for that window only).
- Race timer still ends on Mark 2 / single-press stop → Starter ENDED.

## Already on Sprint-Event / main (do not redo)
- bangAt clock sync (PR #11 / commit e582b55): client bangAt + /start clamp + Finish Cam offset refresh before Record.
- Analyse scrubber P0, lane guides, background YOLOv8n helper (earlier Sprint Agents).

## Open before build
- Adrian said he had one more note before the build — capture that note first.
- P0 still needs multi-device race-day test after the build lands.
