/* Ramadan service (v1.2) — a one-tap seasonal rhythm for the five default
   periods (names + taglines only; prayer anchors stay untouched). The
   original settings are backed up first and restored automatically once
   Ramadan is over. Purely local, reversible, opt-in. */

import { db, getSetting, setSetting } from "../db";
import { emitChange } from "../events";
import { SETTING_KEYS } from "../defaults";
import { isRamadan, RAMADAN_PERIODS } from "../ramadan";
import type { PeriodSetting, Result } from "../types";
import { ok } from "../types";

export async function ramadanBackupExists(): Promise<boolean> {
  const backup = await getSetting<PeriodSetting[] | null>(
    SETTING_KEYS.ramadanPeriodsBackup,
    null
  );
  return Array.isArray(backup) && backup.length > 0;
}

/** Rename the five default periods to the Ramadan rhythm (anchors untouched). */
export async function applyRamadanPeriods(): Promise<Result<void>> {
  const existing = await db.periodSettings.toArray();
  const backupExists = await ramadanBackupExists();
  if (!backupExists) {
    await setSetting(SETTING_KEYS.ramadanPeriodsBackup, existing);
  }
  const byOrder = new Map(RAMADAN_PERIODS.map((p) => [p.order, p]));
  await db.transaction("rw", db.periodSettings, async () => {
    for (const ps of existing) {
      const ramadan = byOrder.get(ps.order);
      if (!ps.isDefault || !ramadan) continue;
      await db.periodSettings.update(ps.id, {
        name: ramadan.name,
        tagline: ramadan.tagline,
      });
    }
  });
  emitChange(["periodSettings"]);
  return ok(undefined);
}

/** Restore the pre-Ramadan period settings (auto-called after Ramadan). */
export async function revertRamadanPeriods(): Promise<void> {
  const backup = await getSetting<PeriodSetting[] | null>(
    SETTING_KEYS.ramadanPeriodsBackup,
    null
  );
  if (!Array.isArray(backup) || backup.length === 0) return;
  await db.periodSettings.clear();
  await db.periodSettings.bulkAdd(backup);
  await setSetting(SETTING_KEYS.ramadanPeriodsBackup, null);
  emitChange(["periodSettings"]);
}

/** Boot check: once Ramadan is over, quietly bring the rhythm back. */
export async function maybeRevertRamadan(): Promise<void> {
  try {
    if (!(await ramadanBackupExists())) return;
    if (isRamadan()) return;
    await revertRamadanPeriods();
  } catch (e) {
    console.error("maybeRevertRamadan failed", e);
  }
}

/** Has the Ramadan rhythm card already been shown recently (once per season)? */
export async function ramadanPromptRecentlyShown(): Promise<boolean> {
  const shownAt = await getSetting<number | null>(
    SETTING_KEYS.ramadanPromptShownAt,
    null
  );
  if (typeof shownAt !== "number") return false;
  // ~10 months: suppress for the rest of this Ramadan season only
  return Date.now() - shownAt < 300 * 24 * 60 * 60 * 1000;
}

export async function markRamadanPromptShown(): Promise<void> {
  await setSetting(SETTING_KEYS.ramadanPromptShownAt, Date.now());
}
