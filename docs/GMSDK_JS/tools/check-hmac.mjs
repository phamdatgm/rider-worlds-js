/**
 * leaderboard/hmac.js against known answers and against Node's own crypto - the leaderboard's
 * score token is computed with it wherever WebCrypto is missing (plain-http portal pages).
 *
 *   node docs/GMSDK_JS/tools/check-hmac.mjs
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hmacSha256, sha256, toHex } from '../leaderboard/hmac.js';

const enc = new TextEncoder();
let bad = 0;
const check = (name, got, want) => {
  if (got !== want) { bad++; console.log(`FAIL ${name}\n  got  ${got}\n  want ${want}`); }
};

// FIPS 180-4 examples
check('sha256("abc")', toHex(sha256(enc.encode('abc'))),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('sha256("")', toHex(sha256(new Uint8Array(0))),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
// RFC 4231 test case 1
check('hmac rfc4231-1', toHex(hmacSha256(new Uint8Array(20).fill(0x0b), enc.encode('Hi There'))),
  'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');

// random sizes, including the block-size boundaries the padding has to get right
for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 200, 1000]) {
  const msg = randomBytes(len);
  check(`sha256 len ${len}`, toHex(sha256(new Uint8Array(msg))), createHash('sha256').update(msg).digest('hex'));
  for (const klen of [1, 32, 64, 65, 100]) {
    const key = randomBytes(klen);
    check(`hmac key ${klen} len ${len}`, toHex(hmacSha256(new Uint8Array(key), new Uint8Array(msg))),
      createHmac('sha256', key).update(msg).digest('hex'));
  }
}

// the real token shape: "<playerId>:<score*1000>:<unix/30>"
const keyHex = '177733f1c6aab38d236300699d99516efc89758aff6f9498eea96b8af44cb582';
const keyBytes = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
const msg = 'ab655c7b-7a27-4d8b-b714-0b1dc50212db:7000:58652345';
check('score token', toHex(hmacSha256(keyBytes, enc.encode(msg))),
  createHmac('sha256', Buffer.from(keyHex, 'hex')).update(msg).digest('hex'));

console.log(bad === 0 ? 'hmac.js: all checks passed' : `hmac.js: ${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
