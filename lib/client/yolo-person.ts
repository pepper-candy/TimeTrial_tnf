/**
 * Client-only YOLOv8n person detector (onnxruntime-web).
 * Lazy-loaded on first Analyse — never on create/board.
 *
 * Execution providers: webgpu → webgl → wasm (first that creates a session).
 * Inference prefers a Dedicated Worker; falls back to main thread.
 *
 * YOLO window = Mark1…Mark2 only (the +1s pad stays on the saved blob).
 */

export type PersonBox = {
  /** Normalised 0–1 relative to the source frame. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  /** Chest / torso sample point (upper-mid of box), normalised. */
  chestX: number;
  chestY: number;
};

type OrtModule = typeof import("onnxruntime-web");
type InferenceSession = import("onnxruntime-web").InferenceSession;

const MODEL_URL = "/models/yolov8n.onnx";
const WASM_PATHS = "/ort/";
const INPUT = 640;
const PERSON_CLASS = 0;
const SCORE_THRESH = 0.35;
const IOU_THRESH = 0.45;

/** Prefer GPU EPs, then WASM (spec: webgpu → webgl → wasm). */
const EXECUTION_PROVIDERS = ["webgpu", "webgl", "wasm"] as const;

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;
let activeEp: string | null = null;

type WorkerBridge = {
  detect: (bitmap: ImageBitmap) => Promise<PersonBox[]>;
  terminate: () => void;
};

let workerBridgePromise: Promise<WorkerBridge | null> | null = null;

async function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import("onnxruntime-web").then((ort) => {
      ort.env.wasm.wasmPaths = WASM_PATHS;
      // Prefer single-thread WASM in helper phones; avoids SharedArrayBuffer needs.
      ort.env.wasm.numThreads = 1;
      return ort;
    });
  }
  return ortPromise;
}

async function createSessionWithFallback(ort: OrtModule): Promise<InferenceSession> {
  let lastErr: unknown;
  for (const ep of EXECUTION_PROVIDERS) {
    try {
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: [ep],
        graphOptimizationLevel: "all",
      });
      activeEp = ep;
      return session;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Could not create YOLO session (webgpu/webgl/wasm)");
}

/** Load the person model once per tab. Safe to call repeatedly. */
export async function loadPersonModel(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt();
      return createSessionWithFallback(ort);
    })();
  }
  return sessionPromise;
}

/** Which EP won (null until first successful load). */
export function getPersonModelEp(): string | null {
  return activeEp;
}

export function resetPersonModelForTests() {
  sessionPromise = null;
  ortPromise = null;
  activeEp = null;
  if (workerBridgePromise) {
    void workerBridgePromise.then((b) => b?.terminate());
    workerBridgePromise = null;
  }
}

/** Letterbox RGB frame → Float32 NCHW [1,3,640,640] + scale meta. */
function preprocess(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): { tensor: Float32Array; gain: number; padX: number; padY: number } {
  const gain = Math.min(INPUT / srcW, INPUT / srcH);
  const newW = Math.round(srcW * gain);
  const newH = Math.round(srcH * gain);
  const padX = (INPUT - newW) / 2;
  const padY = (INPUT - newH) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = INPUT;
  canvas.height = INPUT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#114";
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(source, padX, padY, newW, newH);

  const { data } = ctx.getImageData(0, 0, INPUT, INPUT);
  const tensor = new Float32Array(3 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    tensor[p] = data[i]! / 255;
    tensor[p + plane] = data[i + 1]! / 255;
    tensor[p + 2 * plane] = data[i + 2]! / 255;
  }
  return { tensor, gain, padX, padY };
}

function iou(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const uni = areaA + areaB - inter;
  return uni <= 0 ? 0 : inter / uni;
}

function nms(boxes: PersonBox[], thresh: number): PersonBox[] {
  const sorted = boxes.slice().sort((a, b) => b.score - a.score);
  const keep: PersonBox[] = [];
  for (const box of sorted) {
    if (keep.every((k) => iou(k, box) < thresh)) keep.push(box);
  }
  return keep;
}

