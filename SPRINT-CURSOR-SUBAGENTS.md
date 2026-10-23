# Sprint Event — Cursor multitask (split subagents)

Run these as **separate agents / tasks** in parallel. Shared context: Timetrial `TimeTrial_tnf`, existing Sprint button left of Info on `/create`, distance events must keep working. Roles: **Starter** · **Finish Cam**.

Coordinate via a thin `kind: "sprint"` (or equivalent) on the event — Agent A owns the type + create UI; B and C consume it.

---

## Agent A — Sprint create UI + event kind

**Scope only:** `/create` when Sprint mode is on. Do not build Starter/Finish Cam screens.

1. Title **NEW EVENT** → **NEW SPRINT**.
2. Distance presets → **60 / 100 / 200 / 400** (m). Drop 1500/3000/5000/10000.
3. Hide: RESULT KM, **More**, CROSSINGS/LAPS/START M panel.
4. Fifth control = **DISTANCE:** field (HELPER PIN visual language). Presets auto-fill it; allow custom metres.
5. Persist `kind: "sprint"` (+ distance metres) on create so other agents can branch.
6. Leave a short stub comment/TODO where helper share links will list Starter + Finish Cam (Agent B/C fill routes).

**Done when:** Sprint create UI matches above; distance create path unchanged; event JSON/API has sprint kind.

---

## Agent B — Starter helper

**Scope only:** start-line helper. Depends on Agent A’s `kind: "sprint"`.

1. Name the role **Starter** (not Timer). Share/QR/PIN unlock like existing helpers.
2. Screen: mic warm early → **Arm** → detect bang/airhorn/board clap peak → call existing **server start** (`startedAt` = server time). Phone only signals start; clock stays server-authoritative.
3. Reuse Timetrial server-time / offset pattern from distance Start. No camera.
4. Stub UI copy: “Arm when set… bang starts the race clock.”

**Done when:** Starter link opens, arms, bang → race `started` on server. No Finish Cam work.

---

## Agent C — Finish Cam helper

**Scope only:** finish-line camera helper. Depends on Agent A’s sprint kind. Probe reference: `Sound_n_Camera_Test/finish.html` (behaviour, not required to copy files).

1. Name the role **Finish Cam**. Share/QR/PIN like helpers.
2. Nudge/lock **landscape**. Preview: **red vertical line** at centre + **Finishing Line** badge (top-right of preview).
3. **Zoom** via track constraints; **record zoomed stream** (MediaRecorder on that stream).
4. Continuous record while open. **Mark 1** (enter) / **Mark 2** (exit). After Mark 2: **+1 s** then stop A/V → **RACE END** → fade in **Analyse**.
5. Analyse = stub: log/export slice `[Mark1 … Mark2+1s]` as future YOLO window. Manual adjust later; no YOLO in this task.
6. Optional TODO: weak bang-on-soundtrack vs Starter server time (sound travel).

**Done when:** Finish Cam flow works end-to-end with marks + RACE END + Analyse stub. No Starter bang logic here.

---

## Agent D (optional, after A–C) — Help hub + README

1. Sprint help page: two buttons **Starter** | **Finish Cam** (mirror distance Timer|Marker hub).
2. One README paragraph: sprint = Starter + Finish Cam; server clock primary; YOLO later on marked slice only.

---

## Do not overlap

| Agent | Owns | Does not touch |
|-------|------|----------------|
| A | Create UI, `kind: sprint` | Starter/Finish screens |
| B | Starter mic/bang → server start | Camera, create presets |
| C | Finish Cam record/marks | Bang start, create presets |
| D | Hub links + docs | Core media logic |

Out of scope for all: live YOLO, optical tele, WA-grade photo finish, breaking distance Timer/Marker.

---

## Agent E — Sprint Board (dashboard)

**Scope only:** public Board for `kind: "sprint"`. Do not change the distance bowling-scoreboard lap grid for non-sprint events.

When event is sprint, Board shows **lanes**, not lap columns:

1. **Sort by lane** (lane 1 → 8/9), not by rank/lap.
2. Each row: **lane · name · time** (finish time only — one result, not split/lap cells).
3. No RESULT KM / crossing grid / “fastest lap” chrome for sprint.
4. Empty state can stay “No runners yet” until Admin assigns lanes/names; once present, list all lanes even if time is still `—`.
5. Big race clock can remain; bottom bar may show distance (e.g. `100 m`) without “laps” wording if easy.

**Done when:** opening `/e/{code}/board` on a sprint event shows lane-sorted name + time; distance events unchanged.
