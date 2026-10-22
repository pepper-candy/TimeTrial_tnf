/**
 * Client-only YOLOv8n person detector (onnxruntime-web).
 * Lazy-loaded on first Analyse — never on create/board.
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

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;

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

/** Load the person model once per tab. Safe to call repeatedly. */
export async function loadPersonModel(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt();
      return ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })();
  }
  return sessionPromise;
}

export function resetPersonModelForTests() {
  sessionPromise = null;
  ortPromise = null;
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

function nms(
  boxes: PersonBox[],
  thresh: number,
): PersonBox[] {
  const sorted = boxes.slice().sort((a, b) => b.score - a.score);
  const keep: PersonBox[] = [];
  for (const box of sorted) {
    if (keep.every((k) => iou(k, box) < thresh)) keep.push(box);
  }
  return keep;
}

/**
 * Detect persons in a canvas/video frame.
 * Returns boxes in normalised source coordinates.
 */
export async function detectPersons(
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
  const data = raw.data as Float32Array;
  const dims = raw.dims;

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
    // Unexpected shape — bail cleanly
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

    // Undo letterbox → pixel → normalised
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
