import { newId } from "./ids";
import { IDLE_GAP_MS } from "./tap-list";
import {
  appendMark,
  appendTap,
  liveMarks,
  liveTaps,
  normalizeBib,
  reassignMark,
} from "./race";
import type {
  EditActor,
  EditKind,
  EditLogEntry,
  EventState,
  Mark,
  Tap,
} from "./types";

export const MAX_EDITS = 200;

export function isLive<T extends { deletedAt?: number | null }>(x: T): boolean {
  return x.deletedAt == null;
}

export function parseActor(v: unknown): EditActor {
  return v === "timer" || v === "marker" || v === "admin" ? v : "admin";
}

export function pushEdit(edits: EditLogEntry[] | undefined, entry: EditLogEntry): EditLogEntry[] {
  return [...(edits ?? []), entry].slice(-MAX_EDITS);
}

function log(
  event: EventState,
  actor: EditActor,
  kind: EditKind,
  extra: Partial<EditLogEntry>,
  at: number,
): EditLogEntry[] {
  return pushEdit(event.edits, { id: newId(), at, actor, kind, ...extra });
}

export function softDeleteTap(taps: Tap[], id: string, at: number): Tap[] {
  return taps.map((t) => (t.id === id && isLive(t) ? { ...t, deletedAt: at } : t));
}

export function restoreTap(taps: Tap[], id: string): Tap[] {
  return taps.map((t) => (t.id === id ? { ...t, deletedAt: null } : t));
}

export function softDeleteLastTap(taps: Tap[], at: number, tapId?: string): Tap[] {
  if (tapId) return softDeleteTap(taps, tapId, at);
  const live = liveTaps(taps);
  const last = live[live.length - 1];
  if (!last) return taps;
  return softDeleteTap(taps, last.id, at);
}

export function insertEstimatedTap(taps: Tap[], t: number, id?: string): Tap[] {
  return appendTap(taps, { id: id ?? newId(), t: Math.round(t), estimated: true });
}

/**
 * Insert one live tap so it sorts at `liveIndex`, shifting later taps.
 * The time is the midpoint of the neighbours. A 1ms pack is opened just
 * enough that sort order matches the index; recorded times move by 1ms.
 */
export function insertTapAtLiveIndex(taps: Tap[], liveIndex: number, explicitT?: number): Tap[] {
  if (explicitT != null && Number.isFinite(explicitT)) {
    return appendTap(taps, { id: newId(), t: Math.round(explicitT), estimated: false });
  }
  const live = liveTaps(taps);
  const i = Math.max(0, Math.min(Math.floor(liveIndex), live.length));
  const id = newId();
  const prev = i > 0 ? live[i - 1].t : null;
  const nextT = i < live.length ? live[i].t : null;
  let t: number;
  if (prev != null && nextT != null && nextT - prev >= 2) t = Math.round((prev + nextT) / 2);
  else if (prev != null && nextT != null) t = prev;
  else if (nextT != null) t = nextT - 800;
  else if (prev != null) t = prev + 800;
  else t = 0;
  const order = live.slice();
  order.splice(i, 0, { id, t, estimated: true });
  const fixed = order.map((tap) => ({ ...tap }));
  for (let k = 1; k < fixed.length; k++) {
    const before = fixed[k - 1];
    const cur = fixed[k];
    if (cur.t < before.t || (cur.t === before.t && cur.id.localeCompare(before.id) < 0)) {
      fixed[k] = { ...cur, t: before.t + 1 };
    }
  }
  const byId = new Map(fixed.map((tap) => [tap.id, tap]));
  const rewritten = taps.map((tap) => {
    const next = byId.get(tap.id);
    if (!next || next.t === tap.t) return tap;
    return { ...tap, t: next.t };
  });
  return appendTap(rewritten, byId.get(id)!);
}

