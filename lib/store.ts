import { createHash } from "crypto";
import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";
import { DEFAULT_CATEGORIES } from "./types";
import { advanceDemo, raceNow } from "./demo-run";
import { normalizeCode } from "./ids";
import { photoKey } from "./photo";
import { defaultResultKmSplits } from "./results";
import type { EventState, PhotoRecord } from "./types";

/** 21 days — one meet plus results review. Refreshed on every write. */
export const EVENT_TTL_SEC = 21 * 24 * 60 * 60;

const memEvents = new Map<string, EventState>();
const memVers = new Map<string, number>();
const memPhotos = new Map<string, PhotoRecord>();
const chains = new Map<string, Promise<unknown>>();

let redisClient: Redis | null | undefined;

function redis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

export function hasRedis(): boolean {
  return Boolean(redis());
}

function eventKey(code: string) {
  return `tt:event:${normalizeCode(code)}`;
}

function verKey(code: string) {
  return `tt:ver:${normalizeCode(code)}`;
}

function filePath() {
  if (process.env.VERCEL) return "/tmp/tt-store.json";
  return path.join(process.cwd(), ".data", "store.json");
}

type Disk = {
  events: Record<string, EventState>;
  vers: Record<string, number>;
  photos: Record<string, PhotoRecord>;
};

function readDisk(): Disk {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return { events: {}, vers: {}, photos: {} };
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Disk | Record<string, EventState>;
    if (raw && typeof raw === "object" && "events" in raw) return raw as Disk;
    return { events: raw as Record<string, EventState>, vers: {}, photos: {} };
  } catch {
    return { events: {}, vers: {}, photos: {} };
  }
}

function writeDisk(disk: Disk) {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(disk));
}

let localReady = false;

function ensureLocal() {
  if (localReady) return;
  const disk = readDisk();
  for (const [k, v] of Object.entries(disk.events)) memEvents.set(k, v);
  for (const [k, v] of Object.entries(disk.vers)) memVers.set(k, v);
  for (const [k, v] of Object.entries(disk.photos)) memPhotos.set(k, v);
  localReady = true;
}

function persistLocal() {
  ensureLocal();
  const disk: Disk = { events: {}, vers: {}, photos: {} };
  for (const [k, v] of memEvents) disk.events[k] = v;
  for (const [k, v] of memVers) disk.vers[k] = v;
  for (const [k, v] of memPhotos) disk.photos[k] = v;
  writeDisk(disk);
}

export function hydrateEvent(event: EventState): EventState {
  const course = event.course;
  const categories =
    event.categories?.length > 0 ? event.categories : [...DEFAULT_CATEGORIES];
  return {
    ...event,
    endedAt: event.endedAt ?? null,
    demoSpeed: event.demoSpeed > 0 ? event.demoSpeed : 1,
    pinHash: event.pinHash ?? null,
    hideStudentIds: Boolean(event.hideStudentIds),
    categories,
    resultKmSplits:
      event.resultKmSplits?.length > 0
        ? event.resultKmSplits
        : defaultResultKmSplits(course),
    runners: event.runners.map((r) => ({
      ...r,
      category: r.category?.trim() || categories[0] || "Boys",
    })),
  };
}

async function loadRaw(code: string): Promise<EventState | null> {
  const c = normalizeCode(code);
  const r = redis();
  if (r) {
    const event = await r.get<EventState>(eventKey(c));
    return event ? hydrateEvent(event) : null;
  }
  ensureLocal();
  const event = memEvents.get(c);
  return event ? hydrateEvent(event) : null;
}

export async function getStoredEvent(code: string): Promise<EventState | null> {
  return loadRaw(code);
}

export async function getRev(code: string): Promise<number | null> {
  const c = normalizeCode(code);
  const r = redis();
  if (r) {
    const raw = await r.get<number | string>(verKey(c));
    if (raw == null) {
      const event = await loadRaw(c);
      return event ? (event.rev ?? 0) : null;
    }
    const rev = Number(raw);
    return Number.isFinite(rev) ? rev : null;
  }
  ensureLocal();
  if (memVers.has(c)) return memVers.get(c)!;
  const event = memEvents.get(c);
  return event ? (event.rev ?? 0) : null;
}

export type Peek =
  | { status: "missing"; now: number }
  | { status: "unchanged"; rev: number; now: number }
  | { status: "ok"; event: EventState; rev: number; now: number };

