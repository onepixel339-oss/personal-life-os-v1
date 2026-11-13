/* Consistency tests — the bilingual dictionary.
   EN and AR must cover exactly the same keys (no missing Arabic, no stray
   keys), values must be non-empty, and runtime translation must cover the
   service-layer messages. This is the "the site is coherent" guarantee. */

import { describe, expect, test } from "bun:test";
import { ar, en, rt, t } from "../src/lib/lifeos/i18n";
import { setLangState } from "../src/lib/lifeos/lang-state";

describe("dictionary parity (EN <-> AR)", () => {
  const enKeys = new Set(Object.keys(en));
  const arKeys = new Set(Object.keys(ar));

  test("both dictionaries are non-trivial", () => {
    expect(enKeys.size).toBeGreaterThan(500);
    expect(arKeys.size).toBeGreaterThan(500);
  });

  test("no keys missing from Arabic", () => {
    const missing = [...enKeys].filter((k) => !arKeys.has(k));
    expect(missing).toEqual([]);
  });

  test("no stray Arabic keys (nothing orphaned in AR)", () => {
    const stray = [...arKeys].filter((k) => !enKeys.has(k));
    expect(stray).toEqual([]);
  });

  test("no empty values in either dictionary", () => {
    const emptyEn = Object.entries(en).filter(([, v]) => !v || !v.trim());
    const emptyAr = Object.entries(ar).filter(([, v]) => !v || !v.trim());
    expect(emptyEn).toEqual([]);
    expect(emptyAr).toEqual([]);
  });

  test("placeholder params survive translation ({x} present on both sides)", () => {
    const paramRe = /\{(\w+)\}/g;
    const mismatched: string[] = [];
    for (const [key, value] of Object.entries(en)) {
      const enParams = [...value.matchAll(paramRe)].map((m) => m[1]).sort();
      const arParams = [...(ar[key] ?? "").matchAll(paramRe)].map((m) => m[1]).sort();
      if (JSON.stringify(enParams) !== JSON.stringify(arParams)) {
        mismatched.push(`${key}: {${enParams}} vs {${arParams}}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe("t()", () => {
  test("English resolves a known key", () => {
    setLangState("en");
    expect(t("app.name")).toBe("Personal Life OS");
  });

  test("Arabic resolves the same key", () => {
    setLangState("ar");
    expect(t("app.name")).toBe(ar["app.name"]);
    expect(t("app.name")).not.toBe("app.name");
  });

  test("missing keys fall back to the key itself (visible, not silent)", () => {
    setLangState("en");
    expect(t("no.such.key")).toBe("no.such.key");
  });

  test("params interpolate", () => {
    setLangState("en");
    expect(t("shell.inboxBadge", { count: 3 })).toBe("3 in inbox");
    setLangState("ar");
    expect(t("shell.inboxBadge", { count: 3 })).toBe("3 في الوارد");
  });

  test("an unknown param keeps its placeholder", () => {
    setLangState("en");
    expect(t("shell.inboxBadge", {})).toContain("{count}");
  });
});

describe("rt() — runtime strings from services", () => {
  test("English passes through untouched", () => {
    setLangState("en");
    expect(rt("Back on the day")).toBe("Back on the day");
  });

  test("known undo labels translate in Arabic", () => {
    setLangState("ar");
    expect(rt("Back on the day")).toBe("عاد إلى اليوم");
    expect(rt("Removed from the day")).toBe("أُزيل من اليوم");
    expect(rt("No restore snapshot is available.")).toBe(
      "لا توجد لقطة استعادة متاحة."
    );
  });

  test("unknown runtime strings fall back to the original", () => {
    setLangState("ar");
    expect(rt("Something brand new")).toBe("Something brand new");
    expect(rt("")).toBe("");
  });

  test("parameterized patterns translate", () => {
    setLangState("ar");
    expect(rt("Back to Active")).toBe("عاد إلى نشط");
    expect(rt("Status back to Active")).toBe("الحالة عادت إلى نشط");
  });
});