/** Midpoint of the two latest live taps, or 800ms before a single tap. */
export function estimateMissedTapTime(taps: Tap[], beforeId?: string): number | null {
  const live = liveTaps(taps);
  if (beforeId) {
    const i = live.findIndex((x) => x.id === beforeId);
    if (i < 0) return estimateMissedTapTime(taps);
    if (i === 0) return live[0].t - 800;
    return Math.round((live[i - 1].t + live[i].t) / 2);
  }
  if (live.length >= 2) {
    const a = live[live.length - 2];
    const b = live[live.length - 1];
    return Math.round((a.t + b.t) / 2);
  }
  if (live.length === 1) return live[0].t - 800;
  return null;
}

export function softDeleteMark(marks: Mark[], liveIndex: number, at: number): Mark[] {
  const live = liveMarks(marks);
  const target = live[liveIndex];
  if (!target) return marks;
  return marks.map((m) => (m.id === target.id ? { ...m, deletedAt: at } : m));
}

export function softDeleteMarkById(marks: Mark[], id: string, at: number): Mark[] {
  return marks.map((m) => (m.id === id && isLive(m) ? { ...m, deletedAt: at } : m));
}

export function restoreMark(marks: Mark[], id: string): Mark[] {
  return marks.map((m) => (m.id === id ? { ...m, deletedAt: null } : m));
}

export function insertMarkAtLiveIndex(marks: Mark[], liveIndex: number, bib: string): Mark[] {
  const live = liveMarks(marks);
  const mark: Mark = { id: newId(), bib: normalizeBib(bib) };
  if (liveIndex >= live.length) return [...marks, mark];
  const i = Math.max(0, liveIndex);
  const targetId = live[i]?.id;
  if (!targetId) return [...marks, mark];
  const idx = marks.findIndex((m) => m.id === targetId);
  const next = marks.slice();
  next.splice(idx, 0, mark);
  return next;
}

export function moveLiveMark(marks: Mark[], from: number, to: number): Mark[] {
  const live = liveMarks(marks);
  if (from < 0 || to < 0 || from >= live.length || to >= live.length || from === to) {
    return marks;
  }
  const order = live.map((m) => m.id);
  const [id] = order.splice(from, 1);
  order.splice(to, 0, id);
  const byId = new Map(marks.map((m) => [m.id, m]));
  let k = 0;
  return marks.map((m) => {
    if (!isLive(m)) return m;
    return byId.get(order[k++])!;
  });
}

export function swapLiveMarks(marks: Mark[], i: number, j: number): Mark[] {
  const live = liveMarks(marks);
  if (i < 0 || j < 0 || i >= live.length || j >= live.length || i === j) return marks;
  const order = live.map((m) => m.id);
  const a = order[i];
  order[i] = order[j];
  order[j] = a;
  const byId = new Map(marks.map((m) => [m.id, m]));
  let k = 0;
  return marks.map((m) => (isLive(m) ? byId.get(order[k++])! : m));
}

export function liveIndexOfMark(marks: Mark[], id: string): number {
  return liveMarks(marks).findIndex((m) => m.id === id);
}

export function liveIndexOfTap(taps: Tap[], id: string): number {
  return liveTaps(taps).findIndex((t) => t.id === id);
}

/** Next crossing time for a bib: last of theirs + last split, or last field tap + 800ms. */
export function estimateNextTimeForBib(event: EventState, bib: string): number | null {
  const n = normalizeBib(bib);
  const taps = liveTaps(event.taps);
  const marks = liveMarks(event.marks);
  const matched = Math.min(taps.length, marks.length);
  const mine: number[] = [];
  for (let i = 0; i < matched; i++) {
    if (normalizeBib(marks[i].bib) === n) mine.push(taps[i].t);
  }
  if (mine.length >= 2) {
    const last = mine[mine.length - 1];
    const prev = mine[mine.length - 2];
    return last + (last - prev);
  }
  if (mine.length === 1 && event.startedAt != null) {
    return mine[0] + (mine[0] - event.startedAt);
  }
  if (taps.length > 0) return taps[taps.length - 1].t + 800;
  if (event.startedAt != null) return event.startedAt + 40_000;
  return null;
}

export type EditInput = {
  actor?: unknown;
  action?: string;
  undo?: boolean;
  id?: string;
  tapId?: string;
  markId?: string;
  bib?: string;
  bibs?: string[];
  index?: number;
  j?: number;
  to?: number;
  t?: number;
  estimated?: boolean;
  beforeId?: string;
  taps?: Tap[];
  tap?: Tap;
  marks?: Mark[];
};

