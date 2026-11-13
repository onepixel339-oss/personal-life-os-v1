/* Fractional ordering keys — reorders write one row (§6.1).
   Keys are canonical base-36 fraction strings: value = 0.key in base 36,
   compared lexicographically; "" (empty) is the smallest (start sentinel);
   no key ever ends with "0". */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function digitVal(c: string): number {
  return DIGITS.indexOf(c);
}

function digitChar(n: number): string {
  return DIGITS[n];
}

/** Smallest canonical key strictly greater than a (a = "" means "after nothing"). */
export function successor(a: string): string {
  if (a === "") return "1";
  const last = a[a.length - 1];
  if (last !== "z") {
    return a.slice(0, -1) + digitChar(digitVal(last) + 1);
  }
  return a + "1";
}

/** Midpoint strictly between canonical a < b (a may be ""). */
export function midpoint(a: string, b: string): string {
  if (!(a < b)) throw new Error("midpoint: a must be < b");
  let m = "";
  for (let i = 0; ; i++) {
    const da = a[i] ?? "0";
    const db = b[i] ?? "0";
    const na = digitVal(da);
    const nb = digitVal(db);
    if (nb - na > 1) {
      return m + digitChar(Math.floor((na + nb) / 2));
    }
    if (nb - na === 1) {
      // emit da, then step just past the remainder of a
      return m + da + successor(a.slice(i + 1));
    }
    // na === nb — continue (b cannot run out before a does when a < b)
    m += da;
  }
}

/** Generate a key strictly between a and b. null a = before everything; null b = after everything. */
export function keyBetween(
  a: string | null,
  b: string | null
): string {
  const lo = a ?? "";
  if (b === null) return successor(lo);
  if (!(lo < b)) throw new Error(`keyBetween: expected "${lo}" < "${b}"`);
  return midpoint(lo, b);
}

/** Key to append after the last of the given keys. */
export function keyAfter(keys: string[]): string {
  if (keys.length === 0) return "1";
  const max = keys.reduce((acc, k) => (k > acc ? k : acc), "");
  return successor(max);
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
