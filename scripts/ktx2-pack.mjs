// Compresses the texture pack to KTX2 (Basis Universal ETC1S, with mipmaps) next to the originals:
// public/textures/<name>.ktx2 and <name>@half.ktx2. On the GPU a 2048x1536 sheet drops from ~17 MB to
// 2-4 MB (phones especially), and the files are smaller than the JPGs too. The game loads them when the
// pack says "_ktx2": true and falls back to the JPG/PNG if anything fails. Painted signs and the LUT stay
// as they are (they're drawn on canvases / read as data).
//
//   npm i --no-save ktx2-encoder@0.6 sharp && node scripts/ktx2-pack.mjs [only files whose name has this]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const dir = 'public/textures';
const only = process.argv[2] ?? '';
const pack = JSON.parse(readFileSync(`${dir}/pack.json`, 'utf8'));
const imageDecoder = async (buf) => {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(r.data), width: r.info.width, height: r.info.height };
};

// [file, sRGB color (or linear data like the window masks)]
const jobs = [];
for (const [key, e] of Object.entries(pack)) {
  if (key.startsWith('_') || key.startsWith('sign-') || key === 'lut') continue;
  if (e.file) jobs.push([e.file, true]);
  if (e.mask) jobs.push([e.mask, false]);
}
let saved = 0;
for (const [file, srgb] of jobs) {
  for (const name of [file, pack._half ? file.replace(/(\.\w+)$/, '@half$1') : null].filter(Boolean)) {
    const src = `${dir}/${name}`;
    if (!existsSync(src) || !name.includes(only)) continue;
    const out = src.replace(/\.\w+$/, '.ktx2');
    const t = Date.now();
    // the GPU formats work in 4x4 blocks: round the size to a multiple of four
    const img = sharp(readFileSync(src));
    const { width, height } = await img.metadata();
    const w4 = Math.ceil(width / 4) * 4;
    const h4 = Math.ceil(height / 4) * 4;
    const png = await (w4 !== width || h4 !== height ? img.resize(w4, h4, { fit: 'fill' }) : img).png().toBuffer();
    const ktx = await encodeToKTX2(new Uint8Array(png), {
      imageDecoder,
      isUASTC: false,
      qualityLevel: srgb ? 230 : 160,
      generateMipmap: true,
      isSetKTX2SRGBTransferFunc: srgb,
      // compressed textures can't be flipped on upload like images are: flip them here instead
      isYFlip: true,
    });
    writeFileSync(out, ktx);
    saved += readFileSync(src).length - ktx.length;
    console.log(`ktx2: ${name} -> ${(ktx.length / 1024).toFixed(0)} KB (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
}
pack._ktx2 = true;
writeFileSync(`${dir}/pack.json`, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`ktx2: ${jobs.length} textures, ${(saved / 1e6).toFixed(1)} MB smaller than the originals`);