/**
 * Cheap poll: 1 Redis GET of the version key when the client is current.
 * Full event GET only when rev changed (or first load).
 */
export async function peekEvent(code: string, sinceRev: number | null): Promise<Peek> {
  const now = Date.now();
  const c = normalizeCode(code);
  const r = redis();
  if (r) {
    if (sinceRev != null) {
      const raw = await r.get<number | string>(verKey(c));
      const rev = raw == null ? null : Number(raw);
      if (rev != null && Number.isFinite(rev) && rev === sinceRev) {
        return { status: "unchanged", rev, now };
      }
    }
    const event = await loadRaw(c);
    if (!event) return { status: "missing", now };
    const rev = event.rev ?? 0;
    return { status: "ok", event, rev, now };
  }
  ensureLocal();
  const event = memEvents.get(c);
  if (!event) return { status: "missing", now };
  const rev = memVers.get(c) ?? event.rev ?? 0;
  if (sinceRev != null && rev === sinceRev) return { status: "unchanged", rev, now };
  return { status: "ok", event, rev, now };
}

export async function getEvent(code: string): Promise<EventState | null> {
  const event = await loadRaw(code);
  if (!event) return null;
  // Demo crossings are derived from demoPlan + now; do not persist on read.
  return event.demo ? advanceDemo(event, raceNow(event, Date.now())) : event;
}

export async function saveEvent(event: EventState): Promise<EventState> {
  event.code = normalizeCode(event.code);
  event.rev = (event.rev ?? 0) + 1;
  const r = redis();
  if (r) {
    const p = r.pipeline();
    p.set(eventKey(event.code), event, { ex: EVENT_TTL_SEC });
    p.set(verKey(event.code), event.rev, { ex: EVENT_TTL_SEC });
    await p.exec();
    return event;
  }
  memEvents.set(event.code, event);
  memVers.set(event.code, event.rev);
  persistLocal();
  return event;
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
    const base = event.demo ? advanceDemo(event, raceNow(event, Date.now())) : event;
    const next = await fn(base);
    return await saveEvent(next);
  } finally {
    release();
  }
}

export function hashPhoto(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

export async function putPhoto(
  event: EventState,
  runnerId: string,
  buf: Buffer,
  mime: string,
): Promise<EventState> {
  const v = hashPhoto(buf);
  const rec: PhotoRecord = { v, mime, data: buf.toString("base64") };
  const key = photoKey(event.id, runnerId);
  const next: EventState = {
    ...event,
    runners: event.runners.map((r) => (r.id === runnerId ? { ...r, photoVer: v } : r)),
  };
  next.rev = (event.rev ?? 0) + 1;
  next.code = normalizeCode(event.code);
  const r = redis();
  if (r) {
    const p = r.pipeline();
    p.set(key, rec, { ex: EVENT_TTL_SEC });
    p.set(eventKey(next.code), next, { ex: EVENT_TTL_SEC });
    p.set(verKey(next.code), next.rev, { ex: EVENT_TTL_SEC });
    await p.exec();
    return next;
  }
  memPhotos.set(key, rec);
  memEvents.set(next.code, next);
  memVers.set(next.code, next.rev);
  persistLocal();
  return next;
}

export async function getPhoto(eventId: string, runnerId: string): Promise<PhotoRecord | null> {
  const key = photoKey(eventId, runnerId);
  const r = redis();
  if (r) {
    const rec = await r.get<PhotoRecord>(key);
    return rec ?? null;
  }
  ensureLocal();
  return memPhotos.get(key) ?? null;
}

export async function deleteRunnerPhoto(eventId: string, runnerId: string) {
  const key = photoKey(eventId, runnerId);
  const r = redis();
  if (r) {
    await r.del(key);
    return;
  }
  memPhotos.delete(key);
  persistLocal();
}

export async function deleteEvent(code: string): Promise<boolean> {
  const c = normalizeCode(code);
  const event = await loadRaw(c);
  if (!event) return false;
  const keys = [
    eventKey(c),
    verKey(c),
    ...event.runners.map((r) => photoKey(event.id, r.id)),
  ];
  const r = redis();
  if (r) {
    await r.del(...keys);
    return true;
  }
  memEvents.delete(c);
  memVers.delete(c);
  for (const k of keys) memPhotos.delete(k);
  persistLocal();
  return true;
}
