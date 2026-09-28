"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Field, GoldBtn, HelpTip, Screen, Stat, TopBar } from "@/components/shell";
import { json } from "@/lib/client/hooks";
import { deriveCourse, DISTANCE_PRESETS, lapsCount } from "@/lib/course";
import { parsePace } from "@/lib/format";
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
  const [busy, setBusy] = useState(false);

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

  function pickPreset(id: string, meters?: number) {
    setPreset(id);
    if (meters) {
      setDistance(String(meters));
      setLap("400");
      setFirst("");
      setCrossings("");
    }
  }

  async function create() {
    setBusy(true);
    try {
      const data = await json<{ event: EventState }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          course: {
            totalDistanceM: course.totalDistanceM,
            lapLengthM: course.lapLengthM,
            firstPartialM: course.firstPartialM,
            fixedCrossings: crossings ? course.requiredCrossings : null,
            targetPaceSecPerKm: course.targetPaceSecPerKm,
          },
        }),
      });
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
        right={<HelpTip text="5000 m on a 400 m track starts at the 200 m mark. First finish-line crossing is the 200 m split, then 12 full laps." />}
      />
      <div className="flex flex-1 flex-col px-4 pb-8">
        <div className="flex flex-wrap gap-2">
          {DISTANCE_PRESETS.map((p) => (
            <Chip
              key={p.id}
              active={preset === p.id}
              onClick={() => pickPreset(p.id, p.meters)}
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
          >
            Custom
          </Chip>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3 rounded-2xl bg-panel p-4">
          <Stat value={course.requiredCrossings} label="Crossings" />
          <Stat value={formatLaps(lapsCount(course))} label="Laps" />
          <Stat
            value={course.firstPartialM || "0"}
            label={course.firstPartialM ? "Start m" : "Finish start"}
          />
        </div>

        <button
          type="button"
          className="tap mt-6 self-start rounded-full bg-panel2 px-4 py-2 text-sm font-semibold"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Simple" : "Advanced"}
        </button>

        {advanced ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Field
              value={name}
              onChange={setName}
              placeholder="Event name"
              className="col-span-2"
            />
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
            <Field
              value={first}
              onChange={setFirst}
              placeholder="First partial m"
              inputMode="decimal"
            />
            <Field
              value={crossings}
              onChange={setCrossings}
              placeholder="Fixed crossings"
              inputMode="numeric"
            />
            <Field
              value={pace}
              onChange={setPace}
              placeholder="Target pace m:ss"
              className="col-span-2"
            />
          </div>
        ) : null}

        <div className="flex-1" />
        <GoldBtn className="mt-8" onClick={create} disabled={busy}>
          Create
        </GoldBtn>
      </div>
    </Screen>
  );
}

function formatLaps(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
