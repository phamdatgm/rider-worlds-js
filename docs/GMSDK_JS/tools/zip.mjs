#!/usr/bin/env node
/**
 * Packs the export package into one zip (docs/EXPORT.md §8), written inside the package next to index.html:
 * export/build/<version>-<id>/<version>-<id>.zip, holding every file of the folder (index.html at the root of the zip)
 * but no .zip at the root. That zip is what goes up to the build tool on the API. Run it last, after assemble
 * and check-export. Plain Node 18+, no packages.
 *
 *   node docs/GMSDK_JS/tools/zip.mjs [<packageDir>]
 *
 * <packageDir>: default export/build/<version>-<id> from public/game.json. The zip is deterministic: files in name
 * order, every date set to the version's day, so the same package gives the same zip byte for byte. Files that
 * are compressed already (images, audio, video, fonts, archives) are stored; the rest is deflated at level 9.
 * After writing, the zip is read back and every entry compared with its file.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const STORED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.mp3', '.ogg', '.m4a', '.aac', '.opus', '.mp4', '.webm', '.woff', '.woff2', '.zip', '.gz', '.br']);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date / time of the version's day at 00:00 (yymmddXX), or 1980-01-01. */
function dosDateTime(version) {
  const m = /^(\d{2})(\d{2})(\d{2})\d{2}$/.exec(version ?? '');
  const [y, mo, d] = m ? [2000 + +m[1], +m[2], +m[3]] : [1980, 1, 1];
  return { date: ((y - 1980) << 9) | (mo << 5) | d, time: 0 };
}

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Zips at the root of the package (this tool's own output) never go into the zip. */
const ownZip = (name) => !name.includes('/') && extname(name).toLowerCase() === '.zip';

/** The zip of every file under dir, names relative to dir with '/', without the root .zip files. */
export function zipFolder(dir, version) {
  const { date, time } = dosDateTime(version);
  const names = walk(dir).map((f) => relative(dir, f).split(sep).join('/')).filter((n) => !ownZip(n)).sort();
  if (names.length > 0xffff) throw new Error(`${names.length} files: more than a zip without zip64 holds`);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const data = readFileSync(join(dir, name));
    const store = STORED.has(extname(name).toLowerCase());
    const body = store ? data : deflateRawSync(data, { level: 9 });
    const method = store || body.length >= data.length ? 0 : 8;
    const payload = method === 0 ? data : body;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');
    if (offset + 30 + nameBuf.length + payload.length > 0xffffffff) throw new Error('the zip would pass 4 GB: more than a zip without zip64 holds');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by: 2.0, MS-DOS
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // disk 0, no comment, no attributes

    locals.push(local, nameBuf, payload);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + payload.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return { zip: Buffer.concat([...locals, ...centrals, end]), names };
}

/** Reads the zip back through its central directory: { name: content }. Throws on anything malformed. */
export function readZip(zip) {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('no end of central directory');
  const count = zip.readUInt16LE(endAt + 10);
  let p = zip.readUInt32LE(endAt + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error(`central entry ${i}: bad signature`);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extra = zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const at = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength);
    if (zip.readUInt32LE(at) !== 0x04034b50) throw new Error(`${name}: bad local header`);
    const start = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
    const raw = zip.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    if (crc32(data) !== crc) throw new Error(`${name}: CRC differs`);
    files[name] = data;
    p += 46 + nameLength + extra;
  }
  return files;
}

function main() {
  let dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!dir) {
    const g = JSON.parse(readFileSync('public/game.json', 'utf8').replace(/^﻿/, ''));
    dir = `export/build/${g.version}-${g.id}`;
  }
  dir = resolve(dir);
  let game;
  try {
    game = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8').replace(/^﻿/, ''));
  } catch {
    console.error(`no export package at ${dir} (build it first)`);
    process.exit(2);
  }
  try {
    statSync(join(dir, 'index.html'));
  } catch {
    console.error(`${dir} has no index.html: run tools/assemble.mjs first (the zip goes up with the gm page at its root)`);
    process.exit(1);
  }
  const out = join(dir, `${basename(dir)}.zip`);
  const { zip, names } = zipFolder(dir, game.version);
  writeFileSync(out, zip);

  // Read it back: the same names, every byte equal to the file.
  const back = readZip(readFileSync(out));
  const bad = names.filter((n) => !back[n] || !back[n].equals(readFileSync(join(dir, n))));
  if (Object.keys(back).length !== names.length || bad.length) {
    console.error(`${out}: the zip does not match the folder (${bad.slice(0, 5).join(', ') || 'entry count'})`);
    process.exit(1);
  }
  console.log(`${relative(process.cwd(), out) || out}: ${names.length} files, ${(zip.length / 1024 / 1024).toFixed(2)} MB (read back OK)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
