/* UUID v7 (time-sortable, client-generated, never reused) — §6.1.
   48-bit unix ms + random; no BigInt (ES2017 target). */

export function uuidv7(): string {
  const ts = Date.now();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // 48-bit unix ms big-endian (safe in Number precision)
  bytes[0] = Math.floor(ts / 1099511627776) & 0xff; // 2^40
  bytes[1] = Math.floor(ts / 4294967296) & 0xff; // 2^32
  bytes[2] = Math.floor(ts / 16777216) & 0xff; // 2^24
  bytes[3] = Math.floor(ts / 65536) & 0xff; // 2^16
  bytes[4] = Math.floor(ts / 256) & 0xff; // 2^8
  bytes[5] = ts & 0xff;
  // version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export const uid = uuidv7;
