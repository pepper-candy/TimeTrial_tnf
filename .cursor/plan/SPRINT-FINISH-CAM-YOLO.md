# Sprint — Finish Cam Analyse (in-app YOLO + per-lane records)

Cursor subagent prompt. Scope: `/e/[code]/finish-cam` only. Client-side. Don’t break distance Timer/Marker.

**Roles reminder:** Starter = bang → server start. Finish Cam = record → marks → Analyse.

**UX rule (locked):** Humans must **not wait** for YOLO. Scrub + set finishes is available **immediately**; YOLO is a background helper that only fills **unaccepted** lanes.

---

## Context (already built)

- Continuous record until **Mark 2 + 1s**, then stop → RACE END → **Analyse**.
- Keep `blobRef` (WebM) in memory after stop.
- Red centre **Finishing Line**; zoom on recorded stream.
- Race clock = server `startedAt` from Starter; soundtrack bang = weak TODO only.
- Sprint Board already shows lane · photo · name/SID · time (`—` until set).

---

## Task

Replace the Analyse stub with **manual video scrubber first** + **background YOLO** on Mark1–Mark2, then write **one finish record per lane/runner**.

### A. Video window

1. Work entirely on Finish Cam (no Admin required for Analyse).
2. On Analyse, use slice **markInMs → markOutMs** (athletes in frame). The +1s pad stays on the saved blob; YOLO prefers Mark1…Mark2 (no pad).
3. Optional: download full clip and/or sliced clip.

### B. Manual scrubber (ship first — zero wait)

Build a **lightweight finish editor**, not a full NLE. Prefer native `<video>` + custom timeline over heavy libs (LabelU / Twick / Elah are reference only).

**UI (always ready the moment Analyse opens):**
1. Play / pause the Mark1–Mark2 slice.
2. Timeline scrubber (seek); **frame step** ←/→ (or buttons) for near-frame accuracy.
3. Red finishing line overlay on the video (same as record UI).
4. Lane picker (1…N) + **Set finish here** → time = `startedAt` + current video offset; show snapshot of that frame.
5. Per-lane list: time · thumbnail · Edit / Clear / Accept.
6. Accept writes that lane’s record **immediately** (don’t wait for YOLO).

Inspiration (patterns only — don’t vendor whole apps):
- Timeline + markers: Accurate Player marker demo mindset (in/out + M)
- Frame step + boxes: [jpcarvallyo/frame_labeler](https://github.com/jpcarvallyo/frame_labeler)
- Annotation timeline idea: Labelbox / LabelU video editors

### C. Background YOLO (helper — never blocks UI)

1. Lazy-load YOLOv8n ONNX (onnxruntime-web) on first Analyse; webgpu → webgl → wasm.
2. Start detection **in parallel** as soon as Analyse opens (Web Worker if easy). Show a small progress chip: “YOLO scanning…”.
3. Sample every Nth frame; map person box → lane via red line (+ lane bands).
4. When a lane suggestion is ready: if that lane is **not yet Accepted** (and not manually Set/locked), show suggestion + finish-frame snapshot with **person box** drawn. If lane already Accepted/manual, **skip / do not overwrite**.
5. Re-Analyse / YOLO complete: only fill remaining `—` / unaccepted lanes.
6. Manual edit/accept always wins. No server GPU.


### C2. Lane geometry (don’t equal-split the screen)

Equal 50/50 (or 1/N) screen splits only work for a near **head-on / along-finish** camera. A **lateral (side-on) runway** view has perspective: the lane **closest to the camera owns more vertical pixels**; far lanes are thinner bands. Trapezoids, not equal strips.

**Do this instead of asking for camera angle degrees:**
1. Before/during record (or once on Analyse), show **N draggable lane guides** across the red finishing line (horizontal bands if side-on; vertical if end-on).
2. Default for side-on: nearer lane = larger share (simple linear or 1/z style taper). User drags boundaries to match painted lane lines on the track.
3. Persist guide positions for the event/session (localStorage OK).
4. YOLO maps each person box using **feet / bottom-centre of box** (or chest on the red line) → which polygon/band contains that point — not “which half of the frame the whole box covers”.
5. Optional label: “Camera view: side-on / head-on” only as a **preset for guide layout**, not a required angle number.

If guides are wrong, human scrub + Set lane still wins — YOLO is helper only.

### D. Finish-frame snapshot + box

For each suggestion (YOLO or after manual Set): show that frame with red line (+ box for YOLO). Tap row → focus that snapshot. Scrub nearby = nice-to-have.

### E. Records (one per athlete)

1. Each Accept/Set → create/update **that lane only** (time + lane + runner id/bib).
2. Re-Analyse / YOLO must not wipe other lanes’ times.
3. Lanes with nothing stay `—` until manual or later YOLO accept.

### F. Out of scope

- Live YOLO while recording
- Full video editor / multi-track NLE dependency
- Optical tele / WA photo-finish grade
- Changing Starter bang or distance Board

### Done when

Analyse opens **usable scrubber immediately** → user can Set/Accept finishes while YOLO runs → YOLO only proposes **unaccepted** lanes with snapshot+box using **calibrated lane bands** (perspective OK) → accept writes Board times. Distance untouched.

---

## Note for multitask

Own agent after Finish Cam shell exists. Manual scrubber is P0; YOLO can land in the same PR but must not gate the scrubber.
