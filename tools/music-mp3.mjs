// npm run build step, after the kit's compress: the music of the package as MP3. compress only replaces a file when the
// MP3 is smaller, so some music stays Ogg Vorbis, which older Safari (iPhone) cannot decode: no music there. The music
// is what public/assets/manifest.json lists (manifest.music); the effects stay as compress left them, like the JS_SDK_2.0
// builds. audio/files.json, the file names the game reads, follows.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const KBPS = 128; // config.json compress.audio "normal": music at 128 kbps
const game = JSON.parse(readFileSync('public/game.json', 'utf8'));
const dir = join('export/build', `${game.version}-${game.id}`, 'assets/audio');
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
const music = new Set(Object.values(manifest.music).filter(Array.isArray).flat().map((id) => id.split('/').pop()));
const listFile = join(dir, 'files.json');
const files = JSON.parse(readFileSync(listFile, 'utf8'));

const run = (args) => new Promise((done) => execFile(ffmpeg, args, { windowsHide: true }, (err) => done(err)));

let n = 0;
for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.[^.]+$/, '');
  if (!music.has(name) || files[i].endsWith('.mp3')) continue;
  const src = join(dir, files[i]);
  const out = join(dir, `${name}.mp3`);
  const err = await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', `${KBPS}k`, out]);
  if (err || !existsSync(out)) {
    console.error(`music-mp3: ${files[i]} failed: ${err?.message ?? 'no output'}`);
    process.exit(1);
  }
  console.log(`music-mp3: ${files[i]} -> ${name}.mp3 (${(statSync(out).size / 1048576).toFixed(2)} MB)`);
  rmSync(src);
  files[i] = `${name}.mp3`;
  n++;
}
writeFileSync(listFile, JSON.stringify(files));
console.log(`music-mp3: ${n} file(s), all music is MP3`);
