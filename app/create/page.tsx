"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BigBtn, Chip, Field, Screen, Stat, TopBar } from "@/components/shell";
import { rememberAdmin, setStoredPin } from "@/lib/client/pin";
import { json } from "@/lib/client/hooks";
import { deriveCourse, DISTANCE_PRESETS, kmCrossings, lapsCount } from "@/lib/course";
import { parsePace } from "@/lib/format";
import { defaultResultKmSplits } from "@/lib/results";
import type { EventState } from "@/lib/types";

export default function CreatePage() {
  const router = useRouter();
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

  const course = useMemo(
    () =>
      deriveCourse({
        totalDistanceM: Number(distance) || 5000,
        lapLengthM: Number(lap) || 400,
        firstPartialM: first === "" ? null : Number(first),
        fixedCrossings: crossings === "" ? null : Number(crossings),
        targetPaceSecPerKm: parsePace(pace),
      }),
    [distance, lap, first, crossings, pace],
  );

  const kmOpts = kmCrossings(course).filter((x) => x.km * 1000 < course.totalDistanceM - 0.5);
  const resultKm = kmPick ?? defaultResultKmSplits(course);
  const pinOk = /^\d{4,8}$/.test(pin.trim());

  function pickPreset(id: string, meters?: number) {
    setPreset(id);
    if (meters) {
      setDistance(String(meters));
      setLap("400");
      setFirst("");
      setCrossings("");
      setKmPick(null);
    }
  }

  async function create() {
    if (!pinOk) return;
    setBusy(true);
    try {
      const data = await json<{ event: EventState }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          pin: pin.trim(),
          resultKmSplits: resultKm,
          course: {
            totalDistanceM: course.totalDistanceM,
            lapLengthM: course.lapLengthM,
            firstPartialM: course.firstPartialM,
            fixedCrossings: crossings ? course.requiredCrossings : null,
            targetPaceSecPerKm: course.targetPaceSecPerKm,
          },
        }),
      });
      setStoredPin(data.event.code, pin.trim());
      rememberAdmin(data.event.code, data.event.name);
      router.push(`/e/${data.event.code}/admin`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <TopBar
        backHref="/"
        title="New event"
        info="5000 m on a 400 m track starts at the 200 m mark: the first finish-line crossing is the 200 m split, then 12 full laps. The helper PIN unlocks Timer, Marker and Admin; Admin can show it again later. Board is a public link."
      />
      <div className="flex flex-1 flex-col gap-5 px-4 pb-28">
        <Field value={name} onChange={setName} placeholder="Event name" />

        <div className="grid grid-cols-4 gap-2">
          {DISTANCE_PRESETS.map((p) => (
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
          >
            Custom
          </Chip>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-panel p-4 ring-1 ring-line">
          <Stat value={course.requiredCrossings} label="Crossings" />
          <Stat value={formatLaps(lapsCount(course))} label="Laps" />
          <Stat value={course.firstPartialM || "0"} label="Start m" />
        </div>

        <Field
          value={pin}
          onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
          placeholder="Helper PIN (4–8 digits)"
          inputMode="numeric"
          size="lg"
          className="text-center font-mono font-black tabular tracking-[0.3em] placeholder:font-sans placeholder:text-base placeholder:font-semibold placeholder:tracking-normal"
        />

        <Chip active={advanced} onClick={() => setAdvanced((v) => !v)} className="self-start">
          More
        </Chip>

        {advanced ? (
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
          <BigBtn className="w-full" onClick={create} disabled={busy || !pinOk}>
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
