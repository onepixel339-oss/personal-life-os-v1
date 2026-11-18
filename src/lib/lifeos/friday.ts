/* The Friday ritual helper (v1.5) — pure date logic, no React.
   The card that uses it lives in shared/friday-alarm-card.tsx. */

import { dayOfWeek } from "./dates";

/** v1.5 — from the FIRST Friday after registration. The old gate (a full
 *  week since registration AND a closure) hid the ritual exactly when it
 *  mattered most: the first two Fridays of a new user's life. */
export function shouldShowFridayAlarm(params: {
  dismissed: boolean;
  done: boolean;
  lifeToday: string;
}): boolean {
  if (params.dismissed || params.done) return false;
  return dayOfWeek(params.lifeToday) === 5; // Friday
}
