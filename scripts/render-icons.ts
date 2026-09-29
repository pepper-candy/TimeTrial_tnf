import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APP_NAME, APP_TAGLINE } from "../lib/brand";
import { iconSvg, ogSvg } from "../lib/icon-svg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function pngToIco(pngs: { width: number; height: number; data: Buffer }[]): Buffer {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries: Buffer[] = [];
  const images: Buffer[] = [];
  let offset = 6 + 16 * count;
  for (const png of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(png.width >= 256 ? 0 : png.width, 0);
    entry.writeUInt8(png.height >= 256 ? 0 : png.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.data.length;
    entries.push(entry);
    images.push(png.data);
  }
  return Buffer.concat([header, ...entries, ...images]);
}

async function raster(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: Math.max(72, size * 3) })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function main() {
  const full = iconSvg("full");
  const simple = iconSvg("simple");
  const maskable = iconSvg("maskable");

  await mkdir(path.join(root, "public/icons"), { recursive: true });

  await writeFile(path.join(root, "public/icon.svg"), full);
  await writeFile(path.join(root, "public/icon-simple.svg"), simple);

  const sizes: { file: string; size: number; svg: string }[] = [
    { file: "public/icons/icon-16.png", size: 16, svg: simple },
    { file: "public/icons/icon-32.png", size: 32, svg: simple },
    { file: "public/icons/icon-180.png", size: 180, svg: full },
    { file: "public/icons/icon-192.png", size: 192, svg: full },
    { file: "public/icons/icon-512.png", size: 512, svg: full },
    { file: "public/icons/maskable-192.png", size: 192, svg: maskable },
    { file: "public/icons/maskable-512.png", size: 512, svg: maskable },
    { file: "public/apple-touch-icon.png", size: 180, svg: full },
    { file: "app/apple-icon.png", size: 180, svg: full },
  ];

  const written: Record<string, Buffer> = {};
  for (const item of sizes) {
    const buf = await raster(item.svg, item.size);
    await writeFile(path.join(root, item.file), buf);
    written[item.file] = buf;
  }

  const ico = pngToIco([
    { width: 16, height: 16, data: written["public/icons/icon-16.png"] },
    { width: 32, height: 32, data: written["public/icons/icon-32.png"] },
    { width: 48, height: 48, data: await raster(simple, 48) },
  ]);
  await writeFile(path.join(root, "app/favicon.ico"), ico);
  await writeFile(path.join(root, "public/favicon.ico"), ico);

  const icon512 = written["public/icons/icon-512.png"];
  const iconHref = `data:image/png;base64,${icon512.toString("base64")}`;
  const og = ogSvg({ headline: APP_NAME, tagline: APP_TAGLINE, iconHref });
  const ogPng = await sharp(Buffer.from(og)).png().toBuffer();
  await writeFile(path.join(root, "public/og.png"), ogPng);
  await writeFile(path.join(root, "app/opengraph-image.png"), ogPng);
  await writeFile(path.join(root, "app/twitter-image.png"), ogPng);
  await writeFile(path.join(root, "app/opengraph-image.alt.txt"), APP_NAME);
  await writeFile(path.join(root, "app/twitter-image.alt.txt"), APP_NAME);

  console.log("rendered icons and OG card");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
