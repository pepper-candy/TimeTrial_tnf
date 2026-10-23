"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BigBtn, Chip, Field, Screen, Stat, TopBar } from "@/components/shell";
import { rememberAdmin, setStoredPin } from "@/lib/client/pin";
import { json } from "@/lib/client/hooks";
import {
  deriveCourse,
  DISTANCE_PRESETS,
  kmCrossings,
  lapsCount,
  SPRINT_DISTANCE_PRESETS,
} from "@/lib/course";
import { parsePace } from "@/lib/format";
import { defaultResultKmSplits } from "@/lib/results";
import type { EventState } from "@/lib/types";

const TT_INFO =
  "5000 m on a 400 m track starts at the 200 m mark: the first finish-line crossing is the 200 m split, then 12 full laps. The helper PIN unlocks Timer, Marker and Admin; Admin can show it again later. Board is a public link.";
const SPRINT_INFO =
  "Sprint events use short flat distances (60–400 m). Pick a preset or type meters. One finish crossing. The helper PIN unlocks Starter, Finish Cam and Admin.";

/** Male ↔ Female. */
const GENDER_CYCLE = ["male", "female"] as const;

export default function CreatePage() {
  const router = useRouter();
  const [sprintMode, setSprintMode] = useState(false);
  const [preset, setPreset] = useState("5000");
  const [advanced, setAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [distance, setDistance] = useState("5000");
  const [lap, setLap] = useState("400");
  const [first, setFirst] = useState("");
  const [crossings, setCrossings] = useState("");
  const [pace, setPace] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [kmPick, setKmPick] = useState<number[] | null>(null);
  const [genderStep, setGenderStep] = useState(0);
  const genderMode = GENDER_CYCLE[genderStep];
  const genderLabel = genderMode === "female" ? "FEMALE" : "MALE";

  const distanceM = Number(distance) || 0;

  const course = useMemo(() => {
    if (sprintMode) {
      const meters = Math.max(1, distanceM || 100);
      // Flat sprint: lap = total → single finish (requiredCrossings = 1).
      return deriveCourse({
        totalDistanceM: meters,
        lapLengthM: meters,
        firstPartialM: 0,
        fixedCrossings: 1,
      });
    }
    return deriveCourse({
      totalDistanceM: Number(distance) || 5000,
      lapLengthM: Number(lap) || 400,
      firstPartialM: first === "" ? null : Number(first),
      fixedCrossings: crossings === "" ? null : Number(crossings),
      targetPaceSecPerKm: parsePace(pace),
    });
  }, [sprintMode, distance, distanceM, lap, first, crossings, pace]);

  const kmOpts = kmCrossings(course).filter((x) => x.km * 1000 < course.totalDistanceM - 0.5);
  const resultKm = kmPick ?? defaultResultKmSplits(course);
  const pinOk = /^\d{4}$/.test(pin.trim());
  const distanceOk = distanceM > 0;

  function pickPreset(id: string, meters?: number) {
    setPreset(id);
    if (meters) {
      setDistance(String(meters));
      if (!sprintMode) {
        setLap("400");
        setFirst("");
        setCrossings("");
        setKmPick(null);
      }
    }
  }

  function toggleSprintMode() {
    setSprintMode((on) => {
      if (on) {
        setPreset("5000");
        setDistance("5000");
        setLap("400");
        setFirst("");
        setCrossings("");
        setPace("");
        setKmPick(null);
        setAdvanced(false);
        return false;
      }
      setPreset("100");
      setDistance("100");
      setAdvanced(false);
      setKmPick(null);
      return true;
    });
  }

  async function create() {
    if (!pinOk || !distanceOk) return;
    setBusy(true);
    try {
      const data = await json<{ event: EventState }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          pin: pin.trim(),
          kind: sprintMode ? "sprint" : "time-trial",
          ...(sprintMode ? { sprintGender: genderMode } : {}),
          resultKmSplits: sprintMode ? [] : resultKm,
          course: sprintMode
            ? {
                totalDistanceM: course.totalDistanceM,
                lapLengthM: course.lapLengthM,
                firstPartialM: 0,
                fixedCrossings: 1,
                targetPaceSecPerKm: null,
              }
            : {
                totalDistanceM: course.totalDistanceM,
                lapLengthM: course.lapLengthM,
                firstPartialM: course.firstPartialM,
                fixedCrossings: crossings ? course.requiredCrossings : null,
                targetPaceSecPerKm: course.targetPaceSecPerKm,
              },
        }),
      });
      // TODO(sprint helpers): when kind === "sprint", share/QR hub lists
      // Starter + Finish Cam (Agent B/C routes; Agent D hub). TT keeps Timer + Marker.
      setStoredPin(data.event.code, pin.trim());
      rememberAdmin(data.event.code, data.event.name);
      router.push(`/e/${data.event.code}/admin`);
    } finally {
      setBusy(false);
    }
  }

  const presets = sprintMode ? SPRINT_DISTANCE_PRESETS : DISTANCE_PRESETS;

  return (
    <Screen>
      <TopBar
        backHref="/"
        title={sprintMode ? "New Sprint" : "New event"}
        onSprint={toggleSprintMode}
        sprintActive={sprintMode}
        info={sprintMode ? SPRINT_INFO : TT_INFO}
      />
      <div className="flex flex-1 flex-col gap-5 px-4 pb-28">
        <Field value={name} onChange={setName} placeholder="Event name" />

        {sprintMode ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-label={`Gender mode ${genderLabel}`}
                className={`tap grid h-12 shrink-0 min-w-[5.75rem] place-items-center rounded-2xl bg-panel2 px-3 text-sm font-black ring-1 ${
                  genderMode === "female"
                    ? "text-[#ff4d8a] ring-[#ff4d8a]"
                    : "text-sky ring-sky"
                }`}
                onClick={() => setGenderStep((s) => (s + 1) % GENDER_CYCLE.length)}
              >
                <span className="col-start-1 row-start-1">{genderLabel}</span>
                <span className="invisible col-start-1 row-start-1" aria-hidden>
                  FEMALE
                </span>
              </button>
              <label className="home-code-field home-code-field--sm min-w-0 flex-1 rounded-2xl bg-panel2 ring-1 ring-line focus-within:ring-accent focus-within:outline-none">
                <span className="home-code-prefix">DISTANCE:</span>
                <span className="home-code-slot">
                  <input
                    value={distance}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setDistance(v);
                      const m = Number(v);
                      const match = SPRINT_DISTANCE_PRESETS.find((p) => p.meters === m);
                      setPreset(match ? match.id : "custom");
                    }}
                    placeholder=" "
                    aria-label="Distance in meters"
                    inputMode="decimal"
                    autoComplete="off"
                    className="home-code focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pinOk && distanceOk) void create();
                    }}
                  />
                  <span aria-hidden className="home-caret" />
                </span>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {presets.map((p) => (
                <Chip
                  key={p.id}
                  active={preset === p.id}
                  onClick={() => pickPreset(p.id, p.meters)}
                  size="lg"
                  className="!h-12 w-full"
                >
                  {p.id}
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {presets.map((p) => (
                <Chip
                  key={p.id}
                  active={preset === p.id}
                  onClick={() => pickPreset(p.id, p.meters)}
                  size="lg"
                >
                  {p.id}
                </Chip>
              ))}
              <Chip
                active={preset === "custom"}
                onClick={() => {
                  setPreset("custom");
                  setAdvanced(true);
                }}
                size="lg"
                className="col-span-4 w-full"
              >
                Custom
              </Chip>
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-2xl bg-panel p-4 ring-1 ring-line">
              <Stat value={course.requiredCrossings} label="Crossings" />
              <Stat value={formatLaps(lapsCount(course))} label="Laps" />
              <Stat value={course.firstPartialM || "0"} label="Start m" />
            </div>
          </>
        )}

        <label className="home-code-field w-full rounded-2xl bg-panel2 ring-1 ring-line focus-within:ring-accent focus-within:outline-none">
          <span className="home-code-prefix">HELPER PIN:</span>
          <span className="home-code-slot">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder=" "
              aria-label="Helper PIN, 4 digits"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="home-code focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && pinOk && distanceOk) void create();
              }}
            />
            <span aria-hidden className="home-caret" />
          </span>
        </label>

        {!sprintMode ? (
          <Chip active={advanced} onClick={() => setAdvanced((v) => !v)} className="self-start">
            More
          </Chip>
        ) : null}

        {!sprintMode && advanced ? (
          <div className="grid grid-cols-2 gap-2">
            <Field
              value={distance}
              onChange={(v) => {
                setDistance(v);
                setPreset("custom");
              }}
              placeholder="Distance m"
              inputMode="numeric"
            />
            <Field
              value={lap}
              onChange={(v) => {
                setLap(v);
                setPreset("custom");
              }}
              placeholder="Lap m"
              inputMode="decimal"
            />
            <Field value={first} onChange={setFirst} placeholder="First part m" inputMode="decimal" />
            <Field
              value={crossings}
              onChange={setCrossings}
              placeholder="Crossings"
              inputMode="numeric"
            />
            <Field
              value={pace}
              onChange={setPace}
              placeholder="Target pace m:ss"
              className="col-span-2"
            />
            {kmOpts.length > 0 ? (
              <div className="col-span-2">
                <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-dim">
                  Result km
                </div>
                <div className="flex flex-wrap gap-2">
                  {kmOpts.map((k) => (
                    <Chip
                      key={k.km}
                      active={resultKm.includes(k.km)}
                      onClick={() => {
                        setKmPick((prev) => {
                          const cur = prev ?? defaultResultKmSplits(course);
                          return cur.includes(k.km)
                            ? cur.filter((x) => x !== k.km)
                            : [...cur, k.km].sort((a, b) => a - b);
                        });
                      }}
                    >
                      {k.km}K
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-void via-void/95 to-transparent pt-6">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <BigBtn className="w-full" onClick={create} disabled={busy || !pinOk || !distanceOk}>
            {busy ? "…" : "Create"}
          </BigBtn>
        </div>
      </div>
    </Screen>
  );
}

function formatLaps(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
