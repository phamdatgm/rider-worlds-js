/**
 * In số băm EXPECT cho dòng bản quyền (src/notice.js).
 *
 *   node JS_SDK_2.0/tools/notice-hash.mjs                      # đọc `notice` trong <webDir>/<runtimeConfig>
 *   node JS_SDK_2.0/tools/notice-hash.mjs "© 2027 Azgames.io"  # tính cho chuỗi bất kỳ
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
let notice = process.argv[2];
if (!notice) {
  const p = join(root, config.webDir ?? 'web', config.runtimeConfig ?? 'src/config.mjs');
  if (!existsSync(p)) throw new Error(`not found: ${p}`);
  notice = /notice:\s*'([^']+)'/.exec(readFileSync(p, 'utf8'))?.[1];
  if (!notice) throw new Error(`${p}: no \`notice\` key`);
}
let x = 0x811c9dc5;
for (const ch of notice) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
console.log(`notice: ${notice}`);
console.log(`export const EXPECT = 0x${x.toString(16).padStart(8, '0')};`);
