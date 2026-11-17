/* Prayer-time resolution — Master Specification §9.4.
   Manual mode: user-entered times applying to all days.
   Calculated mode: offline `adhan` library with manually entered coordinates,
   calculation method, Asr school and per-prayer minute corrections.
   No network request is ever required. */

import * as adhan from "adhan";
import { isValidTimeString, minutesToTime, timeToMinutes } from "./dates";
import type { PrayerKey } from "./types";

export const PRAYER_KEYS: PrayerKey[] = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export type CalcMethod =
  | "Egyptian"
  | "MuslimWorldLeague"
  | "NorthAmerica"
  | "UmmAlQura"
  | "Makkah"
  | "Karachi"
  | "Tehran"
  | "Dubai"
  | "Kuwait"
  | "Qatar"
  | "Singapore"
  | "Turkey";

export const CALC_METHOD_LABELS: Record<CalcMethod, string> = {
  Egyptian: "Egyptian General Authority of Survey",
  MuslimWorldLeague: "Muslim World League",
  NorthAmerica: "ISNA (North America)",
  UmmAlQura: "Umm al-Qura, Makkah",
  Makkah: "Umm al-Qura, Makkah",
  Karachi: "University of Islamic Sciences, Karachi",
  Tehran: "Institute of Geophysics, Tehran",
  Dubai: "Dubai",
  Kuwait: "Kuwait",
  Qatar: "Qatar",
  Singapore: "MUIS, Singapore",
  Turkey: "Diyanet, Turkey",
};

export interface PrayerSettings {
  mode: "manual" | "calculated";
  manual: Record<PrayerKey, string>; // HH:mm
  calculated: {
    latitude: number;
    longitude: number;
    method: CalcMethod;
    madhab: "shafi" | "hanafi";
    corrections: Record<PrayerKey, number>; // minutes
    city?: string; // preset id from EGYPT_CITIES — display convenience only
  };
}

export const DEFAULT_MANUAL_TIMES: Record<PrayerKey, string> = {
  fajr: "04:30",
  sunrise: "06:00",
  dhuhr: "12:00",
  asr: "15:15",
  maghrib: "17:30",
  isha: "18:45",
};

/* Egyptian cities, pre-baked (v1.3) — for when the browser location is off.
   The coordinates live inside the bundle: picking a city never touches the
   network, it only fills the two number fields the user could have typed. */
export interface EgyptCity {
  id: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
}

export const EGYPT_CITIES: EgyptCity[] = [
  { id: "cairo", nameAr: "القاهرة", nameEn: "Cairo", lat: 30.0444, lng: 31.2357 },
  { id: "giza", nameAr: "الجيزة", nameEn: "Giza", lat: 30.0131, lng: 31.2089 },
  { id: "alexandria", nameAr: "الإسكندرية", nameEn: "Alexandria", lat: 31.2001, lng: 29.9187 },
  { id: "portsaid", nameAr: "بورسعيد", nameEn: "Port Said", lat: 31.2653, lng: 32.3019 },
  { id: "suez", nameAr: "السويس", nameEn: "Suez", lat: 29.9668, lng: 32.5498 },
  { id: "ismailia", nameAr: "الإسماعيلية", nameEn: "Ismailia", lat: 30.5852, lng: 32.2654 },
  { id: "mansoura", nameAr: "المنصورة", nameEn: "Mansoura", lat: 31.0409, lng: 31.3785 },
  { id: "tanta", nameAr: "طنطا", nameEn: "Tanta", lat: 30.7865, lng: 30.9982 },
  { id: "zagazig", nameAr: "الزقازيق", nameEn: "Zagazig", lat: 30.5877, lng: 31.502 },
  { id: "damietta", nameAr: "دمياط", nameEn: "Damietta", lat: 31.4176, lng: 31.6743 },
  { id: "fayoum", nameAr: "الفيوم", nameEn: "Fayoum", lat: 29.3084, lng: 30.8428 },
  { id: "asyut", nameAr: "أسيوط", nameEn: "Asyut", lat: 27.1783, lng: 31.1859 },
  { id: "sohag", nameAr: "سوهاج", nameEn: "Sohag", lat: 26.5591, lng: 31.6957 },
  { id: "qena", nameAr: "قنا", nameEn: "Qena", lat: 26.1551, lng: 32.716 },
  { id: "luxor", nameAr: "الأقصر", nameEn: "Luxor", lat: 25.6872, lng: 32.6392 },
  { id: "aswan", nameAr: "أسوان", nameEn: "Aswan", lat: 24.0889, lng: 32.8998 },
  { id: "hurghada", nameAr: "الغردقة", nameEn: "Hurghada", lat: 27.2579, lng: 33.8116 },
  { id: "marsamatrouh", nameAr: "مرسى مطروح", nameEn: "Marsa Matrouh", lat: 31.3543, lng: 27.2373 },
];

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  mode: "calculated",
  manual: { ...DEFAULT_MANUAL_TIMES },
  calculated: {
    latitude: 30.0444,
    longitude: 31.2357, // Cairo — editable; stored locally only
    method: "Egyptian",
    madhab: "shafi",
    corrections: {
      fajr: 0,
      sunrise: 0,
      dhuhr: 0,
      asr: 0,
      maghrib: 0,
      isha: 0,
    },
  },
};

