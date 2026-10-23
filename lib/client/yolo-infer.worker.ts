/**
 * Dedicated Worker — YOLOv8n person inference (onnxruntime-web).
 * Main thread seeks video / draws frames; this worker runs ORT only.
 */
/// <reference lib="webworker" />

import type { PersonBox } from "./yolo-person";

const INPUT = 640;
const PERSON_CLASS = 0;
const SCORE_THRESH = 0.35;
const IOU_THRESH = 0.45;
const EXECUTION_PROVIDERS = ["webgpu", "webgl", "wasm"] as const;

type OrtModule = typeof import("onnxruntime-web");
type InferenceSession = import("onnxruntime-web").InferenceSession;

let ortMod: OrtModule | null = null;
let session: InferenceSession | null = null;
let activeEp = "wasm";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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

function parseYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  srcW: number,
  srcH: number,
  gain: number,
  padX: number,
  padY: number,
): PersonBox[] {
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

function preprocessBitmap(bitmap: ImageBitmap): {
  tensor: Float32Array;
  gain: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
} {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const gain = Math.min(INPUT / srcW, INPUT / srcH);
  const newW = Math.round(srcW * gain);
  const newH = Math.round(srcH * gain);
  const padX = (INPUT - newW) / 2;
  const padY = (INPUT - newH) / 2;

  const canvas = new OffscreenCanvas(INPUT, INPUT);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas unavailable");
  ctx.fillStyle = "#114";
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(bitmap, padX, padY, newW, newH);

  const { data } = ctx.getImageData(0, 0, INPUT, INPUT);
  const tensor = new Float32Array(3 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    tensor[p] = data[i]! / 255;
    tensor[p + plane] = data[i + 1]! / 255;
    tensor[p + 2 * plane] = data[i + 2]! / 255;
  }
  return { tensor, gain, padX, padY, srcW, srcH };
}

async function initSession(modelUrl: string, wasmPaths: string): Promise<void> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = wasmPaths;
  ort.env.wasm.numThreads = 1;
  ortMod = ort;

  let lastErr: unknown;
  for (const ep of EXECUTION_PROVIDERS) {
    try {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: [ep],
        graphOptimizationLevel: "all",
      });
      activeEp = ep;
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Could not create YOLO session in worker");
}

async function detect(bitmap: ImageBitmap): Promise<PersonBox[]> {
  if (!session || !ortMod) throw new Error("YOLO worker not initialised");
  const { tensor, gain, padX, padY, srcW, srcH } = preprocessBitmap(bitmap);
  bitmap.close();
  const inputName = session.inputNames[0] ?? "images";
  const feeds: Record<string, import("onnxruntime-web").Tensor> = {
    [inputName]: new ortMod.Tensor("float32", tensor, [1, 3, INPUT, INPUT]),
  };
  const out = await session.run(feeds);
  const outName = session.outputNames[0]!;
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

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as
    | { type: "init"; modelUrl: string; wasmPaths: string }
    | { type: "detect"; id: number; bitmap: ImageBitmap };

  void (async () => {
    try {
      if (msg.type === "init") {
        await initSession(msg.modelUrl, msg.wasmPaths);
        self.postMessage({ type: "ready", ep: activeEp });
        return;
      }
      if (msg.type === "detect") {
        const boxes = await detect(msg.bitmap);
        self.postMessage({ type: "boxes", id: msg.id, boxes });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const id = "id" in msg ? msg.id : undefined;
      self.postMessage({ type: "error", id, message });
    }
  })();
};
