# Sprint — Finish Cam Analyse (in-app YOLO + per-lane records)

Cursor subagent prompt. Scope: `/e/[code]/finish-cam` only. Client-side. Don’t break distance Timer/Marker.

**Roles reminder:** Starter = bang → server start. Finish Cam = record → marks → Analyse.

---

## Context (already built)

- Continuous record until **Mark 2 + 1s**, then stop → RACE END → **Analyse**.
- Keep `blobRef` (WebM) in memory after stop.
- Red centre **Finishing Line**; zoom on recorded stream.
- Race clock = server `startedAt` from Starter; soundtrack bang = weak TODO only.
- Sprint Board already shows lane · photo · name/SID · time (`—` until set).

---

## Task

Replace the Analyse stub with **in-app YOLO** on the Mark1–Mark2 slice, then write **one finish record per lane/runner**.

### A. Video window

1. Work entirely on Finish Cam (no Admin required for Analyse).
2. On Analyse, use slice **markInMs → markOutMs** (athletes in frame). The +1s pad stays on the saved blob; document that YOLO does **not** need the pad, or include it — pick one and stick to it (prefer Mark1…Mark2).
3. Optional: download full clip and/or sliced clip.

### B. In-app YOLO (client only)

1. Lazy-load a small person model on first Analyse (YOLOv8n ONNX via onnxruntime-web, or equivalent that builds cleanly with Next.js). Don’t load on create/board.
2. Model downloads once into the tab (~few–10+ MB). Helper pass after the race — **not** live during recording.
3. Sample every Nth frame on the slice; detect persons; map box → **lane** using the red finish line (+ lane bands if you add them).
4. Propose `lane N → finish time` = server `startedAt` + video offset at chest/box cross.
5. No server GPU, no Vercel Python worker in this task.
6. Manual edit/accept always wins over auto suggestions.

### C. Finish-frame snapshot + box (required UI)

For **each** lane suggestion, show the **exact video frame** used for that finish (the frame where the person box crosses the red finishing line, or the sampled frame closest to that cross):

1. Draw the **YOLO person bounding box** on that snapshot (canvas or overlay).
2. Draw/keep the **red finishing line** (and lane band guides if present) so the user can see why that lane/time was chosen.
3. Show lane label + proposed time next to / under the snapshot.
4. Tapping a suggestion row focuses that snapshot; scrubbing nearby frames is a nice-to-have, not required.
5. Manual edit still wins — snapshot is for confirm/reject, not auto-commit.

### D. Records (required — one per athlete)

1. For **each** lane/runner that finishes, create/update a **sprint finish record** (time + lane + runner id/bib) — not a single event-level timestamp.
2. Wire to existing store/API like distance taps → crossings: one result per person so Sprint Board times fill in.
3. Accepting a suggestion writes/updates **that lane only**; re-Analyse must not wipe other lanes’ times.
4. Lanes with no detection stay `—` until manual entry or a later accept.
5. UI: list per-lane suggestions (each with snapshot+box) → edit → Accept (batch or per row).

### E. Out of scope

- Live YOLO while recording
- Optical tele / WA photo-finish grade
- Changing Starter bang flow or distance Board

### Done when

Analyse loads model once → runs on Mark1–Mark2 in-page → shows per-lane time suggestions **each with that finish-frame snapshot and person box** → accept writes **one finish time per lane/runner** visible on Sprint Board. Distance flows untouched.

---

## Note for multitask

Run as its own agent after Starter + Finish Cam shell exist. Do not merge with create-UI or Board layout agents.
