# Sprint Event — Cursor multitask prompt

Paste into Cursor multitask on branch `main` (or current sprint feature branch) of `TimeTrial_tnf`.

**Roles:** **Starter** (start phone / bang → server start) · **Finish Cam** (finish phone / record + marks + later YOLO).

---

## Sprint Event — create UI + 2-helper mode

Repo: `TimeTrial_tnf` on current feature branch. Build on the existing Sprint button left of Info on `/create` (`onSprint` / Sprint Event stub sheet). Prefer extending that flow over a separate dead-end page.

### A. Create UI when Sprint is active

1. Title **NEW EVENT** → **NEW SPRINT**.
2. Distance presets: replace `1500 / 3000 / 5000 / 10000 / Custom` with **`60 / 100 / 200 / 400`** (metres).
3. Hide for sprint: RESULT KM chips, **More**, and the **CROSSINGS / LAPS / START M** summary panel.
4. Keep a fifth control like Custom, but it becomes a **DISTANCE:** field (same visual language as HELPER PIN) under the preset row. Tapping 60/100/200/400 auto-fills DISTANCE; user can still type a custom metres value.
5. Keep HELPER PIN + create flow; wire created event as `kind: "sprint"` (or equivalent) so Board/Timer distance logic doesn’t assume 5k laps.

### B. Two helpers (better names)

After create, Sprint events have **two helper roles** (share links / QR like today’s Timer+Marker, but sprint-specific):

| Role | Name | Device job |
|------|------|------------|
| Start | **Starter** | At the gun/airhorn. Mic warm early → Arm → bang/peak → tell **server** race start (`startedAt` = server time). Phone only signals “start now”; race clock stays server-authoritative (same pattern as current Timetrial). |
| Finish | **Finish Cam** | At the finish. Force/nudge **landscape**. Live preview with **red vertical finishing line** centred + **“Finishing Line”** badge. **Zoom** on the camera track; **record the zoomed stream** (not full unzoomed frame). |

Optional weak cross-check later: bang peak on Finish Cam soundtrack vs Starter server time (sound travel → don’t trust alone).

### C. Finish Cam session flow

1. Event start (or helper opens Finish Cam): camera + mic already live; **MediaRecorder** rolls continuously.
2. Camerman taps **Mark 1** when first athlete is about to enter frame; **Mark 2** when last athlete exits.
3. After Mark 2: keep recording **+1 s**, then stop A/V → show **RACE END** → fade in **Analyse**.
4. Analyse (stub OK first): only the slice `[Mark1 … Mark2+1s]` is the YOLO window later — not the whole roll.
5. Manual adjust always wins; YOLO later only suggests `lane N @ frame/time`.

### D. Out of scope for this multitask (stub/TODO OK)

- Live YOLO in-browser; full auto lane results; optical tele; World Athletics photo-finish accuracy.
- Replacing existing distance time-trial Timer/Marker flows.

### E. Deliverables

- Working Sprint create UI as above.
- Role naming + routes/PIN unlock for **Starter** and **Finish Cam**.
- Starter: arm → bang → server start (reuse existing start API / offset pattern).
- Finish Cam: landscape + red line + zoom + mark1/mark2/+1s/RACE END/Analyse stub.
- Short note in PR/README: sprint = Starter + Finish Cam; server clock primary.

Match existing Timetrial UI (void/panel/sand, `tap` buttons, TopBar). Don’t break distance events.

---

## Timing notes (from design chat)

- Race clock = **server timestamp**; phones correct for clock offset (existing Timetrial pattern).
- Soundtrack bang on Finish Cam = **weak** verify only (sound travel).
- Probe pages: `Desktop/tnf_working/Sound_n_Camera_Test` (`finish.html`, `bang.html`).

### F. Sprint Board

For `kind: "sprint"` Board: **sorted by lane**, each row **name then time** (finish only). No lap/crossing grid. Distance Board unchanged.