export function applyEdit(event: EventState, body: EditInput, at = Date.now()): EventState {
  const actor = parseActor(body.actor);
  const action = body.undo ? "tap-undo" : (body.action ?? "append");

  if (action === "replace" && Array.isArray(body.marks)) {
    return { ...event, marks: body.marks };
  }

  if (action === "append" && (body.taps || body.tap)) {
    const incoming = body.taps ?? (body.tap ? [body.tap] : []);
    let taps = event.taps;
    for (const tap of incoming) {
      if (!tap?.id || typeof tap.t !== "number") continue;
      taps = appendTap(taps, {
        id: String(tap.id),
        t: Math.round(tap.t),
        estimated: Boolean(tap.estimated),
      });
    }
    return { ...event, taps };
  }

  if (action === "idle") {
    const live = liveTaps(event.taps);
    const last = live[live.length - 1];
    if (!last) return event;
    const idles = event.idles ?? [];
    const lastIdle = idles.reduce((m, x) => (x.t > m ? x.t : m), 0);
    if (last.t <= lastIdle) return event;
    const t = typeof body.t === "number" ? Math.round(body.t) : at;
    if (t - last.t < IDLE_GAP_MS) return event;
    return { ...event, idles: [...idles, { id: newId(), t: Math.max(t, last.t + IDLE_GAP_MS) }] };
  }

  if (action === "group") {
    const live = liveMarks(event.marks);
    const last = live[live.length - 1];
    if (!last) return event;
    const groups = event.groups ?? [];
    if (groups.some((g) => g.afterId === last.id)) return event;
    return { ...event, groups: [...groups, { id: newId(), afterId: last.id }] };
  }

  if (action === "sync") {
    const nT0 = liveTaps(event.taps).length;
    const nM0 = liveMarks(event.marks).length;
    if (nT0 === 0 && nM0 === 0) return event;
    const syncs = event.syncs ?? [];
    const last = syncs[syncs.length - 1];
    if (last && last.taps === nT0 && last.marks === nM0) return event;
    const target = Math.max(nT0, nM0);
    let taps = event.taps;
    let marks = event.marks;
    const padTapIds: string[] = [];
    const padMarkIds: string[] = [];
    const baseT = liveTaps(taps)[liveTaps(taps).length - 1]?.t ?? at;
    while (liveTaps(taps).length < target) {
      const id = newId();
      taps = appendTap(taps, { id, t: baseT, estimated: true });
      padTapIds.push(id);
    }
    while (liveMarks(marks).length < target) {
      marks = appendMark(marks, "?");
      padMarkIds.push(marks[marks.length - 1].id);
    }
    return {
      ...event,
      taps,
      marks,
      syncs: [
        ...syncs,
        {
          id: newId(),
          at,
          taps: liveTaps(taps).length,
          marks: liveMarks(marks).length,
          padTapIds,
          padMarkIds,
        },
      ],
    };
  }

  if (action === "tap-undo" || action === "undo") {
    const live = liveTaps(event.taps);
    const target = body.id ? live.find((t) => t.id === body.id) : live[live.length - 1];
    if (!target) return event;
    return {
      ...event,
      taps: softDeleteTap(event.taps, target.id, at),
      edits: log(event, actor, "tap-delete", { tapId: target.id, t: target.t }, at),
    };
  }

  if (action === "tap-delete" || action === "delete-tap") {
    const id = body.id ?? body.tapId;
    if (!id) return event;
    const target = event.taps.find((t) => t.id === id);
    if (!target || !isLive(target)) return event;
    return {
      ...event,
      taps: softDeleteTap(event.taps, id, at),
      edits: log(event, actor, "tap-delete", { tapId: id, t: target.t }, at),
    };
  }

  if (action === "tap-restore" || action === "restore-tap") {
    const id = body.id ?? body.tapId;
    if (!id) return event;
    const target = event.taps.find((t) => t.id === id);
    if (!target) return event;
    return {
      ...event,
      taps: restoreTap(event.taps, id),
      edits: log(event, actor, "tap-restore", { tapId: id, t: target.t }, at),
    };
  }

  if (action === "tap-set-time") {
    const id = body.id ?? body.tapId;
    if (!id || typeof body.t !== "number" || !Number.isFinite(body.t)) return event;
    const target = event.taps.find((t) => t.id === id);
    if (!target || !isLive(target)) return event;
    const t = Math.round(body.t);
    const estimated = typeof body.estimated === "boolean" ? body.estimated : false;
    if (t === target.t && Boolean(target.estimated) === estimated) return event;
    return {
      ...event,
      taps: event.taps.map((tap) => (tap.id === id ? { ...tap, t, estimated } : tap)),
      edits: log(event, actor, "tap-time", { tapId: id, t, prevT: target.t }, at),
    };
  }

  if (action === "tap-insert-at") {
    if (body.index == null || !Number.isFinite(body.index)) return event;
    const before = new Set(event.taps.map((t) => t.id));
    const taps = insertTapAtLiveIndex(event.taps, body.index, body.t);
    const added = liveTaps(taps).find((t) => !before.has(t.id));
    if (!added) return event;
    return {
      ...event,
      taps,
      edits: log(event, actor, "tap-insert", { tapId: added.id, t: added.t, toIndex: body.index }, at),
    };
  }

  if (action === "tap-insert-estimated" || action === "insert-estimated") {
    const t = body.t ?? estimateMissedTapTime(event.taps, body.beforeId);
    if (t == null) return event;
    const tap = { id: newId(), t: Math.round(t), estimated: true as const };
    const taps = insertEstimatedTap(event.taps, tap.t, tap.id);
    let marks = event.marks;
    let markId: string | undefined;
    if (body.bib) {
      const idx = liveIndexOfTap(taps, tap.id);
      marks = insertMarkAtLiveIndex(marks, idx, body.bib);
      markId = liveMarks(marks)[idx]?.id;
    }
    return {
      ...event,
      taps,
      marks,
      edits: log(
        event,
        actor,
        body.bib ? "pair-insert" : "tap-insert",
        { tapId: tap.id, markId, t: tap.t, bib: body.bib ? normalizeBib(body.bib) : undefined },
        at,
      ),
    };
  }

  if (action === "append" && body.bib) {
    const marks = appendMark(event.marks, body.bib);
    const added = marks[marks.length - 1];
    return {
      ...event,
      marks,
      edits: log(event, actor, "mark-insert", { markId: added?.id, bib: added?.bib, toIndex: liveMarks(marks).length - 1 }, at),
    };
  }

  if (action === "append-many" && Array.isArray(body.bibs) && body.bibs.length > 0) {
    let marks = event.marks;
    const added: Mark[] = [];
    for (const bib of body.bibs) {
      if (typeof bib !== "string" || !bib.trim()) continue;
      marks = appendMark(marks, bib);
      added.push(marks[marks.length - 1]);
    }
    if (added.length === 0) return event;
    const last = added[added.length - 1];
    return {
      ...event,
      marks,
      edits: log(
        event,
        actor,
        "mark-insert",
        { markId: last?.id, bib: last?.bib, toIndex: liveMarks(marks).length - 1 },
        at,
      ),
    };
  }

  if (action === "mark-delete" || action === "delete") {
    const id = body.id ?? body.markId;
    let marks: Mark[];
    let target: Mark | undefined;
    if (id) {
      target = event.marks.find((m) => m.id === id);
      marks = softDeleteMarkById(event.marks, id, at);
    } else if (body.index != null) {
      target = liveMarks(event.marks)[body.index];
      marks = softDeleteMark(event.marks, body.index, at);
    } else {
      return event;
    }
    if (!target) return event;
    return {
      ...event,
      marks,
      edits: log(event, actor, "mark-delete", { markId: target.id, bib: target.bib, fromIndex: body.index }, at),
    };
  }

  if (action === "mark-restore" || action === "restore-mark") {
    const id = body.id ?? body.markId;
    if (!id) return event;
    const target = event.marks.find((m) => m.id === id);
    if (!target) return event;
    return {
      ...event,
      marks: restoreMark(event.marks, id),
      edits: log(event, actor, "mark-restore", { markId: id, bib: target.bib }, at),
    };
  }

  if (action === "mark-insert" || action === "insert") {
    if (!body.bib || body.index == null) return event;
    const marks = insertMarkAtLiveIndex(event.marks, body.index, body.bib);
    const live = liveMarks(marks);
    const added = live[Math.max(0, Math.min(body.index, live.length - 1))];
    return {
      ...event,
      marks,
      edits: log(event, actor, "mark-insert", { markId: added?.id, bib: added?.bib, toIndex: body.index }, at),
    };
  }

  if (action === "mark-reassign" || action === "reassign") {
    if (!body.bib) return event;
    const live = liveMarks(event.marks);
    const prev =
      (body.markId ? live.find((m) => m.id === body.markId) : undefined) ??
      (body.index != null ? live[body.index] : undefined);
    if (!prev) return event;
    const marks = reassignMark(event.marks, event.marks.findIndex((m) => m.id === prev.id), body.bib);
    const next = liveMarks(marks)[body.index];
    return {
      ...event,
      marks,
      edits: log(
        event,
        actor,
        "mark-reassign",
        { markId: prev.id, prevBib: prev.bib, bib: next?.bib, fromIndex: body.index },
        at,
      ),
    };
  }

  if (action === "swap") {
    const from = body.index;
    const to = body.j ?? body.to;
    if (from == null || to == null) return event;
    const marks = swapLiveMarks(event.marks, from, to);
    return {
      ...event,
      marks,
      edits: log(event, actor, "mark-move", { fromIndex: from, toIndex: to }, at),
    };
  }

  if (action === "mark-move" || action === "move") {
    const from = body.index;
    const to = body.to ?? body.j;
    if (from == null || to == null) return event;
    const marks = moveLiveMark(event.marks, from, to);
    return {
      ...event,
      marks,
      edits: log(event, actor, "mark-move", { fromIndex: from, toIndex: to }, at),
    };
  }

  if (action === "pair-delete") {
    const taps = liveTaps(event.taps);
    const marks = liveMarks(event.marks);
    let pairIndex = body.index;
    if (pairIndex == null && (body.tapId || body.markId)) {
      if (body.tapId) pairIndex = taps.findIndex((t) => t.id === body.tapId);
      else if (body.markId) pairIndex = marks.findIndex((m) => m.id === body.markId);
    }
    if (pairIndex == null || pairIndex < 0) return event;
    const tap = taps[pairIndex];
    const mark = marks[pairIndex];
    return {
      ...event,
      taps: tap ? softDeleteTap(event.taps, tap.id, at) : event.taps,
      marks: mark ? softDeleteMarkById(event.marks, mark.id, at) : event.marks,
      edits: log(
        event,
        actor,
        "pair-delete",
        { tapId: tap?.id, markId: mark?.id, bib: mark?.bib, t: tap?.t, fromIndex: pairIndex },
        at,
      ),
    };
  }

  if (action === "pair-insert-estimated") {
    if (!body.bib) return event;
    const t = body.t ?? estimateNextTimeForBib(event, body.bib);
    if (t == null) return event;
    return applyEdit(
      event,
      { actor, action: "tap-insert-estimated", t, bib: body.bib },
      at,
    );
  }

  if (action === "restore-last") {
    const last = [...(event.edits ?? [])].reverse().find((e) =>
      e.kind === "tap-delete" || e.kind === "mark-delete" || e.kind === "pair-delete",
    );
    if (!last) return event;
    let next = event;
    if (last.tapId && (last.kind === "tap-delete" || last.kind === "pair-delete")) {
      next = applyEdit(next, { actor, action: "tap-restore", id: last.tapId }, at);
    }
    if (last.markId && (last.kind === "mark-delete" || last.kind === "pair-delete")) {
      next = applyEdit(next, { actor, action: "mark-restore", id: last.markId }, at);
    }
    return next;
  }

  return event;
}
