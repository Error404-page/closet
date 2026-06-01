import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';

const root = process.cwd();
const categories = ['上衣', '外套', '套装', '裙子', '裤子'];
const publicDir = path.join(root, 'public');
const generatedDir = path.join(publicDir, 'assets');
const thumbsDir = path.join(generatedDir, 'thumbs');
const itemsDir = path.join(generatedDir, 'items');
const tmpDir = path.join(root, '.asset-tmp');
const iconDir = path.join(publicDir, 'icons');
const rotationDegreesClockwise = '90';

const imageExt = /\.(png|jpe?g|webp)$/i;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function slugify(input) {
  return input
    .replace(/\.[^.]+$/, '')
    .replace(/^已移除背景的/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Unsupported PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG color format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const rowBytes = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(width * height * channels);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * rowBytes;
    const previousRowStart = rowStart - rowBytes;

    for (let x = 0; x < rowBytes; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= channels ? raw[rowStart + x - channels] : 0;
      const up = y > 0 ? raw[previousRowStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? raw[previousRowStart + x - channels] : 0;

      if (filter === 0) raw[rowStart + x] = value;
      else if (filter === 1) raw[rowStart + x] = (value + left) & 255;
      else if (filter === 2) raw[rowStart + x] = (value + up) & 255;
      else if (filter === 3) raw[rowStart + x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) raw[rowStart + x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter: ${filter}`);
    }
    sourceOffset += rowBytes;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < raw.length; i += channels, p += 4) {
    if (colorType === 0) {
      rgba[p] = raw[i];
      rgba[p + 1] = raw[i];
      rgba[p + 2] = raw[i];
      rgba[p + 3] = 255;
    } else if (colorType === 2) {
      rgba[p] = raw[i];
      rgba[p + 1] = raw[i + 1];
      rgba[p + 2] = raw[i + 2];
      rgba[p + 3] = 255;
    } else if (colorType === 4) {
      rgba[p] = raw[i];
      rgba[p + 1] = raw[i];
      rgba[p + 2] = raw[i];
      rgba[p + 3] = raw[i + 1];
    } else {
      rgba[p] = raw[i];
      rgba[p + 1] = raw[i + 1];
      rgba[p + 2] = raw[i + 2];
      rgba[p + 3] = raw[i + 3];
    }
  }

  return { width, height, rgba };
}

function encodePng(width, height, rgba) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    rgba.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function trimTransparentPng(inputPath, outputPath) {
  const image = decodePng(await readFile(inputPath));
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.rgba[(y * image.width + x) * 4 + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    await writeFile(outputPath, encodePng(image.width, image.height, image.rgba));
    return;
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const padding = Math.max(6, Math.round(Math.max(cropWidth, cropHeight) * 0.025));
  const outWidth = cropWidth + padding * 2;
  const outHeight = cropHeight + padding * 2;
  const cropped = Buffer.alloc(outWidth * outHeight * 4);

  for (let y = 0; y < cropHeight; y += 1) {
    const sourceStart = ((minY + y) * image.width + minX) * 4;
    const targetStart = ((padding + y) * outWidth + padding) * 4;
    image.rgba.copy(cropped, targetStart, sourceStart, sourceStart + cropWidth * 4);
  }

  await writeFile(outputPath, encodePng(outWidth, outHeight, cropped));
}

function makeIcon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    pixels[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4;
      const dx = (x - center) / size;
      const dy = (y - center) / size;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.75);
      pixels[i] = 255;
      pixels[i + 1] = Math.round(226 - glow * 38);
      pixels[i + 2] = Math.round(239 - glow * 16);
      pixels[i + 3] = 255;

      const hanger = y > size * 0.28 && y < size * 0.63 && Math.abs(x - center) < size * 0.025;
      const shoulder =
        y > size * 0.43 &&
        y < size * 0.7 &&
        Math.abs(Math.abs(x - center) - (y - size * 0.39) * 0.9) < size * 0.025;
      const dress =
        y > size * 0.54 &&
        y < size * 0.78 &&
        Math.abs(x - center) < (y - size * 0.48) * 0.45 &&
        Math.abs(x - center) > (y - size * 0.55) * 0.08;
      if (hanger || shoulder || dress) {
        pixels[i] = 83;
        pixels[i + 1] = 58;
        pixels[i + 2] = 253;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const compressed = zlib.deflateSync(pixels, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(thumbsDir, { recursive: true });
await mkdir(itemsDir, { recursive: true });
await mkdir(tmpDir, { recursive: true });
await mkdir(iconDir, { recursive: true });

const assets = [];

for (const category of categories) {
  const categoryDir = path.join(root, category);
  const files = (await readdir(categoryDir)).filter((file) => imageExt.test(file)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  for (const [index, file] of files.entries()) {
    const source = path.join(categoryDir, file);
    const baseId = `${category}-${slugify(file) || index + 1}`;
    const itemName = `${baseId}.webp`;
    const thumbName = `${baseId}.webp`;
    const itemOut = path.join(itemsDir, itemName);
    const thumbOut = path.join(thumbsDir, thumbName);
    const itemRawTmp = path.join(tmpDir, `${baseId}-item-raw.png`);
    const itemTmp = path.join(tmpDir, `${baseId}-item.png`);
    const thumbRawTmp = path.join(tmpDir, `${baseId}-thumb-raw.png`);
    const thumbTmp = path.join(tmpDir, `${baseId}-thumb.png`);

    if (!existsSync(itemOut)) {
      await run('sips', ['-r', rotationDegreesClockwise, '-Z', '1100', source, '--out', itemRawTmp]);
      await trimTransparentPng(itemRawTmp, itemTmp);
      await run('/opt/homebrew/bin/cwebp', ['-quiet', '-q', '82', '-alpha_q', '95', itemTmp, '-o', itemOut]);
    }

    if (!existsSync(thumbOut)) {
      await run('sips', ['-r', rotationDegreesClockwise, '-Z', '360', source, '--out', thumbRawTmp]);
      await trimTransparentPng(thumbRawTmp, thumbTmp);
      await run('/opt/homebrew/bin/cwebp', ['-quiet', '-q', '76', '-alpha_q', '90', thumbTmp, '-o', thumbOut]);
    }

    assets.push({
      id: baseId,
      category,
      name: file.replace(/\.[^.]+$/, '').replace(/^已移除背景的/, ''),
      thumbSrc: `assets/thumbs/${thumbName}`,
      imageSrc: `assets/items/${itemName}`,
    });
  }
}

await writeFile(path.join(generatedDir, 'asset-manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2)}\n`);
await writeFile(path.join(iconDir, 'icon-192.png'), makeIcon(192));
await writeFile(path.join(iconDir, 'icon-512.png'), makeIcon(512));
await rm(tmpDir, { recursive: true, force: true });

console.log(`Prepared ${assets.length} wardrobe assets.`);
