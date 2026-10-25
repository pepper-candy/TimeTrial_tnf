/** Make MediaRecorder WebM playable/scrubbable in Android Gallery (duration + cues). */
import { Buffer } from "buffer";
import { Decoder, Reader, tools } from "ts-ebml";

function ensureBuffer(): void {
  const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
  if (!g.Buffer) g.Buffer = Buffer;
}

/**
 * Chrome MediaRecorder WebM often lacks Duration + Cues (esp. with timeslice),
 * so Gallery shows ~1s and won't scrub. Rebuild metadata with ts-ebml.
 * Non-WebM blobs (e.g. MP4) are returned unchanged.
 */
export async function makeGalleryFriendlyClip(blob: Blob): Promise<Blob> {
  const mime = (blob.type || "").toLowerCase();
  if (!mime.includes("webm") && !mime.includes("matroska")) return blob;
  if (blob.size < 64) return blob;

  ensureBuffer();
  const buf = await blob.arrayBuffer();
  const decoder = new Decoder();
  const reader = new Reader();
  reader.logging = false;
  // Chrome sometimes writes a bogus DefaultDuration — drop it (Chromium #606000).
  reader.drop_default_duration = true;

  const elms = decoder.decode(buf);
  for (const elm of elms) {
    if ((elm as { type?: string }).type === "unknown") continue;
    reader.read(elm);
  }
  reader.stop();

  if (!reader.metadatas?.length || !(reader.duration > 0)) {
    return blob;
  }

  const refinedMetadata = tools.makeMetadataSeekable(
    reader.metadatas,
    reader.duration,
    reader.cues,
  );
  const body = buf.slice(reader.metadataSize);
  return new Blob([refinedMetadata, body], {
    type: blob.type || "video/webm",
  });
}
