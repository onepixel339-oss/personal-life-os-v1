/* Language state — tiny zero-dependency module so dates.ts can read the
   active language without import cycles (i18n.ts owns the reactive part). */

export type Lang = "en" | "ar";

let _lang: Lang = "en";

export function setLangState(lang: Lang): void {
  _lang = lang;
}

export function getLangState(): Lang {
  return _lang;
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Convert Western digits to Arabic-Indic digits (Egyptian convention). */
export function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

export const AR_MONTHS_SHORT = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export const AR_MONTHS_LONG = AR_MONTHS_SHORT;

export const AR_WEEKDAYS_LONG = [
  "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
];

export const AR_WEEKDAYS_SHORT = AR_WEEKDAYS_LONG;

export const AR_AM = "ص";
export const AR_PM = "م";