export function parseYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  srcW: number,
  srcH: number,
  gain: number,
  padX: number,
  padY: number,
): PersonBox[] {
  // YOLOv8: [1, 84, N] or [1, N, 84]
  let numPred: number;
  let transposed: boolean;
  if (dims.length === 3 && dims[1] === 84) {
    numPred = dims[2]!;
    transposed = true;
  } else if (dims.length === 3 && dims[2] === 84) {
    numPred = dims[1]!;
    transposed = false;
  } else {
    return [];
  }

  const candidates: PersonBox[] = [];
  for (let i = 0; i < numPred; i++) {
    let cx: number;
    let cy: number;
    let w: number;
    let h: number;
    let personScore: number;
    if (transposed) {
      cx = data[0 * numPred + i]!;
      cy = data[1 * numPred + i]!;
      w = data[2 * numPred + i]!;
      h = data[3 * numPred + i]!;
      personScore = data[(4 + PERSON_CLASS) * numPred + i]!;
    } else {
      const base = i * 84;
      cx = data[base]!;
      cy = data[base + 1]!;
      w = data[base + 2]!;
      h = data[base + 3]!;
      personScore = data[base + 4 + PERSON_CLASS]!;
    }
    if (personScore < SCORE_THRESH) continue;

    const x1p = (cx - w / 2 - padX) / gain;
    const y1p = (cy - h / 2 - padY) / gain;
    const x2p = (cx + w / 2 - padX) / gain;
    const y2p = (cy + h / 2 - padY) / gain;
    const x1 = clamp01(x1p / srcW);
    const y1 = clamp01(y1p / srcH);
    const x2 = clamp01(x2p / srcW);
    const y2 = clamp01(y2p / srcH);
    if (x2 - x1 < 0.01 || y2 - y1 < 0.01) continue;
    const chestX = (x1 + x2) / 2;
    const chestY = y1 + (y2 - y1) * 0.35;
    candidates.push({ x1, y1, x2, y2, score: personScore, chestX, chestY });
  }
  return nms(candidates, IOU_THRESH);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

async function detectPersonsMain(
  source: HTMLCanvasElement | HTMLVideoElement,
  session?: InferenceSession,
): Promise<PersonBox[]> {
  const sess = session ?? (await loadPersonModel());
  const ort = await loadOrt();
  const srcW =
    source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH =
    source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!srcW || !srcH) return [];

  const { tensor, gain, padX, padY } = preprocess(source, srcW, srcH);
  const inputName = sess.inputNames[0] ?? "images";
  const feeds: Record<string, import("onnxruntime-web").Tensor> = {
    [inputName]: new ort.Tensor("float32", tensor, [1, 3, INPUT, INPUT]),
  };
  const out = await sess.run(feeds);
  const outName = sess.outputNames[0]!;
  const raw = out[outName]!;
  return parseYoloOutput(
    raw.data as Float32Array,
    raw.dims,
    srcW,
    srcH,
    gain,
    padX,
    padY,
  );
}

function tryCreateWorkerBridge(): Promise<WorkerBridge | null> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./yolo-infer.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      resolve(null);
      return;
    }

    const pending = new Map<
      number,
      { resolve: (b: PersonBox[]) => void; reject: (e: Error) => void }
    >();
    let nextId = 1;
    let ready = false;
    let settled = false;

    const failInit = () => {
      if (settled) return;
      settled = true;
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      resolve(null);
    };

    const timer = window.setTimeout(failInit, 45_000);

    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as
        | { type: "ready"; ep: string }
        | { type: "boxes"; id: number; boxes: PersonBox[] }
        | { type: "error"; id?: number; message: string };

      if (msg.type === "ready") {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        activeEp = msg.ep || activeEp;
        ready = true;
        resolve({
          detect: (bitmap) =>
            new Promise<PersonBox[]>((res, rej) => {
              const id = nextId++;
              pending.set(id, { resolve: res, reject: rej });
              try {
                worker.postMessage({ type: "detect", id, bitmap }, [bitmap]);
              } catch (e) {
                pending.delete(id);
                rej(e instanceof Error ? e : new Error(String(e)));
              }
            }),
          terminate: () => {
            worker.terminate();
            for (const [, p] of pending) p.reject(new Error("YOLO worker terminated"));
            pending.clear();
          },
        });
        return;
      }

      if (msg.type === "boxes") {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          p.resolve(msg.boxes);
        }
        return;
      }

      if (msg.type === "error") {
        if (!ready) {
          failInit();
          return;
        }
        if (msg.id != null) {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            p.reject(new Error(msg.message));
          }
        }
      }
    };

    worker.onerror = () => failInit();
    worker.postMessage({ type: "init", modelUrl: MODEL_URL, wasmPaths: WASM_PATHS });
  });
}

async function getWorkerBridge(): Promise<WorkerBridge | null> {
  if (!workerBridgePromise) {
    workerBridgePromise = tryCreateWorkerBridge();
  }
  return workerBridgePromise;
}

/**
 * Detect persons in a canvas/video frame.
 * Prefers Dedicated Worker (ORT off main thread); falls back to main-thread ORT.
 * Returns boxes in normalised source coordinates. Person class only.
 */
export async function detectPersons(
  source: HTMLCanvasElement | HTMLVideoElement,
  session?: InferenceSession,
): Promise<PersonBox[]> {
  // Explicit session → main-thread path (tests / callers that own the session).
  if (session) return detectPersonsMain(source, session);

  const srcW =
    source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH =
    source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!srcW || !srcH) return [];

  const bridge = await getWorkerBridge();
  if (bridge && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source);
      return await bridge.detect(bitmap);
    } catch {
      // Worker failed mid-run — fall through to main thread.
    }
  }

  return detectPersonsMain(source);
}

/** Warm model + optional worker as soon as Analyse opens (non-blocking). */
export function prefetchPersonModel(): void {
  void loadPersonModel().catch(() => undefined);
  void getWorkerBridge();
}