function methodParams(method: CalcMethod): adhan.CalculationParameters {
  switch (method) {
    case "MuslimWorldLeague":
      return adhan.CalculationMethod.MuslimWorldLeague();
    case "NorthAmerica":
      return adhan.CalculationMethod.NorthAmerica();
    case "UmmAlQura":
    case "Makkah":
      return adhan.CalculationMethod.UmmAlQura();
    case "Karachi":
      return adhan.CalculationMethod.Karachi();
    case "Tehran":
      return adhan.CalculationMethod.Tehran();
    case "Dubai":
      return adhan.CalculationMethod.Dubai();
    case "Kuwait":
      return adhan.CalculationMethod.Kuwait();
    case "Qatar":
      return adhan.CalculationMethod.Qatar();
    case "Singapore":
      return adhan.CalculationMethod.Singapore();
    case "Turkey":
      return adhan.CalculationMethod.Turkey();
    case "Egyptian":
    default:
      return adhan.CalculationMethod.Egyptian();
  }
}

/** Resolve all six prayer times for a date. Never throws; falls back to manual (§9.4). */
export function resolvePrayerTimes(
  dateStr: string,
  settings: PrayerSettings
): { times: Record<PrayerKey, string>; fallback: boolean } {
  const manual = () => ({
    times: { ...settings.manual },
    fallback: true,
  });
  if (settings.mode === "manual") return manual();
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    // noon local keeps date components stable across zones
    const date = new Date(y, m - 1, d, 12, 0, 0);
    const coords = new adhan.Coordinates(
      settings.calculated.latitude,
      settings.calculated.longitude
    );
    const params = methodParams(settings.calculated.method);
    params.madhab =
      settings.calculated.madhab === "hanafi"
        ? adhan.Madhab.Hanafi
        : adhan.Madhab.Shafi;
    const pt = new adhan.PrayerTimes(coords, date, params);
    const out = {} as Record<PrayerKey, string>;
    for (const key of PRAYER_KEYS) {
      const raw = pt[key as keyof adhan.PrayerTimes] as Date;
      if (!(raw instanceof Date) || isNaN(raw.getTime())) return manual();
      const minutes =
        raw.getHours() * 60 + raw.getMinutes() + settings.calculated.corrections[key];
      out[key] = minutesToTime(((minutes % 1440) + 1440) % 1440);
    }
    return { times: out, fallback: false };
  } catch {
    return manual();
  }
}

/** True if every manual time is a valid HH:mm. */
export function manualTimesValid(manual: Record<PrayerKey, string>): boolean {
  return PRAYER_KEYS.every((k) => isValidTimeString(manual[k]));
}

/** For display: anchor label like "Fajr → Dhuhr". */
export function prayerPairLabel(a: PrayerKey, b: PrayerKey): string {
  return `${PRAYER_LABELS[a]} → ${PRAYER_LABELS[b]}`;
}

/** Simple overlap sanity for a resolved set (monotonic, maghrib/isha may cross midnight never expected). */
export function timesAreSane(times: Record<PrayerKey, string>): boolean {
  const vals = PRAYER_KEYS.map((k) => timeToMinutes(times[k]));
  return vals.every((v, i) => i === 0 || v >= vals[i - 1]);
}
