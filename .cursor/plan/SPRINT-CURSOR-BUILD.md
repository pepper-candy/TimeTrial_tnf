# Sprint Timetrial — Cursor build brief (hand this to Cursor)

**Repo:** `pepper-candy/TimeTrial_tnf` (Next.js). Local path when online: `C:\Users\mongk\Desktop\tnf_working\TimeTrial_tnf`.

**Do not break** distance Timer / Marker / time-trial Board.

**Build order (P0 → P2):**
1. Finish Cam Analyse **scrubber + Set lane + Accept** (usable with zero YOLO)
2. Lane **perspective guides** (side-on: near = taller band)
3. Background **YOLOv8n** suggestions for unaccepted lanes only
4. Wire **one finish record per lane** → Sprint Board live times
5. Polish: snapshot+box, download clip, Help copy

Related docs in same folder / repo root:
- `SPRINT-COMPLETE-FLOW.md` — race-day end-to-end
- `SPRINT-FINISH-CAM-YOLO.md` — Analyse / YOLO / scrubber detail
- `SPRINT-CURSOR-SUBAGENTS.md` / `SPRINT-CURSOR-MULTITASK.md` — older splits (prefer this file + YOLO file)

---

## Locked product rules

| Rule | Detail |
|------|--------|
| Clock | Server `startedAt` from Starter bang (`POST /start`). Video = offset only. |
| Manual wins | Accept / Set lane always beats YOLO. |
| No wait | Analyse opens scrubber **immediately**; YOLO never blocks UI. |
| YOLO scope | Only lanes still `—` / not Accepted. Never overwrite. |
| Board | Lane · photo · name (SID) · time; sort by lane; Boys/Girls/All filter. |
| Model | YOLOv8n ONNX, lazy-load, webgpu→webgl→wasm. Client only. |
| Lane map | Draggable bands; side-on near lane = more vertical pixels. Map box **feet/bottom-centre**. |
| Roles | Admin create · Starter gun · Finish Cam record/analyse · Board display |

---

## Agent 1 — Finish Cam Analyse scrubber (P0)

Scope: `/e/[code]/finish-cam` only.

### Already there
- Continuous record → Mark1 / Mark2 +1s → stop → RACE END → Analyse stub
- `blobRef` WebM in memory; red finishing line; zoom
- Local mark offsets for YOLO window

### Build
1. On Analyse: play Mark1→Mark2 slice (prefer exclude +1s pad for “athletes in frame”).
2. Timeline scrub + frame step.
3. Red line overlay.
4. Lane picker 1…N + **Set finish here** → `time = f(startedAt, videoOffset)` using existing `recServerAt` alignment; document formula in code comment.
5. Per-lane rows: time · thumbnail · Edit / Clear / **Accept**.
6. Accept → existing sprint finish API / store (one record per lane/runner). Immediate Board update.
7. Optional download full or sliced WebM.

### Done when
Official can time every lane by scrub alone, Board fills, no YOLO required.

---

## Agent 2 — Lane guides (P0.5, can same PR as 1)

1. N draggable horizontal (side-on) or vertical (head-on) bands across finish line.
2. Preset toggle: **side-on** (taper: near larger) vs **head-on** (equal-ish).
3. Persist guides in localStorage per event code.
4. Show guides on record preview + Analyse.
5. YOLO (Agent 3) uses same polygons.

### Done when
Side-on camera: user can align bands to painted lanes without typing an angle.

---

## Agent 3 — Background YOLO (P1)

See `SPRINT-FINISH-CAM-YOLO.md` §§C–E + C2.

1. Lazy-load on first Analyse; progress chip “YOLO scanning…”.
2. Worker preferred; every Nth frame; person class only.
3. Cross red line → propose lane from guides + time.
4. Suggestion UI: snapshot + person box + Accept (skip if lane locked).
5. No server GPU / no Vercel Python.

### Done when
YOLO fills leftover lanes; never fights Accepted times.

---

## Agent 4 — Board / Admin glue (verify)

1. Sprint Board already lane-sorted — confirm Accept writes visible times.
2. Help page: one paragraph race-day roles + link to flow.
3. Create/share QR unchanged unless broken.

---

## Out of scope (all agents)

Live YOLO while recording · full NLE deps · WA photo-finish · changing distance flows · soundtrack bang as clock.

---

## How Adrian will use this

1. Offline PC now — briefs live on Grok Bot box.
2. Tomorrow: ask Grok Bot to **pull markdowns to Desktop PC**.
3. In Cursor: open `SPRINT-CURSOR-BUILD.md` (+ YOLO file) as subagent prompts in order P0→P1.
4. Push sprint branch to `pepper-candy/TimeTrial_tnf` when ready for cloud agent.

