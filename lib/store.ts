import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";
import { advanceDemo } from "./demo";
import { normalizeCode } from "./ids";
import type { EventState } from "./types";

const mem = new Map<string, EventState>();
const chains = new Map<string, Promise<unknown>>();

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function hasRedis(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
  );
}

function eventKey(code: string) {
  return `tt:event:${normalizeCode(code)}`;
}

function filePath() {
  if (process.env.VERCEL) return "/tmp/tt-store.json";
  return path.join(process.cwd(), ".data", "store.json");
}

function readFileAll(): Record<string, EventState> {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, EventState>;
  } catch {
    return {};
  }
}

function writeFileAll(all: Record<string, EventState>) {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(all));
}

async function loadRaw(code: string): Promise<EventState | null> {
  const c = normalizeCode(code);
  const r = redis();
  if (r) {
    const event = await r.get<EventState>(eventKey(c));
    return event ?? null;
  }
  if (mem.has(c)) return mem.get(c)!;
  const all = readFileAll();
  if (all[c]) {
    mem.set(c, all[c]);
    return all[c];
  }
  return null;
}

export async function getEvent(code: string): Promise<EventState | null> {
  const event = await loadRaw(code);
  if (!event) return null;
  if (event.demo) {
    const advanced = advanceDemo(event, Date.now());
    if (
      advanced.taps.length !== event.taps.length ||
      advanced.marks.length !== event.marks.length
    ) {
      await saveEvent(advanced);
      return advanced;
    }
  }
  return event;
}

export async function saveEvent(event: EventState): Promise<void> {
  event.code = normalizeCode(event.code);
  const r = redis();
  if (r) {
    await r.set(eventKey(event.code), event);
    return;
  }
  mem.set(event.code, event);
  const all = readFileAll();
  all[event.code] = event;
  writeFileAll(all);
}

export async function updateEvent(
  code: string,
  fn: (event: EventState) => EventState | Promise<EventState>,
): Promise<EventState | null> {
  const c = normalizeCode(code);
  const prev = chains.get(c) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  chains.set(
    c,
    prev.then(() => gate),
  );
  await prev;
  try {
    const event = await loadRaw(c);
    if (!event) return null;
    const base = event.demo ? advanceDemo(event, Date.now()) : event;
    const next = await fn(base);
    await saveEvent(next);
    return next;
  } finally {
    release();
  }
}
