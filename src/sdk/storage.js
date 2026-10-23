// The game's save (docs/INTEGRATION.md §6): one localStorage key per game, azgames.<gameCode> (azgames.dev without a
// real code), split into areas (settings, profile, leaderboard, …). It belongs to the game: gmsdkjs keeps its own key.
// Plain JS, no build step, no packages: copy to src/sdk/storage.js. getSDK() hands it out as sdk.storage.
//
// Stored value: "gm1" + 8 hex check + the JSON, compressed (LZ, lz-string's UTF-16 coding: ~15 bits per character,
// localStorage counts characters) and scrambled with a key from the gameCode. Unreadable in DevTools, and changing a
// single character breaks the check: that save is dropped (the player starts fresh), never half used. This keeps
// hand edits out; it is not security against someone who reads the code.
//
// Every step is synchronous on purpose: the last save happens on pagehide, where an async write may never finish.

const PREFIX = 'gm1';
const LARGE = 128 * 1024; // characters; a bigger save is allowed but reported (docs/INTEGRATION.md §6)

/** azgames.<gameCode> for g<number>, else azgames.dev. */
export function storageKey(gameCode) {
  const code = String(gameCode ?? '').trim().toLowerCase();
  return /^g\d+$/.test(code) ? `azgames.${code}` : 'azgames.dev';
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const validArea = (a) => typeof a === 'string' && a !== '';

/** FNV-1a 32-bit over UTF-16 code units, 8 hex characters. */
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 15-bit key stream from the gameCode (xorshift32): the same code always gives the same stream. */
function scramble(payload, seedText) {
  let s = parseInt(fnv(`gmsdk:${seedText}`), 16) || 0x9e3779b9;
  let out = '';
  for (let i = 0; i < payload.length; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    const c = payload.charCodeAt(i) - 32; // lz-string UTF-16 characters are 32 + a 15-bit value
    out += String.fromCharCode(((c ^ s) & 0x7fff) + 32);
  }
  return out;
}

/** data → stored string; `seed` = the save key (azgames.<gameCode>). */
export function encodeSave(data, seed) {
  const json = JSON.stringify(data);
  seed = String(seed ?? '');
  const payload = scramble(compressToUTF16(json), seed);
  // The check covers every stored character (padding included), so any hand edit is caught.
  return PREFIX + fnv(`${seed}|${payload}`) + payload;
}

/** stored string → data, or null when it is not a save of this game (hand edited, broken, other format). */
export function decodeSave(text, seed) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX) || text.length < PREFIX.length + 9) return null;
  seed = String(seed ?? '');
  const check = text.slice(PREFIX.length, PREFIX.length + 8);
  const payload = text.slice(PREFIX.length + 8);
  if (fnv(`${seed}|${payload}`) !== check) return null;
  try {
    const json = decompressFromUTF16(scramble(payload, seed));
    if (typeof json !== 'string') return null;
    const data = JSON.parse(json);
    return isObj(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} o
 * @param {string} o.gameCode       g<number> (the save key azgames.<gameCode>)
 * @param {(kind: 'tampered'|'failed'|'large', info: object) => void} [o.onEvent]  reported once each (getSDK sends
 *   them to tracking as save_tampered / save_failed / save_large)
 * @param {number} [o.delayMs]      writes are grouped: one write at most every delayMs (default 300)
 * @param {object} [o.g]            globalThis (tests)
 */
export function createStorage({ gameCode = '', onEvent = () => {}, delayMs = 300, g = globalThis } = {}) {
  const key = storageKey(gameCode);
  const seed = key; // the scramble follows the key, so a save copied to another game does not open
  const memory = new Map();
  const ls = () => {
    try {
      return g.localStorage ?? null;
    } catch {
      return null;
    }
  };
  const read = (k) => {
    try {
      const s = ls();
      if (s) return s.getItem(k);
    } catch {
      // blocked storage: memory below
    }
    return memory.has(k) ? memory.get(k) : null;
  };
  const write = (k, value) => {
    memory.set(k, value);
    try {
      const s = ls();
      if (!s) return false;
      s.setItem(k, value);
      return true;
    } catch (err) {
      return err; // QuotaExceededError & co.
    }
  };
  const reported = new Set();
  const report = (kind, info) => {
    if (reported.has(kind)) return;
    reported.add(kind);
    try {
      onEvent(kind, info);
    } catch {
      // reporting never breaks saving
    }
  };

  let data;
  let existedAtLoad = false;
  let tampered = false;
  const dirty = new Set();
  let timer;

  /** The stored areas, or {} (no save yet, or a save that does not decode: dropped). */
  function stored() {
    const text = read(key);
    if (text === null) return { data: {}, bad: false };
    const d = decodeSave(text, seed);
    return d ? { data: d, bad: false } : { data: {}, bad: true };
  }
  function load() {
    if (data === undefined) {
      const s = stored();
      data = s.data;
      existedAtLoad = !s.bad && read(key) !== null;
      if (s.bad) {
        tampered = true;
        report('tampered', { key });
      }
    }
    return data;
  }
  function flushNow() {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty.size) return true;
    // Another tab may have saved meanwhile: keep its areas, replace only ours.
    const base = stored().data;
    for (const area of dirty) {
      if (data[area] === undefined) delete base[area];
      else base[area] = data[area];
    }
    const text = encodeSave(base, seed);
    const ok = write(key, text);
    if (ok !== true) {
      report('failed', { key, chars: text.length, error: ok ? String(ok.name || ok) : 'no localStorage' });
      return false; // stays dirty: retried on the next save / flush
    }
    if (text.length > LARGE) report('large', { key, chars: text.length });
    dirty.clear();
    return true;
  }
  const schedule = () => {
    if (timer === undefined) timer = setTimeout(flushNow, delayMs);
  };

  function get(area, fallback) {
    try {
      const v = load()[area];
      return v === undefined ? fallback : clone(v);
    } catch {
      return fallback;
    }
  }
  function set(area, value) {
    try {
      if (!validArea(area)) return false;
      load()[area] = clone(value);
      dirty.add(area);
      schedule();
      return true;
    } catch {
      return false;
    }
  }
  function patch(area, part) {
    try {
      if (!validArea(area) || !isObj(part)) return false;
      const cur = load()[area];
      return set(area, { ...(isObj(cur) ? cur : {}), ...part });
    } catch {
      return false;
    }
  }
  /**
   * The game's own keys from before the kit ({ 'mygame.save': 'profile' }): once, when this game has no save yet.
   * JSON values are parsed, others kept as text; the old keys are removed after a good write.
   */
  function migrate(legacy) {
    try {
      load();
      if (existedAtLoad || !isObj(legacy)) return [];
      existedAtLoad = true;
      const moved = [];
      for (const [old, area] of Object.entries(legacy)) {
        if (!validArea(area) || old === key) continue;
        const raw = read(old);
        if (raw === null) continue;
        let v;
        try {
          v = JSON.parse(raw);
        } catch {
          v = raw;
        }
        data[area] = v;
        dirty.add(area);
        moved.push(area);
      }
      if (moved.length && flushNow())
        for (const old of Object.keys(legacy)) {
          memory.delete(old);
          try {
            ls()?.removeItem(old);
          } catch {
            // the old key stays: harmless
          }
        }
      return moved;
    } catch {
      return [];
    }
  }
  function flush() {
    try {
      return flushNow();
    } catch {
      return false;
    }
  }
  /** A plain copy of the whole save, for debugging (DevTools: the stored value is unreadable on purpose). */
  function dump() {
    return clone(load());
  }

  try {
    g.addEventListener?.('pagehide', flush);
    g.document?.addEventListener?.('visibilitychange', () => {
      if (g.document.visibilityState === 'hidden') flush();
    });
  } catch {
    // no window (tests)
  }
  return {
    key,
    get,
    set,
    patch,
    migrate,
    flush,
    dump,
    /** The stored save did not decode (hand edited or broken) and was dropped. */
    get tampered() {
      load();
      return tampered;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// LZ compression, UTF-16 coding: lz-string 1.5.0 (https://github.com/pieroxy/lz-string), _compress and _decompress
// unchanged. MIT License, Copyright (c) 2013 pieroxy:
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of
// the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// ---------------------------------------------------------------------------------------------------------------

const f = String.fromCharCode;

function compressToUTF16(input) {
  return LZ._compress(input, 15, (a) => f(a + 32)) + ' ';
}

function decompressFromUTF16(compressed) {
  if (compressed === '') return null;
  return LZ._decompress(compressed.length, 16384, (index) => compressed.charCodeAt(index) - 32);
}

/* eslint-disable */
const LZ = {
  _compress: function (uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return "";
    var i, value,
        context_dictionary= {},
        context_dictionaryToCreate= {},
        context_c="",
        context_wc="",
        context_w="",
        context_enlargeIn= 2, // Compensate for the first entry which should not count
        context_dictSize= 3,
        context_numBits= 2,
        context_data=[],
        context_data_val=0,
        context_data_position=0,
        ii;

    for (ii = 0; ii < uncompressed.length; ii += 1) {
      context_c = uncompressed.charAt(ii);
      if (!Object.prototype.hasOwnProperty.call(context_dictionary,context_c)) {
        context_dictionary[context_c] = context_dictSize++;
        context_dictionaryToCreate[context_c] = true;
      }

      context_wc = context_w + context_c;
      if (Object.prototype.hasOwnProperty.call(context_dictionary,context_wc)) {
        context_w = context_wc;
      } else {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
          if (context_w.charCodeAt(0)<256) {
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
            }
            value = context_w.charCodeAt(0);
            for (i=0 ; i<8 ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position ==bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i=0 ; i<16 ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }


        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        // Add wc to the dictionary.
        context_dictionary[context_wc] = context_dictSize++;
        context_w = String(context_c);
      }
    }

    // Output the code for w.
    if (context_w !== "") {
      if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
        if (context_w.charCodeAt(0)<256) {
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
          }
          value = context_w.charCodeAt(0);
          for (i=0 ; i<8 ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        } else {
          value = 1;
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1) | value;
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (i=0 ; i<16 ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        value = context_dictionary[context_w];
        for (i=0 ; i<context_numBits ; i++) {
          context_data_val = (context_data_val << 1) | (value&1);
          if (context_data_position == bitsPerChar-1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }


      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
    }

    // Mark the end of the stream
    value = 2;
    for (i=0 ; i<context_numBits ; i++) {
      context_data_val = (context_data_val << 1) | (value&1);
      if (context_data_position == bitsPerChar-1) {
        context_data_position = 0;
        context_data.push(getCharFromInt(context_data_val));
        context_data_val = 0;
      } else {
        context_data_position++;
      }
      value = value >> 1;
    }

    // Flush the last char
    while (true) {
      context_data_val = (context_data_val << 1);
      if (context_data_position == bitsPerChar-1) {
        context_data.push(getCharFromInt(context_data_val));
        break;
      }
      else context_data_position++;
    }
    return context_data.join('');
  },
  _decompress: function (length, resetValue, getNextValue) {
    var dictionary = [],
        next,
        enlargeIn = 4,
        dictSize = 4,
        numBits = 3,
        entry = "",
        result = [],
        i,
        w,
        bits, resb, maxpower, power,
        c,
        data = {val:getNextValue(0), position:resetValue, index:1};

    for (i = 0; i < 3; i += 1) {
      dictionary[i] = i;
    }

    bits = 0;
    maxpower = Math.pow(2,2);
    power=1;
    while (power!=maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position == 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb>0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch (next = bits) {
      case 0:
          bits = 0;
          maxpower = Math.pow(2,8);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
        c = f(bits);
        break;
      case 1:
          bits = 0;
          maxpower = Math.pow(2,16);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
        c = f(bits);
        break;
      case 2:
        return "";
    }
    dictionary[3] = c;
    w = c;
    result.push(c);
    while (true) {
      if (data.index > length) {
        return "";
      }

      bits = 0;
      maxpower = Math.pow(2,numBits);
      power=1;
      while (power!=maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position == 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb>0 ? 1 : 0) * power;
        power <<= 1;
      }

      switch (c = bits) {
        case 0:
          bits = 0;
          maxpower = Math.pow(2,8);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }

          dictionary[dictSize++] = f(bits);
          c = dictSize-1;
          enlargeIn--;
          break;
        case 1:
          bits = 0;
          maxpower = Math.pow(2,16);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
          dictionary[dictSize++] = f(bits);
          c = dictSize-1;
          enlargeIn--;
          break;
        case 2:
          return result.join('');
      }

      if (enlargeIn == 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }

      if (dictionary[c]) {
        entry = dictionary[c];
      } else {
        if (c === dictSize) {
          entry = w + w.charAt(0);
        } else {
          return null;
        }
      }
      result.push(entry);

      // Add w+entry[0] to the dictionary.
      dictionary[dictSize++] = w + entry.charAt(0);
      enlargeIn--;

      w = entry;

      if (enlargeIn == 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }

    }
  }
};
/* eslint-enable */
