"use client";

import { useEffect, useState } from "react";
import { NumberPad } from "@/components/pad";
import { BigBtn, Chip, Field, Screen, TopBar } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { getMasterKey, getStoredPin, setMasterKey, setStoredPin } from "@/lib/client/pin";

export function PinGate({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [key, setKey] = useState("");
  const [keyMode, setKeyMode] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const kick = window.setTimeout(() => {
      void (async () => {
        const stored = getStoredPin(code);
        const master = getMasterKey();
        if (stored || master) {
          const good = await tryAuth(code, { pin: stored, key: master });
          if (!cancelled && good) {
            setOk(true);
            setChecking(false);
            return;
          }
        }
        const res = await fetch(`/api/events/${code}`, { cache: "no-store" });
        if (!cancelled && res.status === 404) {
          setChecking(false);
          return;
        }
        const data = (await res.json()) as { event?: { hasPin?: boolean } };
        if (!cancelled && data.event && data.event.hasPin === false) {
          setOk(true);
          setChecking(false);
          return;
        }
        if (!cancelled) setChecking(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(kick);
    };
  }, [code]);

  async function submitPin() {
    if (await tryAuth(code, { pin })) {
      setStoredPin(code, pin);
      setOk(true);
      setErr(false);
    } else {
      setErr(true);
    }
  }

  async function submitKey() {
    if (await tryAuth(code, { key })) {
      setMasterKey(key);
      setOk(true);
      setErr(false);
    } else {
      setErr(true);
    }
  }

  if (ok) return children;
  if (checking) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}`} title="PIN" />
        <LoadingState rows={4} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        backHref={`/e/${code}`}
        title={keyMode ? "Master key" : "Helper PIN"}
        menu={
          <Chip
            size="icon"
            active={keyMode}
            onClick={() => {
              setKeyMode((v) => !v);
              setErr(false);
            }}
          >
            Key
          </Chip>
        }
        info="Timer, Marker and Admin need the event PIN. Board is public. Lost the PIN? Tap Key and enter the owner's ADMIN_MASTER_KEY to open Admin and see or reset it."
      />
      <div className="flex flex-1 flex-col px-4 pb-6">
        {keyMode ? (
          <div className="flex flex-col gap-3">
            <Field
              value={key}
              onChange={setKey}
              placeholder="Master key"
              type="password"
              autoFocus
            />
            {err ? <p className="text-center text-sm font-black text-stop">Wrong key</p> : null}
            <BigBtn onClick={() => void submitKey()} disabled={!key.trim()}>
              Unlock
            </BigBtn>
          </div>
        ) : (
          <>
            <div className="mb-3 flex h-20 items-center justify-center rounded-2xl bg-panel font-mono text-6xl font-black tabular tracking-[0.35em] ring-1 ring-line">
              {pin ? "•".repeat(pin.length) : " "}
            </div>
            {err ? <p className="mb-3 text-center text-sm font-black text-stop">Wrong PIN</p> : null}
            <NumberPad value={pin} onChange={setPin} onEnter={() => void submitPin()} enterLabel="Unlock" />
          </>
        )}
      </div>
    </Screen>
  );
}

async function tryAuth(code: string, creds: { pin?: string; key?: string }): Promise<boolean> {
  const pin = creds.pin?.trim() || undefined;
  const key = creds.key?.trim() || undefined;
  if (!pin && !key) return false;
  const res = await fetch(`/api/events/${code}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, key }),
  });
  return res.ok;
}
