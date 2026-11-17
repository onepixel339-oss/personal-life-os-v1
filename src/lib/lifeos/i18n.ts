/* i18n — bilingual (English / العربية) interface with full RTL support.
   `t()` reads the module-level language state (safe in services & helpers),
   `useT()` subscribes components to language changes, `rt()` translates
   runtime strings produced by services (errors, undo labels, suggestions). */

import { create } from "zustand";
import {
  getLangState,
  setLangState,
  type Lang,
} from "./lang-state";
import { db, getSetting, setSetting } from "./db";
import { SETTING_KEYS } from "./defaults";
import type { PrayerKey } from "./types";
import type { CalcMethod } from "./prayer";

export type { Lang };

export const LANG_STORAGE_KEY = "lifeos.lang";

/* ============ dictionaries ============ */

/* Exported for the i18n consistency test (EN/AR key parity). */
export const en: Record<string, string> = {
  /* app / shell */
  "app.name": "Personal Life OS",
  "app.tagline": "Your life, your structure.",
  "shell.search": "Search",
  "shell.quickAdd": "Quick add",
  "shell.offlineReady": "On this device — offline ready",
  "shell.offline": "Offline — everything still works",
  "shell.rightNow": "Right now",
  "shell.until": "until {time}",
  "shell.betweenPeriods": "Between periods — open time.",
  "shell.todayGlance": "Today at a glance",
  "shell.openPage": "An open page.",
  "shell.openTodayLink": "open today →",
  "shell.spaces": "Spaces",
  "shell.noSpaces": "No spaces yet.",
  "shell.allSpaces": "all spaces →",
  "shell.panelNote": "A calm companion — this panel never nags, never scores, never sends anything anywhere.",
  "shell.welcome.title": "Welcome to your daybook",
  "shell.welcome.body": "Five periods shape each day around prayer times — gentle structure, never a schedule. Capture anything with Quick Add; nothing here is a commitment, and nothing moves unless you move it.",
  "shell.welcome.makeItYours": "Make it yours",
  "shell.welcome.start": "Start right away",
  "shell.welcome.dismiss": "Dismiss welcome",
  "shell.undone": "Undone — {label}",
  "shell.inboxBadge": "{count} in inbox",

  /* nav */
  "nav.today": "Today",
  "nav.weekly": "Weekly",
  "nav.spaces": "Spaces",
  "nav.inbox": "Inbox",
  "nav.more": "More",
  "nav.notes": "Notes",
  "nav.entertainment": "Entertainment",
  "nav.review": "Review",
  "nav.routines": "Routines",
  "nav.settings": "Settings",
  "nav.archived": "Archived",
  "nav.primary": "Primary",

  /* make it yours */
  "miy.title": "Make it yours",
  "miy.subtitle": "Optional — you can change any of this later in Settings.",
  "miy.appearance": "Appearance",
  "miy.weekStarts": "Week starts on",
  "miy.light": "Light",
  "miy.dark": "Dark",
  "miy.system": "System",
  "miy.sunday": "Sunday",
  "miy.monday": "Monday",
  "miy.saturday": "Saturday",
  "miy.skip": "Skip",
  "miy.done": "Done",
  "miy.toast": "Made yours — change anything later in Settings",

  /* registration (name only) */
  "register.kicker": "Personal Life OS",
  "register.heading": "Welcome to your life, in your own structure",
  "register.body": "A calm personal space: days shaped around prayer times, spaces for memory, notes, entertainment and routines — all of it on this device only.",
  "register.nameLabel": "Your name",
  "register.namePlaceholder": "What should we call you?",
  "register.hint": "Just your name — no email, no password, no account.",
  "register.cta": "Let's begin",
  "register.langLabel": "Language",
  "register.errorName": "Please write your name first.",
  "register.privacy": "Your data stays on this device, always.",
  "register.welcomeToast": "Welcome, {name}",
  "register.opening": "Opening…",

  /* lock screen (v1.1) */
  "lock.title": "Locked",
  "lock.subtitle": "This daybook opens with your PIN — everything else stays quietly where you left it.",
  "lock.inputLabel": "Enter your PIN",
  "lock.unlock": "Unlock",
  "lock.wrong": "Not this one — try again.",
  "lock.forgot": "Forgot the PIN?",
  "lock.forgotDesc": "Without the PIN there is no way in — there is no account by design. The only way forward is erasing everything on this device and starting fresh. Auto-backups will be erased too.",
  "lock.forgotConfirm": "Erase and start over",

  /* privacy & PIN settings (v1.1) */
  "privacy.desc": "An optional PIN locks this app on this device — a privacy screen for shared phones, not a password. Nothing changes about where your data lives: here, only.",
  "privacy.statusOn": "Lock on",
  "privacy.statusOff": "Lock off",
  "privacy.enable": "Enable PIN lock",
  "privacy.set": "Set PIN",
  "privacy.change": "Change PIN",
  "privacy.changeDo": "Save new PIN",
  "privacy.remove": "Remove lock",
  "privacy.removeDo": "Remove the lock",
  "privacy.currentPin": "Current PIN",
  "privacy.newPin": "New PIN (4–8 digits)",
  "privacy.confirmPin": "Repeat the new PIN",
  "privacy.errFormat": "The PIN must be 4 to 8 digits.",
  "privacy.errMismatch": "The two PINs don't match.",
  "privacy.errCurrent": "The current PIN is wrong.",
  "privacy.savedToast": "Lock enabled — it will ask on open",
  "privacy.changedToast": "PIN changed",
  "privacy.removedToast": "Lock removed",
  "privacy.forgotTitle": "If you forget the PIN",
  "privacy.forgotBody": "There is no reset link and no account — by design. Write the PIN somewhere safe outside this device: forgetting it means erasing everything here to start over.",

  /* install hint (v1.1) */
  "install.title": "Put it on your home screen",
  "install.body": "Installed as an app it keeps its data safest, opens full-screen, and works offline — and it behaves like any other app on your phone.",
  "install.iosStep1": "Open this page in Safari, then tap the Share button",
  "install.iosStep2": "Choose “Add to Home Screen”",
  "install.iosStep3": "Confirm — it opens like any app, no browser bar",
  "install.androidStep1": "Open the browser menu (⋮)",
  "install.androidStep2": "Tap “Install app” or “Add to Home screen”",
  "install.installNow": "Install now",
  "install.desktopStep": "In Chrome or Edge, look for the install icon in the address bar.",
  "install.dismiss": "Hide the install hint",

  /* review week strip (v1.1) */
  "strip.title": "Your week, in shapes",
  "strip.desc": "A quiet look at how the week filled — no numbers, no scores.",
  "strip.unplacedRow": "No period",
  "strip.periodRow": "A period",
  "strip.allQuiet": "A completely quiet week — nothing sat in its periods.",
  "strip.busiest": "{day} carried most of your week.",
  "strip.quietest": "{day} was the gentlest of the full days.",
  "strip.fullest": "{period} was the period you filled most.",
  "strip.emptyDays": "{count} day(s) stayed open, with nothing placed.",
  "strip.allDone": "On {count} day(s) everything placed was also completed.",

  /* common */
  "common.undo": "Undo",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.today": "Today",
  "common.min": "m",
  "common.never": "never yet — only when you feel like it",
  "common.loading": "…",

  /* today */
  "today.title": "A page for today",
  "today.subtitle": "Gentle structure, open space — nothing here is a commitment.",
  "today.opening": "Opening today's page…",
  "today.prevDay": "Previous day",
  "today.nextDay": "Next day",
  "today.newDay": "It's a new day — open today's page?",
  "today.stayHere": "Stay here",
  "today.openToday": "Open today",
  "today.overnight": "Still in last night's period · view {date}",
  "today.greetMorning": "Good morning",
  "today.greetAfternoon": "Good afternoon",
  "today.greetEvening": "Good evening",
  "today.greetNight": "Good night",
  "today.greetWithName": "{greet}, {name}",
  "today.noPeriods": "No periods are enabled — enable them in Settings › Daily periods.",
  "today.openPeriodSettings": "Open period settings",
  "today.placedToast": "Placed “{title}” in {period}",
  "today.unplaced": "Held for later today",
  "today.unplacedHint": "no period, no time — still visible",
  "today.holdElse": "hold something else",

  /* periods (display) */
  "period.now": "Now",
  "period.addExisting": "add existing",
  "period.addExistingAria": "Add an existing item",
  "period.addExistingTitle": "Add an existing item to this period",
  "period.addExistingDesc": "A reference is placed — the item stays where it is.",
  "period.flexible": "flexible",
  "period.begin": "begin",
  "period.beginSomething": "begin something",

  /* more screen */
  "more.title": "More",
  "more.subtitle": "The quieter corners — notes, memories, reflection and settings.",
  "more.profile.edit": "Edit profile",
  "more.profile.memberSince": "Member since {date}",
  "more.notes": "Notes",
  "more.notesDesc": "Quiet pages — plain text or Markdown.",
  "more.entertainment": "Entertainment",
  "more.entertainmentDesc": "What you watch and play, gently tracked.",
  "more.review": "Review",
  "more.reviewDesc": "Reflect on a week — optional, never scored.",
  "more.routines": "Routines",
  "more.routinesDesc": "Your own sequences, no streaks.",
  "more.settings": "Settings",
  "more.settingsDesc": "Appearance, calendar, periods, prayer times.",
  "more.backup": "Backup & Restore",
  "more.backupDesc": "Your data lives on this device only.",
  "more.archived": "Archived",
  "more.archivedDesc": "Everything you archived — always recoverable.",
  "more.remindersNote": "A note on reminders: they appear inside the app at relevant moments — Return Notes and gentle “pick up the thread” cards. No push notifications, no badges, no pressure. Your life, your structure.",

  /* settings */
  "settings.title": "Settings",
  "settings.subtitle": "Make it yours — quietly, reversibly, in your own time.",
  "settings.account": "Account",
  "settings.appearance": "Appearance",
  "settings.calendar": "Calendar",
  "settings.periods": "Daily periods",
  "settings.prayer": "Prayer times",
  "settings.reminders": "Reminders",
  "settings.privacy": "Privacy & lock",
  "settings.data": "Data & backup",
  "settings.about": "About",

  "account.desc": "Just your name — no email, no password. Everything stays on this device.",
  "account.name": "Your name",
  "account.namePlaceholder": "The name the app greets you with",
  "account.save": "Save name",
  "account.saved": "Name saved",
  "account.language": "Language",
  "account.languageDesc": "Interface language — the layout direction follows automatically (Arabic is right-to-left).",
  "account.langEn": "English",
  "account.langAr": "العربية",
  "account.memberSince": "Registered since {date}",

  "appearance.desc": "Warm cream by day, warm cocoa by night — following your system if you like.",
  "appearance.inboxBadge": "Inbox count in navigation",
  "appearance.inboxBadgeDesc": "A quiet number, never colored, never urgent.",
  "appearance.inboxBadgeAria": "Show inbox count",
  "appearance.light": "Light",
  "appearance.dark": "Dark",
  "appearance.system": "System",

  "calendar.firstDay": "First day of week",
  "calendar.dateFormat": "Date format",
  "calendar.timeFormat": "Time format",
  "calendar.note": "Changing the first day of week never rewrites existing weeks — old plans keep their stored ranges; new weeks follow the new setting.",
  "calendar.day.0": "Sunday",
  "calendar.day.1": "Monday",
  "calendar.day.2": "Tuesday",
  "calendar.day.3": "Wednesday",
  "calendar.day.4": "Thursday",
  "calendar.day.5": "Friday",
  "calendar.day.6": "Saturday",

  "periods.desc": "Boundaries follow prayer anchors; the names are yours. Editing these never touches days you've already planned — each day keeps its own snapshot. “Use today's setup” is offered on each day, never automatic.",
  "periods.name": "Name",
  "periods.tagline": "Tagline (optional)",
  "periods.startsAt": "Starts at",
  "periods.endsAt": "Ends at",
  "periods.offset": "minutes after (+/-)",
  "periods.shown": "shown",
  "periods.hidden": "hidden",
  "periods.add": "Add a period",
  "periods.newPeriod": "New period",
  "periods.reset": "Reset to the five",
  "periods.resetTitle": "Reset periods to the five defaults?",
  "periods.resetDesc": "Names and taglines return to Morning, Midday, Afternoon, Evening, Night. Your planned days keep their own snapshots.",
  "periods.resetConfirm": "Reset to defaults",
  "periods.resetToast": "The five defaults are back",
  "periods.removedToast": "“{name}” removed",
  "periods.enableAria": "Enable {name}",
  "periods.deleteAria": "Delete {name}",
  "periods.moveUp": "Move up",
  "periods.moveDown": "Move down",
  "periods.preview": "Today, with your anchors",
  "periods.clock": "Clock time",
  "periods.nextDay": "next day",

  "prayer.title": "Prayer times",
  "prayer.desc": "Period boundaries follow prayer anchors. Times are computed offline on this device — computed from coordinates, or entirely by hand. Nothing is ever sent anywhere.",
  "prayer.calculated": "Calculated",
  "prayer.manual": "Manual",
  "prayer.latitude": "Latitude",
  "prayer.longitude": "Longitude",
  "prayer.method": "Calculation method",
  "prayer.asrShafi": "Asr: Shafi",
  "prayer.asrHanafi": "Asr: Hanafi",
  "prayer.correction": "{prayer} ±min",
  "prayer.offlineNote": "Computed offline — no network needed, ever.",
  "prayer.manualNote": "One set of times for every day — you can always switch.",
  "prayer.revert": "Revert",
  "prayer.save": "Save",
  "prayer.savedToast": "Prayer times saved — new days use them; old days keep their snapshots",

  "reminders.body": "Reminders appear inside the app, at relevant moments: Return Notes surface when you open the app or a space, and “pick up the thread” cards appear on Today for things you kept for later. There are no push notifications in this version — nothing pings you when the app is closed. That's on purpose.",
  "reminders.note": "Anything time-bound is visible in its own good time: dated items show up in Today's gentle suggestions up to three days ahead.",

  "data.title": "Backup & restore",
  "data.desc": "Your data lives only on this device. Backups are how you move it or keep it safe — there is no automatic sync, no account, no cloud.",
  "data.export": "Export backup (.json)",
  "data.restore": "Restore from file…",
  "data.lastBackup": "Last backup:",
  "data.never": "never yet — only when you feel like it",
  "data.tooLarge": "That file is very large (>100 MB) — are you sure it's a Life OS backup?",
  "data.unreadableFile": "That file couldn't be read — try picking it again.",
  "data.preview": "Restore preview",
  "data.replaceWarn": "This will replace everything currently on this device ({items} items, {spaces} spaces…) with the backup's contents.",
  "data.notNow": "Not now",
  "data.replace": "Replace everything",
  "data.device": "This device",
  "data.storageUsed": "Storage used:",
  "data.ofQuota": " of about {gb} GB",
  "data.unknown": "unknown",
  "data.persistent": "Persistent storage:",
  "data.granted": "granted",
  "data.notGranted": "not granted",
  "data.itemsCount": "Items:",
  "data.spacesCount": "Spaces:",
  "data.dayPlans": "Day plans:",
  "data.weekPlans": "Week plans:",
  "data.check": "Check my data",
  "data.checkOk": "Everything checks out — nothing dangling",
  "data.checkFixed": "Checked & repaired {count} dangling references",
  "data.undoRestore": "Undo last restore",
  "data.undoRestoreToast": "Restore undone — your previous data is back",
  "data.archivedInfoTitle": "Archived information",
  "data.archivedInfo": "Archived items and spaces live under More › Archived — kept, findable, recoverable. Deleting is always a separate, explicit step.",
  "data.confirmTitle": "Replace everything with the backup?",
  "data.confirmDesc": "A safety snapshot of your current data is taken automatically (available via “Undo last restore”). This cannot be partially applied — it either fully succeeds or nothing changes.",
  "data.restoredToast": "Restored — {count} items are back",
  "data.backupSaved": "Backup saved — {filename}",

  /* auto-backup (v1.1) */
  "data.autoTitle": "Auto-backup on this device",
  "data.autoDesc": "Once a week, quietly, a snapshot of everything is kept inside this device — separate from your data, surviving restores. It is not a file in your downloads; it lives here with you.",
  "data.autoLast": "Last auto-backup:",
  "data.autoNever": "not yet — it happens on its own after your first week",
  "data.autoEmpty": "No auto-backups yet.",
  "data.autoCreateNow": "Take one now",
  "data.autoCreatedToast": "Auto-backup taken",
  "data.autoRestore": "Restore",
  "data.autoConfirmTitle": "Restore this auto-backup?",
  "data.autoConfirmDesc": "Everything currently in the app will be replaced by this snapshot. A safety snapshot of the current state is taken first (undoable from “Undo last restore”).",

  "about.version": "Version 1.1.0 · schema 1 · Your life, your structure.",
  "about.body": "A calm, flexible personal environment: daily planning, weekly focus, spaces for memory, notes, entertainment and routines — offline, private, no accounts.",
  "about.bullet1": "All data stays in this browser's IndexedDB",
  "about.bullet2": "No analytics, no network calls",
  "about.bullet3": "Undo for the last 20 actions of a session",

  /* week day names (long) reused by calendar */
  "date.weekday.0": "Sunday",
  "date.weekday.1": "Monday",
  "date.weekday.2": "Tuesday",
  "date.weekday.3": "Wednesday",
  "date.weekday.4": "Thursday",
  "date.weekday.5": "Friday",
  "date.weekday.6": "Saturday",

  /* shared dialogs */
  "common.confirm": "Confirm",
  "dialog.findByTitle": "Find by title…",
  "dialog.noMatches": "Nothing matches yet.",
  "dialog.addToDay": "Add to a day",
  "dialog.placementNote": "Placement on a day is a reference — the item itself never moves.",
  "dialog.day": "Day",
  "dialog.periodOptional": "Period (optional)",
  "dialog.noPeriod": "No period",
  "dialog.timeOptional": "Time (optional)",
  "dialog.addToDate": "Add to {date}",
  "dialog.add": "Add",
  "dialog.addToAWeek": "Add to a week",
  "dialog.weekNote": "Pick any day — the whole week containing it is used. Assigning a week never schedules a day.",
  "dialog.anyDayOfWeek": "Any day of that week",
  "dialog.week": "Week",
  "dialog.chooseSpace": "Choose a space",
  "dialog.spaceLinkNote": "Placing an item in a space links it — no copy is made.",
  "dialog.noSpacesYet": "No spaces yet — create one from Spaces.",
  "dialog.removeLinkHint": "To remove a link, open the item and use its spaces list.",
  "dialog.noSpace": "No space",
  "dialog.impactSpaces": "In {count} space(s): {names}",
  "dialog.impactDays": "On {count} day plan(s) (e.g. {example})",
  "dialog.impactWeeks": "On {count} week plan(s)",
  "dialog.impactInbox": "In your Inbox",
  "dialog.impactRelated": "Linked to {count} related item(s)",
  "dialog.deleteTitle": "Delete “{title}” permanently?",
  "dialog.deleteShort": "Delete permanently?",
  "dialog.deleteDesc": "This can't be undone. Archiving keeps it recoverable.",
  "dialog.deleteForever": "Delete forever",
  "dialog.deletedToast": "Deleted “{title}”",

  /* shared primitives */
  "prim.doneReopen": "Done — tap to reopen",
  "prim.skippedReopen": "Skipped — tap to reopen",
  "prim.partialDone": "Partly done — tap to mark done",
  "prim.markDone": "Mark done",
  "prim.markDoneHint": "Mark done (open circle = pending)",
  "prim.view": "View",
  "prim.listView": "List view",
  "prim.timelineView": "Timeline view",

  /* smart resume */
  "resume.kicker": "Pick up the thread",
  "resume.open": "Open",
  "resume.later": "Later",
  "resume.dismiss": "Dismiss",
  "resume.fewer": "fewer",
  "resume.more": "+{count} more",

  /* today entry row */
  "entry.hrs": "{h}h{m}",
  "entry.min": "{m}m",
  "entry.repeatsHint": "Recurring occurrence — its state is independent",
  "entry.repeats": "Repeats",
  "entry.routine": "Routine",
  "entry.setPeriodHint": "Set this period? It's only a suggestion.",
  "entry.looksLike": "Looks like {name} · set?",
  "entry.archivedChip": "Archived · restore or remove",
  "entry.unsorted": "Unsorted",
  "entry.options": "Options",
  "entry.openItem": "Open item",
  "entry.openRoutine": "Open routine",
  "entry.period": "Period",
  "entry.unplaced": "Unplaced",
  "entry.timeDuration": "Time & duration",
  "entry.moveToAnotherDay": "Move to another day",
  "entry.moveDialogDesc": "Pick a new date — the entry will move there and disappear from this day.",
  "entry.repeatsEndToast": "Repeats end before this date",
  "entry.stopRepeatingFromHere": "Stop repeating from here",
  "entry.repeatStoppedToast": "Repeat stopped",
  "entry.stopAllRepeats": "Stop all repeats",
  "entry.cancelJustThisOne": "Cancel just this one",
  "entry.oneCancelledToast": "This one cancelled",
  "entry.removedFromTodayToast": "Removed from today",
  "entry.offTodayToast": "This one is off today",
  "entry.cancelThisOne": "Cancel this one",
  "entry.removeFromToday": "Remove from today",
  "entry.timeDialogDesc": "Optional — a period or a time or neither.",
  "entry.start": "Start",
  "entry.end": "End",
  "entry.durationLabel": "Duration (minutes, optional)",
  "entry.durationExample": "e.g. 45",
  "entry.movedToast": "Moved to {date}",
  "entry.move": "Move",

  /* today timeline */
  "timeline.openSpace": "open space",
  "timeline.nothingWaiting": "Nothing waiting — everything has its place.",
  "timeline.caption": "{date} · timeline view",

  /* weekly */
  "weekly.opening": "Opening the week…",
  "weekly.thisWeek": "This week",
  "weekly.title": "This week, gently",
  "weekly.subtitle": "What deserves attention — an intention, not a promise.",
  "weekly.prevWeek": "Previous week",
  "weekly.nextWeek": "Next week",
  "weekly.outcomes": "Weekly outcomes",
  "weekly.noDayYet": "This week, no day yet",
  "weekly.new": "New",
  "weekly.nothingWaiting": "Nothing waiting for a day — and that's fine.",
  "weekly.add": "add",
  "weekly.openForWhatever": "Open for whatever comes.",
  "weekly.newOutcome": "New outcome",
  "weekly.reflect": "Reflect on this week",
  "weekly.pickerTitle": "Add an existing item to this week",
  "weekly.pickerDesc": "Placing it here never schedules a day.",
  "weekly.joinsToast": "“{title}” joins the week",
  "weekly.weekPassed": "Week passed — choose what to do",
  "weekly.dayOfThisWeek": "Day of this week",
  "weekly.noDayYetShort": "No day yet",
  "weekly.addToDay": "Add to a day (separate step)",
  "weekly.addToAnotherWeek": "Add to another week",
  "weekly.passedChoice": "This week passed — your choice",
  "weekly.keepWhere": "Keep where it is",
  "weekly.returnToInbox": "Return to Inbox",
  "weekly.backInInboxToast": "Back in Inbox — the week keeps its history",
  "weekly.postponedToast": "Postponed — nothing moved",
  "weekly.postpone": "Postpone…",
  "weekly.cancelItem": "Cancel this item",
  "weekly.archivedToast": "Archived",
  "weekly.archive": "Archive",
  "weekly.removedFromWeekToast": "Removed from this week",
  "weekly.removeFromWeek": "Remove from this week",
  "weekly.addedToast": "Added — the old week keeps its history",
  "weekly.tasksDone": "{done} of {total} related tasks done",
  "weekly.timelineCaption": "timeline view · unscheduled items live in the area above",
  "weekly.newOutcomeTitle": "New weekly outcome",
  "weekly.outcomeDesc": "An outcome is a direction for the week, not a deadline. Subtasks are optional and can be added later.",
  "weekly.outcomePlaceholder": "What would make this week feel right?",
  "weekly.firstStepPlaceholder": "First step toward it (optional)",
  "weekly.outcomeToast": "Outcome pinned to the week",
  "weekly.addOutcome": "Add outcome",

  /* review */
  "review.q1": "What did I accomplish?",
  "review.q1Hint": "A read-only list of the week's completed entries waits below.",
  "review.q2": "What remained incomplete?",
  "review.q2Hint": "No judgment — weeks are rhythms, not scores.",
  "review.q3": "What changed?",
  "review.q3Hint": "For you, or around you.",
  "review.q4": "What do I want to carry into next week?",
  "review.q4Hint": "Use the buttons below — each carry is explicit.",
  "review.q5": "What new ideas appeared?",
  "review.q5Hint": "Capture them before they soften.",
  "review.thisWeekReview": "This week's review",
  "review.kicker": "Weekly review",
  "review.title": "Reflect on this week",
  "review.subtitle": "Optional, yours, never scored. Answers save themselves quietly.",
  "review.saving": "Saving…",
  "review.saved": "Saved",
  "review.placeholder": "Write freely… or skip this one.",
  "review.carryLabel": "Carry into next week (explicit, one by one)",
  "review.carriedToast": "Carried to next week — this week keeps its history",
  "review.addToNextWeek": "Add to next week",
  "review.earlier": "Earlier reflections",
  "review.weekOf": "Week of {date}",
  "review.skippable": "Review can be skipped forever — the week doesn't mind.",

  /* archived */
  "archived.opening": "Opening the archive…",
  "archived.title": "Archived",
  "archived.subtitle": "Kept quietly — nothing is deleted, everything is recoverable.",
  "archived.items": "Items ({count})",
  "archived.noItems": "No archived items.",
  "archived.archivedAt": "archived {date}",
  "archived.itemBack": "“{title}” is back",
  "archived.restore": "Restore",
  "archived.spaces": "Spaces ({count})",
  "archived.noSpaces": "No archived spaces.",
  "archived.spaceBack": "“{name}” is back",

  /* spaces */
  "spaces.sugg1": "Learning English",
  "spaces.sugg2": "Reading",
  "spaces.sugg3": "Personal growth",
  "spaces.sugg4": "Home & family",
  "spaces.sugg5": "Health",
  "spaces.opening": "Opening your spaces…",
  "spaces.title": "Spaces",
  "spaces.subtitle": "External memory — projects, interests, ideas, kept like shelves of personal notebooks.",
  "spaces.newSpace": "New space",
  "spaces.empty": "No spaces yet. A space is a shelf for a part of your life — give one a name.",
  "spaces.archivedSpaces": "Archived spaces",
  "spaces.restoredToast": "Space restored",
  "spaces.shelfNote": "Personal shelf · everything stays findable",
  "spaces.addPlus": "+ add",
  "spaces.options": "Space options",
  "spaces.rename": "Rename / describe",
  "spaces.archivedToast": "Space archived — its items stay untouched",
  "spaces.archiveSpace": "Archive space",
  "spaces.openingSpace": "Opening this space…",
  "spaces.notHere": "This space isn't here anymore.",
  "spaces.backToSpaces": "Back to spaces",
  "spaces.allSpaces": "All spaces",
  "spaces.shelfOfItsOwn": "A shelf of its own — no fixed sections required.",
  "spaces.newHere": "New here",
  "spaces.inYourPlans": "Currently in your plans",
  "spaces.todayChip": "Today · {title}",
  "spaces.weekChip": "This week · {title}",
  "spaces.filterAll": "Everything",
  "spaces.filterActive": "Active",
  "spaces.filterDone": "Completed / cancelled",
  "spaces.firstThought": "This space is ready for its first thought.",
  "spaces.nothingMatches": "Nothing matches this filter.",
  "spaces.beginHere": "Begin something here",
  "spaces.removeFromSpace": "Remove from this space",
  "spaces.removeFromSpaceHint": "Remove from this space (the item itself stays)",
  "spaces.removedFromToast": "Removed from {name} — the item is untouched",
  "spaces.addToSpace": "Add to “{name}”",
  "spaces.linkNote": "A link is added — the item is not copied or moved.",
  "spaces.nowLivesHere": "“{title}” now lives here too",
  "spaces.createDesc": "A shelf for one part of your life. Name it, describe it if you like — nothing else is required.",
  "spaces.nameExistsWarn": "You already have a space with this name — that's fine, just so you know.",
  "spaces.namePlaceholder": "e.g. Learning English",
  "spaces.descPlaceholder": "What belongs here? (optional)",
  "spaces.readyToast": "“{name}” is ready",
  "spaces.createSpace": "Create space",
  "spaces.editSpace": "Edit space",
  "spaces.renameNote": "Renaming never touches the items.",

  /* inbox */
  "inbox.title": "Inbox",
  "inbox.subtitle": "Capture first, organize later — or never. Nothing here is urgent.",
  "inbox.capture": "Capture",
  "inbox.opening": "Opening your inbox…",
  "inbox.empty": "Capture something for later — a title is enough.",
  "inbox.toSpace": "to space",
  "inbox.movedToSpaceToast": "Moved to its space — Inbox stays tidy",
  "inbox.placedOnToast": "Placed on {date} — also removed from Inbox",
  "inbox.openEdit": "Open & edit",
  "inbox.moveToSpace": "Move to a space…",
  "inbox.addToDay": "Add to a day…",
  "inbox.addedToWeekToast": "Added to this week — also removed from Inbox",
  "inbox.addToThisWeek": "Add to this week",
  "inbox.categorize": "Categorize (identity preserved)",
  "inbox.nowEntertainment": "“{title}” is now Entertainment",
  "inbox.nowType": "“{title}” is now a {type}",
  "inbox.makeItA": "Make it a {type}",
  "inbox.archivedToast": "Archived — find it under Archived",
  "inbox.deletePermanently": "Delete permanently…",

  /* search */
  "search.filterAll": "Everything",
  "search.placeholder": "Search everything — titles, notes, spaces…",
  "search.queryAria": "Search query",
  "search.archivedToo": "archived too",
  "search.recent": "Recent searches",
  "search.clear": "clear",
  "search.typeToSearch": "Type to search everything on this device.",
  "search.nothingFound": "Nothing found.",
  "search.addedToInbox": "Added “{title}” to Inbox",
  "search.addToInbox": "Add “{title}” to Inbox",
  "search.archivedChip": "Archived",
  "search.footer": "Local & offline — results open the original item, never a copy.",

  /* notes */
  "notes.title": "Notes",
  "notes.subtitle": "Plain thoughts or gentle Markdown — they never turn into tasks by themselves.",
  "notes.newNote": "New note",
  "notes.aboutPlaceholder": "What is this note about?",
  "notes.returnToMe": "Return to me — show this note at a chosen moment",
  "notes.create": "Create",
  "notes.returnNotes": "Return notes",
  "notes.quietPage": "A quiet page for your thoughts.",
  "notes.writeFirst": "Write the first one",
  "notes.noRegular": "No regular notes yet.",
  "notes.returnNote": "Return note",
  "notes.whenAppOpens": "when the app opens",
  "notes.whenSpaceOpens": "when that space opens",
  "notes.whenProjectOpens": "when that project opens",
  "notes.fromDate": "from {date}",
  "notes.onChosenDate": "on a chosen date",
  "notes.active": "Active",
  "notes.paused": "Paused",
  "notes.emptyNote": "Empty note",
  "notes.opening": "Opening this note…",
  "notes.saving": "Saving…",
  "notes.savedQuietly": "Saved quietly",
  "notes.titleAria": "Note title",
  "notes.titlePlaceholder": "Title",
  "notes.plainText": "Plain text",
  "notes.returnsToMe": "Returns to me",
  "notes.returnToMeShort": "Return to me",
  "notes.writeFreely": "Write freely… Markdown is fine: **bold**, lists, quotes. It renders safely.",
  "notes.renderedSafely": "Rendered safely — raw HTML is never shown.",
  "notes.whenShouldItReturn": "When should it return?",
  "notes.trigger": "Trigger",
  "notes.whenSpaceOpens2": "When a space opens",
  "notes.whenProjectOpens2": "When a project opens",
  "notes.fromDateOption": "From a date",
  "notes.repeat": "Repeat",
  "notes.always": "Always",
  "notes.everyDay": "Every day",
  "notes.everyWeek": "Every week",
  "notes.everyMonth": "Every month",
  "notes.everyYear": "Every year",
  "notes.chooseSpace": "Choose a space…",
  "notes.project": "Project",
  "notes.chooseProject": "Choose a project…",
  "notes.fromDateLabel": "From date",
  "notes.activeHint": "Active — reading it never disables it",
  "notes.returnSaved": "Return settings saved",
  "notes.saveReturn": "Save return settings",

  /* entertainment */
  "ent.title": "Entertainment",
  "ent.subtitle": "What you watch and play — tracked gently, never scored.",
  "ent.add": "Add",
  "ent.movies": "Movies",
  "ent.series": "Series",
  "ent.anime": "Anime",
  "ent.games": "Games",
  "ent.watchingPlaying": "Watching / playing",
  "ent.empty": "Nothing here yet — add a film, a series, a game you care about.",
  "ent.addFirst": "Add the first one",
  "ent.playing": "Playing",
  "ent.watching": "Watching",
  "ent.rating": "Personal rating",
  "ent.addTitle": "Add to watch & play",
  "ent.addDesc": "Everything is entered by hand — no services, no accounts.",
  "ent.titlePlaceholder": "Title",
  "ent.addedToast": "“{title}” added",

  /* routines */
  "routines.title": "Routines",
  "routines.subtitle": "Your own sequences — start them, skip freely, end whenever. No streaks.",
  "routines.newRoutine": "New routine",
  "routines.empty": "No routines yet — a routine is just a named sequence of steps you like.",
  "routines.createFirst": "Create the first one",
  "routines.placeTitle": "Place routine on a day",
  "routines.placedToast": "“{name}” is on {date}",
  "routines.removeStepAria": "Remove {title}",
  "routines.noStepsYet": "No steps yet — add one below.",
  "routines.start": "Start",
  "routines.archivedToast": "Routine archived — history stays",
  "routines.archiveShort": "archive",
  "routines.minTotal": "{count} min total",
  "routines.addStepPlaceholder": "Add a step…",
  "routines.minShort": "min",
  "routines.durationAria": "Duration in minutes",
  "routines.addStepAria": "Add step",
  "routines.createDesc": "Name it, add steps with optional durations. You can always change it later.",
  "routines.namePlaceholder": "e.g. A slow morning",
  "routines.descPlaceholder": "What is it for? (optional)",
  "routines.step": "Step",
  "routines.removeStep": "Remove step",
  "routines.anotherStep": "+ another step",
  "routines.readyToast": "“{name}” is ready",
  "routines.createRoutine": "Create routine",
  "routines.runnerDesc": "Step through gently — skip anything, end whenever.",
  "routines.settingUp": "Setting things up…",
  "routines.inProgress": "In progress",
  "routines.tapToContinue": "A routine is running — tap to continue",
  "routines.continueTitle": "Continue your routine",
  "routines.skipFreely": "Skip freely, end whenever.",
  "routines.doneOf": "{done} of {total} done — ending early is perfectly fine",
  "routines.endRoutine": "End routine",
  "routines.ended": "ended",

  /* quick add */
  "qa.placeholder": "What's on your mind?",
  "qa.placeholderToday": "What do you want to do?",
  "qa.desc": "A title is enough. Everything else is optional and can wait.",
  "qa.addedInbox": "Added to Inbox",
  "qa.noteAdded": "Note added",
  "qa.addedEntertainment": "Added to Entertainment",
  "qa.saved": "Saved",
  "qa.addedToday": "Added to today",
  "qa.addedWeek": "Added to the week",
  "qa.addedSpace": "Added to space",
  "qa.more": "More",
  "qa.description": "Description (optional)",
  "qa.mediaType": "Media type",
  "qa.onADay": "On a day",
  "qa.period": "Period",
  "qa.time": "Time",
  "qa.repeat": "Repeat",
  "qa.noRepeat": "No repeat",
  "qa.weekdays": "Weekdays",
  "qa.weekly": "Weekly",
  "qa.monthly": "Monthly",
  "qa.footerHint": "Enter to save · ⌘/Ctrl+Enter to keep adding",

  /* item sheet */
  "item.srTitle": "Item details",
  "item.srDesc": "One item and all its appearances — identity is preserved.",
  "item.titleAria": "Title",
  "item.moreActions": "More actions",
  "item.typeLabel": "Type",
  "item.keptToast": "Kept for later attention",
  "item.keepForLater": "Keep for later",
  "item.restoredToast": "Restored",
  "item.archivedToast": "Archived — recoverable anytime",
  "item.about": "About",
  "item.aboutPlaceholder": "A quiet line or two about this… (optional)",
  "item.status": "Status",
  "item.placementNote": "— placement is independent of status",
  "item.appearsIn": "Appears in",
  "item.openSpace": "Open space",
  "item.removeFromAria": "Remove from {name}",
  "item.removedFromSpaceToast": "Removed from space",
  "item.openThatDay": "Open that day",
  "item.todayChip": "Today · {date}",
  "item.weekOfChip": "Week of {date}",
  "item.notPlaced": "Not placed anywhere yet — still findable through search.",
  "item.addToDay": "Add to a day",
  "item.addToSpace": "Add to a space",
  "item.noteSection": "Note",
  "item.openNoteEditor": "Open note editor",
  "item.connections": "Connections",
  "item.subtasks": "Subtasks",
  "item.noSubtasks": "No subtasks yet.",
  "item.partOf": "Part of",
  "item.notPartOf": "Not part of anything.",
  "item.related": "Related",
  "item.nothingRelated": "Nothing related.",
  "item.waitingOn": "Waiting on",
  "item.noDeps": "No dependencies.",
  "item.depsHint": "Informational only — nothing is blocked.",
  "item.subtaskBtn": "Subtask",
  "item.relatedBtn": "Related",
  "item.dependsOnBtn": "Depends on",
  "item.repeats": "Repeats",
  "item.addRepeat": "Add repeat",
  "item.doesntRepeat": "Doesn't repeat. Occurrences keep their own state.",
  "item.everyWeeks": "Every {count} week(s)",
  "item.everyMonths": "Every {count} month(s)",
  "item.pausedState": "paused",
  "item.stoppedState": "stopped",
  "item.pausedToast": "Paused",
  "item.resumedToast": "Resumed",
  "item.reenabledToast": "Re-enabled",
  "item.pause": "Pause",
  "item.resume": "Resume",
  "item.reenable": "Re-enable",
  "item.stopAllRepeats": "stop all repeats",
  "item.chooseSubtask": "Choose a subtask",
  "item.chooseRelated": "Choose a related item",
  "item.dependsOnTitle": "This item depends on…",
  "item.linksOnlyNote": "Links only — no copies, no blocking.",
  "item.subtaskLinkedToast": "Subtask linked",
  "item.linkedRelatedToast": "Linked as related",
  "item.dependencyToast": "Dependency noted",
  "item.created": "Created {date}",
  "item.sessionToday": "Session today",
  "item.season": "Season",
  "item.episode": "Episode",
  "item.totalSeasons": "Total seasons",
  "item.nextEpisode": "Next episode",
  "item.ratingLabel": "Personal rating — soft marks, never a score",
  "item.starsAria": "{count} stars",
  "item.ratingOf": "{value} / 5",
  "item.notRated": "not rated",
  "item.addSessionTitle": "Add a session to a day",
  "item.sessionAddedToast": "Session added to the day",
  "item.project": "Project",
  "item.projectPlaceholder": "What is this project really about? (optional)",
  "item.targetDate": "Target date",
  "item.day.0": "Sun",
  "item.day.1": "Mon",
  "item.day.2": "Tue",
  "item.day.3": "Wed",
  "item.day.4": "Thu",
  "item.day.5": "Fri",
  "item.day.6": "Sat",
  "item.makeItRepeat": "Make it repeat",
  "item.repeatDesc": "Occurrences appear on their days, each with its own state.",
  "item.pattern": "Pattern",
  "item.selectedWeekdays": "Selected weekdays",
  "item.everyLabel": "Every",
  "item.starts": "Starts",
  "item.onDays": "On days",
  "item.dayOfMonth": "Day of month",
  "item.lastDay": "Last day",
  "item.repeatsNowToast": "It repeats now",
  "item.saveRepeat": "Save repeat",
  "item.postponeDesc": "A quiet reminder for a later day. Nothing moves and nothing is scheduled — the item stays exactly where it is.",
  "item.comeBackOn": "Come back to it on (optional)",
  "item.willSurfaceToast": "Will surface on {date}",
  "item.postponedGentlyToast": "Postponed gently",
};

export const ar: Record<string, string> = {
  /* app / shell */
  "app.name": "نظام الحياة الشخصي",
  "app.tagline": "حياتك، بهيكلٍ من عندك.",
  "shell.search": "بحث",
  "shell.quickAdd": "إضافة سريعة",
  "shell.offlineReady": "على هذا الجهاز — يعمل دون اتصال",
  "shell.offline": "دون اتصال — كل شيء يعمل",
  "shell.rightNow": "الآن",
  "shell.until": "حتى {time}",
  "shell.betweenPeriods": "بين الفترات — وقت مفتوح.",
  "shell.todayGlance": "اليوم في لمحة",
  "shell.openPage": "صفحة بيضاء.",
  "shell.openTodayLink": "افتح اليوم ←",
  "shell.spaces": "المساحات",
  "shell.noSpaces": "لا مساحات بعد.",
  "shell.allSpaces": "كل المساحات ←",
  "shell.panelNote": "رفيق هادئ — هذه اللوحة لا تُلحّ ولا تُقيّم ولا تُرسل شيئاً إلى أي مكان.",
  "shell.welcome.title": "أهلاً بك في يومياتك",
  "shell.welcome.body": "خمس فترات تشكّل كل يوم حول أوقات الصلاة — هيكل لطيف، لا جدولاً. التقط أي شيء بالإضافة السريعة؛ لا شيء هنا التزام، ولا شيء يتحرك إلا إذا حرّكته.",
  "shell.welcome.makeItYours": "اجعلها لك",
  "shell.welcome.start": "ابدأ فوراً",
  "shell.welcome.dismiss": "إخفاء الترحيب",
  "shell.undone": "تم التراجع — {label}",
  "shell.inboxBadge": "{count} في الوارد",

  /* nav */
  "nav.today": "اليوم",
  "nav.weekly": "الأسبوع",
  "nav.spaces": "المساحات",
  "nav.inbox": "الوارد",
  "nav.more": "المزيد",
  "nav.notes": "الملاحظات",
  "nav.entertainment": "الترفيه",
  "nav.review": "المراجعة",
  "nav.routines": "الروتين",
  "nav.settings": "الإعدادات",
  "nav.archived": "المؤرشف",
  "nav.primary": "الرئيسية",

  /* make it yours */
  "miy.title": "اجعلها لك",
  "miy.subtitle": "اختياري — يمكنك تغيير أي من هذا لاحقاً من الإعدادات.",
  "miy.appearance": "المظهر",
  "miy.weekStarts": "يبدأ الأسبوع عند",
  "miy.light": "فاتح",
  "miy.dark": "داكن",
  "miy.system": "النظام",
  "miy.sunday": "الأحد",
  "miy.monday": "الاثنين",
  "miy.saturday": "السبت",
  "miy.skip": "تخطٍ",
  "miy.done": "تم",
  "miy.toast": "تمت التهيئة — غيّر ما تشاء لاحقاً من الإعدادات",

  /* registration (name only) */
  "register.kicker": "نظام الحياة الشخصي",
  "register.heading": "أهلاً بك في حياتك، بهيكلٍ من عندك",
  "register.body": "مساحة شخصية هادئة: أيام تتشكل حول أوقات الصلاة، مساحات للذاكرة، ملاحظات، ترفيه وروتين — كل ذلك على هذا الجهاز فقط.",
  "register.nameLabel": "اسمك",
  "register.namePlaceholder": "بماذا نناديك؟",
  "register.hint": "اسمك فقط — بلا بريد، بلا كلمة مرور، بلا حساب.",
  "register.cta": "لنبدأ",
  "register.langLabel": "اللغة",
  "register.errorName": "من فضلك اكتب اسمك أولاً.",
  "register.privacy": "بياناتك تبقى على هذا الجهاز، دائماً.",
  "register.welcomeToast": "أهلاً بك يا {name}",
  "register.opening": "جارٍ الفتح…",

  /* lock screen (v1.1) */
  "lock.title": "مقفل",
  "lock.subtitle": "دفترك يفتح برمزك — وكل شيء آخر يبقى هادئاً حيث تركته.",
  "lock.inputLabel": "اكتب الرمز",
  "lock.unlock": "افتح",
  "lock.wrong": "ليس هذا — جرّب مرة أخرى.",
  "lock.forgot": "نسيت الرمز؟",
  "lock.forgotDesc": "من غير الرمز لا طريق للدخول — لا حساب هنا بالتصميم. الطريق الوحيد هو مسح كل شيء على هذا الجهاز والبدء من جديد، والنسخ التلقائية ستُمسح كذلك.",
  "lock.forgotConfirm": "امسح كل شيء وابدأ من جديد",

  /* privacy & PIN settings (v1.1) */
  "privacy.desc": "رمز اختياري يقفل التطبيق على هذا الجهاز — ستارة خصوصية للموبايلات المشتركة، وليس كلمة مرور. ولا يتغير شيء عن مكان بياناتك: هنا، فقط.",
  "privacy.statusOn": "القفل مفعّل",
  "privacy.statusOff": "القفل متوقف",
  "privacy.enable": "تفعيل قفل الرمز",
  "privacy.set": "احفظ الرمز",
  "privacy.change": "تغيير الرمز",
  "privacy.changeDo": "احفظ الرمز الجديد",
  "privacy.remove": "إلغاء القفل",
  "privacy.removeDo": "ألغِ القفل",
  "privacy.currentPin": "الرمز الحالي",
  "privacy.newPin": "الرمز الجديد (٤–٨ أرقام)",
  "privacy.confirmPin": "أعد كتابة الرمز الجديد",
  "privacy.errFormat": "الرمز يجب أن يكون من ٤ إلى ٨ أرقام.",
  "privacy.errMismatch": "الرمزان غير متطابقين.",
  "privacy.errCurrent": "الرمز الحالي غير صحيح.",
  "privacy.savedToast": "تم تفعيل القفل — سيُطلب عند الفتح",
  "privacy.changedToast": "تم تغيير الرمز",
  "privacy.removedToast": "تم إلغاء القفل",
  "privacy.forgotTitle": "لو نسيت الرمز",
  "privacy.forgotBody": "لا رابط استعادة ولا حساب — بالتصميم. اكتب الرمز في مكان آمن خارج هذا الجهاز: نسيانه يعني مسح كل شيء هنا والبدء من جديد.",

  /* install hint (v1.1) */
  "install.title": "ثبّته على شاشتك الرئيسية",
  "install.body": "مثبّتاً كتطبيق تحتفظ بياناتك بأمان أكبر، ويفتح بملء الشاشة، ويعمل بلا إنترنت — ويتصرف مثل أي تطبيق على موبايلك.",
  "install.iosStep1": "افتح الصفحة في سفاري ثم اضغط زر المشاركة",
  "install.iosStep2": "اختر «أضف إلى الشاشة الرئيسية»",
  "install.iosStep3": "أكّد — سيفتح كأي تطبيق، بلا شريط متصفح",
  "install.androidStep1": "افتح قائمة المتصفح (⋮)",
  "install.androidStep2": "اضغط «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»",
  "install.installNow": "ثبّته الآن",
  "install.desktopStep": "في كروم أو إيدج، ابحث عن أيقونة التثبيت في شريط العنوان.",
  "install.dismiss": "إخفاء تلميح التثبيت",

  /* review week strip (v1.1) */
  "strip.title": "أسبوعك، في أشكال",
  "strip.desc": "نظرة هادئة على كيف امتلأ الأسبوع — بلا أرقام، بلا نقاط.",
  "strip.unplacedRow": "بلا فترة",
  "strip.periodRow": "فترة",
  "strip.allQuiet": "أسبوع هادئ تماماً — لم يجلس شيء في فتراته.",
  "strip.busiest": "{day} حمل أكثر أسبوعك.",
  "strip.quietest": "{day} كان أهدأ أيامك الممتلئة.",
  "strip.fullest": "{period} كانت أكثر فتراتك امتلاءً.",
  "strip.emptyDays": "بقي {count} من الأيام مفتوحاً، لم يوضع فيه شيء.",
  "strip.allDone": "في {count} من الأيام اكتمل كل ما وُضع فيه.",

  /* common */
  "common.undo": "تراجع",
  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.close": "إغلاق",
  "common.edit": "تعديل",
  "common.delete": "حذف",
  "common.today": "اليوم",
  "common.min": "د",
  "common.never": "لم تتم بعد — فقط متى شئت",
  "common.loading": "…",

  /* today */
  "today.title": "صفحة اليوم",
  "today.subtitle": "هيكل لطيف ومساحة مفتوحة — لا شيء هنا التزام.",
  "today.opening": "جارٍ فتح صفحة اليوم…",
  "today.prevDay": "اليوم السابق",
  "today.nextDay": "اليوم التالي",
  "today.newDay": "بدأ يوم جديد — أفتح صفحة اليوم؟",
  "today.stayHere": "ابقَ هنا",
  "today.openToday": "افتح اليوم",
  "today.overnight": "ما زلت في فترة الليلة الماضية · اعرض {date}",
  "today.greetMorning": "صباح الخير",
  "today.greetAfternoon": "طاب نهارك",
  "today.greetEvening": "مساء الخير",
  "today.greetNight": "ليلة هانئة",
  "today.greetWithName": "{greet} يا {name}",
  "today.noPeriods": "لا فترات مفعّلة — فعّلها من الإعدادات › الفترات اليومية.",
  "today.openPeriodSettings": "افتح إعدادات الفترات",
  "today.placedToast": "تم وضع «{title}» في {period}",
  "today.unplaced": "محفوظ لوقتٍ لاحق اليوم",
  "today.unplacedHint": "بلا فترة، بلا وقت — يبقى ظاهراً",
  "today.holdElse": "احتفظ بشيء آخر",

  /* periods (display) */
  "period.now": "الآن",
  "period.addExisting": "إضافة موجودة",
  "period.addExistingAria": "إضافة عنصر موجود",
  "period.addExistingTitle": "أضف عنصراً موجوداً إلى هذه الفترة",
  "period.addExistingDesc": "يوضع مرجع فقط — يبقى العنصر في مكانه.",
  "period.flexible": "مرن",
  "period.begin": "ابدأ",
  "period.beginSomething": "ابدأ شيئاً ما",

  /* more screen */
  "more.title": "المزيد",
  "more.subtitle": "الأركان الأهدأ — ملاحظات وذكريات وتأمل وإعدادات.",
  "more.profile.edit": "تعديل الملف",
  "more.profile.memberSince": "عضو منذ {date}",
  "more.notes": "الملاحظات",
  "more.notesDesc": "صفحات هادئة — نص عادي أو Markdown.",
  "more.entertainment": "الترفيه",
  "more.entertainmentDesc": "ما تشاهده وتلعبه، بتتبع لطيف.",
  "more.review": "المراجعة",
  "more.reviewDesc": "تأمل في أسبوعك — اختياري، وبلا نقاط أبداً.",
  "more.routines": "الروتين",
  "more.routinesDesc": "تسلسلاتك الخاصة، بلا سلاسل إنجاز.",
  "more.settings": "الإعدادات",
  "more.settingsDesc": "المظهر، التقويم، الفترات، أوقات الصلاة.",
  "more.backup": "النسخ الاحتياطي والاستعادة",
  "more.backupDesc": "بياناتك على هذا الجهاز فقط.",
  "more.archived": "المؤرشف",
  "more.archivedDesc": "كل ما أرشفته — قابل للاستعادة دائماً.",
  "more.remindersNote": "عن التذكيرات: تظهر داخل التطبيق في اللحظات المناسبة — ملاحظات العودة وبطاقات «التقط الخيط» اللطيفة. لا إشعارات خارجية، لا شارات، لا ضغط. حياتك، بهيكلٍ من عندك.",

  /* settings */
  "settings.title": "الإعدادات",
  "settings.subtitle": "اجعلها لك — بهدوء، وقابلية للتراجع، على وقتك.",
  "settings.account": "الحساب",
  "settings.appearance": "المظهر",
  "settings.calendar": "التقويم",
  "settings.periods": "الفترات اليومية",
  "settings.prayer": "أوقات الصلاة",
  "settings.reminders": "التذكيرات",
  "settings.privacy": "الخصوصية والقفل",
  "settings.data": "البيانات والنسخ الاحتياطي",
  "settings.about": "عن التطبيق",

  "account.desc": "اسمك فقط — بلا بريد ولا كلمة مرور. كل شيء يبقى على هذا الجهاز.",
  "account.name": "اسمك",
  "account.namePlaceholder": "الاسم الذي يرحّب بك التطبيق به",
  "account.save": "حفظ الاسم",
  "account.saved": "تم حفظ الاسم",
  "account.language": "اللغة",
  "account.languageDesc": "لغة الواجهة — يتبدّل اتجاه العرض تلقائياً (العربية من اليمين إلى اليسار).",
  "account.langEn": "English",
  "account.langAr": "العربية",
  "account.memberSince": "مسجّل منذ {date}",

  "appearance.desc": "كريمي دافئ نهاراً وكاكاو دافئ ليلاً — يتبع نظامك إن أردت.",
  "appearance.inboxBadge": "عدّاد الوارد في التنقل",
  "appearance.inboxBadgeDesc": "رقم هادئ، بلا ألوان ولا استعجال.",
  "appearance.inboxBadgeAria": "إظهار عدّاد الوارد",
  "appearance.light": "فاتح",
  "appearance.dark": "داكن",
  "appearance.system": "النظام",

  "calendar.firstDay": "أول يوم في الأسبوع",
  "calendar.dateFormat": "تنسيق التاريخ",
  "calendar.timeFormat": "تنسيق الوقت",
  "calendar.note": "تغيير أول يوم في الأسبوع لا يعيد كتابة الأسابيع القائمة — الخطط القديمة تحتفظ بمداها المخزّن، والأسابيع الجديدة تتبع الإعداد الجديد.",
  "calendar.day.0": "الأحد",
  "calendar.day.1": "الاثنين",
  "calendar.day.2": "الثلاثاء",
  "calendar.day.3": "الأربعاء",
  "calendar.day.4": "الخميس",
  "calendar.day.5": "الجمعة",
  "calendar.day.6": "السبت",

  "periods.desc": "الحدود تتبع مراسي الصلاة، والأسماء لك. تعديلها لا يمسّ الأيام التي خططتها بالفعل — كل يوم يحتفظ بلقطته الخاصة. «استخدم إعداد اليوم» يُعرض على كل يوم، ولا يتم تلقائياً أبداً.",
  "periods.name": "الاسم",
  "periods.tagline": "وصف فرعي (اختياري)",
  "periods.startsAt": "يبدأ عند",
  "periods.endsAt": "ينتهي عند",
  "periods.offset": "دقائق بعد (+/-)",
  "periods.shown": "ظاهرة",
  "periods.hidden": "مخفية",
  "periods.add": "أضف فترة",
  "periods.newPeriod": "فترة جديدة",
  "periods.reset": "استعادة الخمسة",
  "periods.resetTitle": "استعادة الفترات الخمس الافتراضية؟",
  "periods.resetDesc": "تعود الأسماء والأوصاف إلى الصباح، منتصف النهار، العصر، المساء، الليل. أيامك المخططة تحتفظ بلقطاتها الخاصة.",
  "periods.resetConfirm": "استعادة الافتراضيات",
  "periods.resetToast": "عادت الفترات الخمس",
  "periods.removedToast": "أُزيلت «{name}»",
  "periods.enableAria": "تفعيل {name}",
  "periods.deleteAria": "حذف {name}",
  "periods.moveUp": "تحريك لأعلى",
  "periods.moveDown": "تحريك لأسفل",
  "periods.preview": "اليوم، مع مراسيك",
  "periods.clock": "ساعة معيّنة",
  "periods.nextDay": "اليوم التالي",

  "prayer.title": "أوقات الصلاة",
  "prayer.desc": "تتبع حدود الفترات مراسي الصلاة. تُحسب الأوقات دون اتصال على هذا الجهاز — من الإحداثيات، أو يدوياً بالكامل. لا يُرسل شيء إلى أي مكان أبداً.",
  "prayer.calculated": "محسوبة",
  "prayer.manual": "يدوية",
  "prayer.latitude": "خط العرض",
  "prayer.longitude": "خط الطول",
  "prayer.method": "طريقة الحساب",
  "prayer.asrShafi": "العصر: شافعي",
  "prayer.asrHanafi": "العصر: حنفي",
  "prayer.correction": "{prayer} ±دقيقة",
  "prayer.offlineNote": "تُحسب دون اتصال — لا حاجة للشبكة أبداً.",
  "prayer.manualNote": "مجموعة واحدة من الأوقات لكل الأيام — يمكنك التبديل دائماً.",
  "prayer.revert": "تراجع",
  "prayer.save": "حفظ",
  "prayer.savedToast": "حُفظت أوقات الصلاة — الأيام الجديدة تستخدمها، والقديمة تحتفظ بلقطاتها",

  "reminders.body": "التذكيرات تظهر داخل التطبيق في اللحظات المناسبة: ملاحظات العودة تظهر عند فتح التطبيق أو مساحة، وبطاقات «التقط الخيط» تظهر في صفحة اليوم لما أبقيته لوقت لاحق. لا إشعارات خارجية في هذا الإصدار — لا شيء ينبّهك والتطبيق مغلق. هذا مقصود.",
  "reminders.note": "كل ما له وقت يظهر في حينه: العناصر المؤرَّخة تظهر ضمن اقتراحات اليوم اللطيفة حتى ثلاثة أيام مقدماً.",

  "data.title": "النسخ الاحتياطي والاستعادة",
  "data.desc": "بياناتك على هذا الجهاز فقط. النسخ الاحتياطية وسيلتك لنقلها أو حمايتها — لا مزامنة تلقائية، لا حساب، لا سحابة.",
  "data.export": "تصدير نسخة احتياطية (.json)",
  "data.restore": "استعادة من ملف…",
  "data.lastBackup": "آخر نسخة احتياطية:",
  "data.never": "لم تتم بعد — فقط متى شئت",
  "data.tooLarge": "هذا الملف كبير جداً (أكثر من 100 م.ب) — أمتأكد أنه نسخة احتياطية من نظام الحياة؟",
  "data.unreadableFile": "تعذّر قراءة الملف — جرّب اختياره مرة أخرى.",
  "data.preview": "معاينة الاستعادة",
  "data.replaceWarn": "سيؤدي هذا إلى استبدال كل شيء على هذا الجهاز ({items} عنصراً، {spaces} مساحة…) بمحتويات النسخة الاحتياطية.",
  "data.notNow": "ليس الآن",
  "data.replace": "استبدال كل شيء",
  "data.device": "هذا الجهاز",
  "data.storageUsed": "المساحة المستخدمة:",
  "data.ofQuota": " من نحو {gb} ج.ب",
  "data.unknown": "غير معروف",
  "data.persistent": "التخزين الدائم:",
  "data.granted": "ممنوح",
  "data.notGranted": "غير ممنوح",
  "data.itemsCount": "العناصر:",
  "data.spacesCount": "المساحات:",
  "data.dayPlans": "خطط الأيام:",
  "data.weekPlans": "خطط الأسابيع:",
  "data.check": "افحص بياناتي",
  "data.checkOk": "كل شيء سليم — لا مراجع معلّقة",
  "data.checkFixed": "فُحصت البيانات وأُصلحت {count} مراجع معلّقة",
  "data.undoRestore": "التراجع عن آخر استعادة",
  "data.undoRestoreToast": "تم التراجع عن الاستعادة — بياناتك السابقة عادت",
  "data.archivedInfoTitle": "معلومات المؤرشف",
  "data.archivedInfo": "العناصر والمساحات المؤرشفة تحت المزيد › المؤرشف — محفوظة، قابلة للبحث، قابلة للاستعادة. الحذف دائماً خطوة منفصلة وصريحة.",
  "data.confirmTitle": "استبدال كل شيء بالنسخة الاحتياطية؟",
  "data.confirmDesc": "تُلتقط لقطة أمان لبياناتك الحالية تلقائياً (متاحة عبر «التراجع عن آخر استعادة»). لا يمكن تطبيقها جزئياً — إما أن تنجح كاملة أو لا يتغير شيء.",
  "data.restoredToast": "تمت الاستعادة — عاد {count} عنصراً",
  "data.backupSaved": "حُفظت النسخة الاحتياطية — {filename}",

  /* auto-backup (v1.1) */
  "data.autoTitle": "نسخة تلقائية على هذا الجهاز",
  "data.autoDesc": "مرة كل أسبوع، بهدوء، تُحفظ لقطة لكل شيء داخل هذا الجهاز — منفصلة عن بياناتك، تصمد أمام الاستعادة. ليست ملفاً في تنزيلاتك؛ إنها تعيش هنا معك.",
  "data.autoLast": "آخر نسخة تلقائية:",
  "data.autoNever": "لم تحدث بعد — تحدث من تلقاء نفسها بعد أسبوعك الأول",
  "data.autoEmpty": "لا نسخ تلقائية بعد.",
  "data.autoCreateNow": "التقط واحدة الآن",
  "data.autoCreatedToast": "تم التقاط نسخة تلقائية",
  "data.autoRestore": "استعادة",
  "data.autoConfirmTitle": "استعادة هذه النسخة التلقائية؟",
  "data.autoConfirmDesc": "كل ما في التطبيق حالياً سيُستبدل بهذه اللقطة. وتُلتقط أولاً لقطة أمان للوضع الحالي (يمكن التراجع عنها عبر «التراجع عن آخر استعادة»).",

  "about.version": "الإصدار 1.1.0 · مخطط 1 · حياتك، بهيكلٍ من عندك.",
  "about.body": "بيئة شخصية هادئة ومرنة: تخطيط يومي، تركيز أسبوعي، مساحات للذاكرة، ملاحظات وترفيه وروتين — دون اتصال، خاصة، بلا حسابات.",
  "about.bullet1": "كل البيانات تبقى في IndexedDB بهذا المتصفح",
  "about.bullet2": "لا تحليلات ولا اتصالات شبكية",
  "about.bullet3": "تراجع عن آخر 20 إجراء في الجلسة",

  /* week day names */
  "date.weekday.0": "الأحد",
  "date.weekday.1": "الاثنين",
  "date.weekday.2": "الثلاثاء",
  "date.weekday.3": "الأربعاء",
  "date.weekday.4": "الخميس",
  "date.weekday.5": "الجمعة",
  "date.weekday.6": "السبت",

  /* shared dialogs */
  "common.confirm": "تأكيد",
  "dialog.findByTitle": "ابحث بالعنوان…",
  "dialog.noMatches": "لا نتائج مطابقة بعد.",
  "dialog.addToDay": "إضافة إلى يوم",
  "dialog.placementNote": "وضعه في يومٍ ما مجرد مرجع — العنصر نفسه لا يتحرك أبداً.",
  "dialog.day": "اليوم",
  "dialog.periodOptional": "الفترة (اختياري)",
  "dialog.noPeriod": "بلا فترة",
  "dialog.timeOptional": "الوقت (اختياري)",
  "dialog.addToDate": "أضف إلى {date}",
  "dialog.add": "إضافة",
  "dialog.addToAWeek": "إضافة إلى أسبوع",
  "dialog.weekNote": "اختر أي يوم — يُستخدم الأسبوع الذي يحتويه كاملاً. تعيين الأسبوع لا يُجدول يوماً أبداً.",
  "dialog.anyDayOfWeek": "أي يوم من ذلك الأسبوع",
  "dialog.week": "الأسبوع",
  "dialog.chooseSpace": "اختر مساحة",
  "dialog.spaceLinkNote": "وضع العنصر في مساحة يربطه — لا تُنشأ أي نسخة.",
  "dialog.noSpacesYet": "لا مساحات بعد — أنشئ واحدة من المساحات.",
  "dialog.removeLinkHint": "لإزالة الربط، افتح العنصر واستخدم قائمة مساحاته.",
  "dialog.noSpace": "بلا مساحة",
  "dialog.impactSpaces": "في {count} مساحة: {names}",
  "dialog.impactDays": "على {count} خطة يوم (مثال: {example})",
  "dialog.impactWeeks": "على {count} خطة أسبوع",
  "dialog.impactInbox": "في الوارد",
  "dialog.impactRelated": "مرتبط بـ {count} عنصر مرتبط",
  "dialog.deleteTitle": "حذف «{title}» نهائياً؟",
  "dialog.deleteShort": "حذف نهائي؟",
  "dialog.deleteDesc": "لا يمكن التراجع عن هذا. الأرشفة تحفظه قابلاً للاستعادة.",
  "dialog.deleteForever": "حذف نهائي",
  "dialog.deletedToast": "حُذف «{title}»",

  /* shared primitives */
  "prim.doneReopen": "تم — انقر للإعادة",
  "prim.skippedReopen": "تم تجاوزه — انقر للإعادة",
  "prim.partialDone": "منجز جزئياً — انقر لوضع علامة تم",
  "prim.markDone": "وضع علامة تم",
  "prim.markDoneHint": "وضع علامة تم (دائرة مفتوحة = معلّق)",
  "prim.view": "العرض",
  "prim.listView": "عرض القائمة",
  "prim.timelineView": "عرض الخط الزمني",

  /* smart resume */
  "resume.kicker": "التقط الخيط",
  "resume.open": "فتح",
  "resume.later": "لاحقاً",
  "resume.dismiss": "إخفاء",
  "resume.fewer": "أقل",
  "resume.more": "+{count} أخرى",

  /* today entry row */
  "entry.hrs": "{h}س {m}د",
  "entry.min": "{m}د",
  "entry.repeatsHint": "تكرار مجدول — حالته مستقلة",
  "entry.repeats": "يتكرر",
  "entry.routine": "روتين",
  "entry.setPeriodHint": "تعيين هذه الفترة؟ مجرد اقتراح.",
  "entry.looksLike": "يبدو أنه {name} · تعيين؟",
  "entry.archivedChip": "مؤرشف · استعد أو أزل",
  "entry.unsorted": "غير مصنّف",
  "entry.options": "خيارات",
  "entry.openItem": "فتح العنصر",
  "entry.openRoutine": "فتح الروتين",
  "entry.period": "الفترة",
  "entry.unplaced": "غير مُوضع",
  "entry.timeDuration": "الوقت والمدة",
  "entry.moveToAnotherDay": "نقل إلى يوم آخر",
  "entry.moveDialogDesc": "اختر تاريخًا جديدًا — سيُنقل العنصر إليه ويختفي من هذا اليوم.",
  "entry.repeatsEndToast": "ينتهي التكرار قبل هذا التاريخ",
  "entry.stopRepeatingFromHere": "إيقاف التكرار من هنا",
  "entry.repeatStoppedToast": "توقف التكرار",
  "entry.stopAllRepeats": "إيقاف كل التكرارات",
  "entry.cancelJustThisOne": "إلغاء هذا فقط",
  "entry.oneCancelledToast": "أُلغي هذا",
  "entry.removedFromTodayToast": "أُزيل من اليوم",
  "entry.offTodayToast": "أُزيل هذا من اليوم",
  "entry.cancelThisOne": "إلغاء هذا",
  "entry.removeFromToday": "إزالة من اليوم",
  "entry.timeDialogDesc": "اختياري — فترة أو وقت أو لا شيء.",
  "entry.start": "البداية",
  "entry.end": "النهاية",
  "entry.durationLabel": "المدة (دقائق، اختياري)",
  "entry.durationExample": "مثال: 45",
  "entry.movedToast": "نُقل إلى {date}",
  "entry.move": "نقل",

  /* today timeline */
  "timeline.openSpace": "مساحة مفتوحة",
  "timeline.nothingWaiting": "لا شيء ينتظر — كل شيء في مكانه.",
  "timeline.caption": "{date} · عرض الخط الزمني",

  /* weekly */
  "weekly.opening": "جارٍ فتح الأسبوع…",
  "weekly.thisWeek": "هذا الأسبوع",
  "weekly.title": "أسبوعك، برفق",
  "weekly.subtitle": "ما يستحق العناية — نيّة، لا وعداً.",
  "weekly.prevWeek": "الأسبوع السابق",
  "weekly.nextWeek": "الأسبوع التالي",
  "weekly.outcomes": "حصائل الأسبوع",
  "weekly.noDayYet": "هذا الأسبوع، بلا يوم بعد",
  "weekly.new": "جديد",
  "weekly.nothingWaiting": "لا شيء ينتظر يوماً — ولا بأس بذلك.",
  "weekly.add": "إضافة",
  "weekly.openForWhatever": "مفتوح لما يجيء.",
  "weekly.newOutcome": "حصيلة جديدة",
  "weekly.reflect": "تأمل في هذا الأسبوع",
  "weekly.pickerTitle": "أضف عنصراً موجوداً إلى هذا الأسبوع",
  "weekly.pickerDesc": "وضعه هنا لا يُجدول يوماً أبداً.",
  "weekly.joinsToast": "«{title}» ينضم إلى الأسبوع",
  "weekly.weekPassed": "انقضى الأسبوع — اختر ما تفعله",
  "weekly.dayOfThisWeek": "يوم من هذا الأسبوع",
  "weekly.noDayYetShort": "بلا يوم بعد",
  "weekly.addToDay": "إضافة إلى يوم (خطوة منفصلة)",
  "weekly.addToAnotherWeek": "إضافة إلى أسبوع آخر",
  "weekly.passedChoice": "انقضى هذا الأسبوع — القرار لك",
  "weekly.keepWhere": "يبقى حيث هو",
  "weekly.returnToInbox": "إعادة إلى الوارد",
  "weekly.backInInboxToast": "عاد إلى الوارد — الأسبوع يحتفظ بتاريخه",
  "weekly.postponedToast": "أُجّل — لا شيء تحرك",
  "weekly.postpone": "تأجيل…",
  "weekly.cancelItem": "إلغاء هذا العنصر",
  "weekly.archivedToast": "أُرشف",
  "weekly.archive": "أرشفة",
  "weekly.removedFromWeekToast": "أُزيل من هذا الأسبوع",
  "weekly.removeFromWeek": "إزالة من هذا الأسبوع",
  "weekly.addedToast": "أُضيف — الأسبوع القديم يحتفظ بتاريخه",
  "weekly.tasksDone": "{done} من {total} مهام مرتبطة منجزة",
  "weekly.timelineCaption": "عرض الخط الزمني · العناصر بلا يوم في المساحة أعلاه",
  "weekly.newOutcomeTitle": "حصيلة أسبوعية جديدة",
  "weekly.outcomeDesc": "الحصيلة اتجاه للأسبوع، لا موعداً نهائياً. المهام الفرعية اختيارية ويمكن إضافتها لاحقاً.",
  "weekly.outcomePlaceholder": "ما الذي يجعل هذا الأسبوع محققاً لرضاك؟",
  "weekly.firstStepPlaceholder": "أول خطوة نحوه (اختياري)",
  "weekly.outcomeToast": "ثُبّتت الحصيلة على الأسبوع",
  "weekly.addOutcome": "إضافة الحصيلة",

  /* review */
  "review.q1": "ماذا أنجزت؟",
  "review.q1Hint": "قائمة للقراءة فقط بمدخلات الأسبوع المنجزة تنتظر أدناه.",
  "review.q2": "ما الذي بقي غير مكتمل؟",
  "review.q2Hint": "بلا أحكام — الأسابيع إيقاعات، لا درجات.",
  "review.q3": "ما الذي تغيّر؟",
  "review.q3Hint": "فيك، أو من حولك.",
  "review.q4": "ما الذي أريد حمله إلى الأسبوع القادم؟",
  "review.q4Hint": "استخدم الأزرار أدناه — كل نقل صريح.",
  "review.q5": "ما الأفكار الجديدة التي ظهرت؟",
  "review.q5Hint": "التقطها قبل أن تخفت.",
  "review.thisWeekReview": "مراجعة هذا الأسبوع",
  "review.kicker": "مراجعة أسبوعية",
  "review.title": "تأمل في هذا الأسبوع",
  "review.subtitle": "اختيارية، لك، وبلا درجات أبداً. الإجابات تحفظ نفسها بهدوء.",
  "review.saving": "جارٍ الحفظ…",
  "review.saved": "حُفظ",
  "review.placeholder": "اكتب بحرية… أو تجاوز هذا.",
  "review.carryLabel": "احمله إلى الأسبوع القادم (صريح، واحداً واحداً)",
  "review.carriedToast": "حُمل إلى الأسبوع القادم — هذا الأسبوع يحتفظ بتاريخه",
  "review.addToNextWeek": "إضافة إلى الأسبوع القادم",
  "review.earlier": "تأملات سابقة",
  "review.weekOf": "أسبوع {date}",
  "review.skippable": "يمكن تجاوز المراجعة إلى الأبد — الأسبوع لا يمانع.",

  /* archived */
  "archived.opening": "جارٍ فتح الأرشيف…",
  "archived.title": "المؤرشف",
  "archived.subtitle": "محفوظ بهدوء — لا شيء يُحذف، وكل شيء قابل للاستعادة.",
  "archived.items": "العناصر ({count})",
  "archived.noItems": "لا عناصر مؤرشفة.",
  "archived.archivedAt": "أُرشف في {date}",
  "archived.itemBack": "«{title}» عاد",
  "archived.restore": "استعادة",
  "archived.spaces": "المساحات ({count})",
  "archived.noSpaces": "لا مساحات مؤرشفة.",
  "archived.spaceBack": "«{name}» عادت",

  /* spaces */
  "spaces.sugg1": "تعلم الإنجليزية",
  "spaces.sugg2": "القراءة",
  "spaces.sugg3": "النمو الشخصي",
  "spaces.sugg4": "البيت والعائلة",
  "spaces.sugg5": "الصحة",
  "spaces.opening": "جارٍ فتح مساحاتك…",
  "spaces.title": "المساحات",
  "spaces.subtitle": "ذاكرة خارجية — مشاريع واهتمامات وأفكار، محفوظة كرفوف دفاتر شخصية.",
  "spaces.newSpace": "مساحة جديدة",
  "spaces.empty": "لا مساحات بعد. المساحة رفٌّ لجزء من حياتك — أعطِ واحدة اسماً.",
  "spaces.archivedSpaces": "مساحات مؤرشفة",
  "spaces.restoredToast": "استُعيدت المساحة",
  "spaces.shelfNote": "رف شخصي · كل شيء يبقى في متناول البحث",
  "spaces.addPlus": "+ إضافة",
  "spaces.options": "خيارات المساحة",
  "spaces.rename": "إعادة تسمية / وصف",
  "spaces.archivedToast": "أُرشفت المساحة — عناصرها تبقى كما هي",
  "spaces.archiveSpace": "أرشفة المساحة",
  "spaces.openingSpace": "جارٍ فتح هذه المساحة…",
  "spaces.notHere": "هذه المساحة لم تعد موجودة.",
  "spaces.backToSpaces": "العودة إلى المساحات",
  "spaces.allSpaces": "كل المساحات",
  "spaces.shelfOfItsOwn": "رفٌّ له خصوصيته — لا أقسام مفروضة.",
  "spaces.newHere": "جديد هنا",
  "spaces.inYourPlans": "حالياً في خططك",
  "spaces.todayChip": "اليوم · {title}",
  "spaces.weekChip": "هذا الأسبوع · {title}",
  "spaces.filterAll": "كل شيء",
  "spaces.filterActive": "النشِط",
  "spaces.filterDone": "مكتمل / ملغى",
  "spaces.firstThought": "هذه المساحة جاهزة لفكرتها الأولى.",
  "spaces.nothingMatches": "لا شيء يطابق هذا التصفية.",
  "spaces.beginHere": "ابدأ شيئاً هنا",
  "spaces.removeFromSpace": "إزالة من هذه المساحة",
  "spaces.removeFromSpaceHint": "إزالة من هذه المساحة (العنصر نفسه يبقى)",
  "spaces.removedFromToast": "أُزيل من {name} — العنصر لم يُمسّ",
  "spaces.addToSpace": "إضافة إلى «{name}»",
  "spaces.linkNote": "يُضاف رابط فقط — لا تُنسخ العنصر ولا يُنقل.",
  "spaces.nowLivesHere": "«{title}» يسكن هنا الآن أيضاً",
  "spaces.createDesc": "رفٌّ لجزء من حياتك. سمِّه، وصفه إن شئت — لا شيء آخر مطلوب.",
  "spaces.nameExistsWarn": "لديك مساحة بهذا الاسم بالفعل — لا مشكلة، للعلم فقط.",
  "spaces.namePlaceholder": "مثال: تعلم الإنجليزية",
  "spaces.descPlaceholder": "ما ينتمي إلى هنا؟ (اختياري)",
  "spaces.readyToast": "«{name}» جاهزة",
  "spaces.createSpace": "إنشاء المساحة",
  "spaces.editSpace": "تعديل المساحة",
  "spaces.renameNote": "إعادة التسمية لا تمسّ العناصر أبداً.",

  /* inbox */
  "inbox.title": "الوارد",
  "inbox.subtitle": "التقط أولاً، ورتّب لاحقاً — أو أبداً. لا شيء هنا مستعجل.",
  "inbox.capture": "التقاط",
  "inbox.opening": "جارٍ فتح الوارد…",
  "inbox.empty": "التقط شيئاً لوقت لاحق — العنوان يكفي.",
  "inbox.toSpace": "إلى مساحة",
  "inbox.movedToSpaceToast": "نُقل إلى مساحته — الوارد يبقى مرتباً",
  "inbox.placedOnToast": "وُضع في {date} — وأُزيل من الوارد أيضاً",
  "inbox.openEdit": "فتح وتعديل",
  "inbox.moveToSpace": "نقل إلى مساحة…",
  "inbox.addToDay": "إضافة إلى يوم…",
  "inbox.addedToWeekToast": "أُضيف إلى هذا الأسبوع — وأُزيل من الوارد أيضاً",
  "inbox.addToThisWeek": "إضافة إلى هذا الأسبوع",
  "inbox.categorize": "تصنيف (الهوية محفوظة)",
  "inbox.nowEntertainment": "«{title}» أصبح ترفيهاً",
  "inbox.nowType": "«{title}» أصبح {type}",
  "inbox.makeItA": "اجعله {type}",
  "inbox.archivedToast": "أُرشف — تجده تحت المؤرشف",
  "inbox.deletePermanently": "حذف نهائي…",

  /* search */
  "search.filterAll": "كل شيء",
  "search.placeholder": "ابحث في كل شيء — العناوين، الملاحظات، المساحات…",
  "search.queryAria": "عبارة البحث",
  "search.archivedToo": "والمؤرشف أيضاً",
  "search.recent": "عمليات البحث الأخيرة",
  "search.clear": "مسح",
  "search.typeToSearch": "اكتب للبحث في كل شيء على هذا الجهاز.",
  "search.nothingFound": "لا نتائج.",
  "search.addedToInbox": "أُضيف «{title}» إلى الوارد",
  "search.addToInbox": "إضافة «{title}» إلى الوارد",
  "search.archivedChip": "مؤرشف",
  "search.footer": "محلي ودون اتصال — النتائج تفتح العنصر الأصلي، لا نسخة منه.",

  /* notes */
  "notes.title": "الملاحظات",
  "notes.subtitle": "أفكار عادية أو Markdown لطيف — لا تتحول إلى مهام من تلقاء نفسها.",
  "notes.newNote": "ملاحظة جديدة",
  "notes.aboutPlaceholder": "بماذا تتعلق هذه الملاحظة؟",
  "notes.returnToMe": "عُد إليّ — أظهر هذه الملاحظة في لحظة مختارة",
  "notes.create": "إنشاء",
  "notes.returnNotes": "ملاحظات العودة",
  "notes.quietPage": "صفحة هادئة لأفكارك.",
  "notes.writeFirst": "اكتب الأولى",
  "notes.noRegular": "لا ملاحظات عادية بعد.",
  "notes.returnNote": "ملاحظة عودة",
  "notes.whenAppOpens": "عند فتح التطبيق",
  "notes.whenSpaceOpens": "عند فتح تلك المساحة",
  "notes.whenProjectOpens": "عند فتح ذلك المشروع",
  "notes.fromDate": "من {date}",
  "notes.onChosenDate": "في تاريخ مختار",
  "notes.active": "نشطة",
  "notes.paused": "متوقفة مؤقتاً",
  "notes.emptyNote": "ملاحظة فارغة",
  "notes.opening": "جارٍ فتح هذه الملاحظة…",
  "notes.saving": "جارٍ الحفظ…",
  "notes.savedQuietly": "حُفظ بهدوء",
  "notes.titleAria": "عنوان الملاحظة",
  "notes.titlePlaceholder": "العنوان",
  "notes.plainText": "نص عادي",
  "notes.returnsToMe": "تعود إليّ",
  "notes.returnToMeShort": "عُد إليّ",
  "notes.writeFreely": "اكتب بحرية… Markdown مقبول: **عريض**، قوائم، اقتباسات. يُعرض بأمان.",
  "notes.renderedSafely": "يُعرض بأمان — HTML الخام لا يظهر أبداً.",
  "notes.whenShouldItReturn": "متى تعود؟",
  "notes.trigger": "المُطلِق",
  "notes.whenSpaceOpens2": "عند فتح مساحة",
  "notes.whenProjectOpens2": "عند فتح مشروع",
  "notes.fromDateOption": "من تاريخ",
  "notes.repeat": "التكرار",
  "notes.always": "دائماً",
  "notes.everyDay": "كل يوم",
  "notes.everyWeek": "كل أسبوع",
  "notes.everyMonth": "كل شهر",
  "notes.everyYear": "كل سنة",
  "notes.chooseSpace": "اختر مساحة…",
  "notes.project": "المشروع",
  "notes.chooseProject": "اختر مشروعاً…",
  "notes.fromDateLabel": "من تاريخ",
  "notes.activeHint": "نشطة — قراءتها لا تعطّلها أبداً",
  "notes.returnSaved": "حُفظت إعدادات العودة",
  "notes.saveReturn": "حفظ إعدادات العودة",

  /* entertainment */
  "ent.title": "الترفيه",
  "ent.subtitle": "ما تشاهده وتلعبه — تتبع برفق، وبلا نقاط أبداً.",
  "ent.add": "إضافة",
  "ent.movies": "أفلام",
  "ent.series": "مسلسلات",
  "ent.anime": "أنمي",
  "ent.games": "ألعاب",
  "ent.watchingPlaying": "أشاهد / ألعب",
  "ent.empty": "لا شيء هنا بعد — أضف فيلماً أو مسلسلاً أو لعبة تهتم بها.",
  "ent.addFirst": "أضف الأول",
  "ent.playing": "ألعب",
  "ent.watching": "أشاهد",
  "ent.rating": "تقييم شخصي",
  "ent.addTitle": "أضف إلى المشاهدة واللعب",
  "ent.addDesc": "كل شيء يُدخل يدوياً — بلا خدمات، بلا حسابات.",
  "ent.titlePlaceholder": "العنوان",
  "ent.addedToast": "أُضيف «{title}»",

  /* routines */
  "routines.title": "الروتين",
  "routines.subtitle": "تسلسلاتك الخاصة — ابدأها، تجاوز بحرية، وأنهِ متى شئت. بلا سلاسل إنجاز.",
  "routines.newRoutine": "روتين جديد",
  "routines.empty": "لا روتين بعد — الروتين مجرد تسلسل مسمّى من خطوات تحبها.",
  "routines.createFirst": "أنشئ الأول",
  "routines.placeTitle": "ضع الروتين في يوم",
  "routines.placedToast": "«{name}» في {date}",
  "routines.removeStepAria": "إزالة {title}",
  "routines.noStepsYet": "لا خطوات بعد — أضف واحدة أدناه.",
  "routines.start": "ابدأ",
  "routines.archivedToast": "أُرشف الروتين — التاريخ يبقى",
  "routines.archiveShort": "أرشفة",
  "routines.minTotal": "{count} دقيقة إجمالاً",
  "routines.addStepPlaceholder": "أضف خطوة…",
  "routines.minShort": "دقيقة",
  "routines.durationAria": "المدة بالدقائق",
  "routines.addStepAria": "إضافة خطوة",
  "routines.createDesc": "سمِّه، وأضف خطوات بمدد اختيارية. يمكنك تغييره لاحقاً دائماً.",
  "routines.namePlaceholder": "مثال: صباح هادئ",
  "routines.descPlaceholder": "لماذا هذا الروتين؟ (اختياري)",
  "routines.step": "خطوة",
  "routines.removeStep": "إزالة الخطوة",
  "routines.anotherStep": "+ خطوة أخرى",
  "routines.readyToast": "«{name}» جاهز",
  "routines.createRoutine": "إنشاء الروتين",
  "routines.runnerDesc": "امشِ بهدوء — تجاوز أي شيء، وأنهِ متى شئت.",
  "routines.settingUp": "نجهّز الأشياء…",
  "routines.inProgress": "قيد التنفيذ",
  "routines.tapToContinue": "روتين يعمل — انقر للمتابعة",
  "routines.continueTitle": "أكمل روتينك",
  "routines.skipFreely": "تجاوز بحرية، وأنهِ متى شئت.",
  "routines.doneOf": "{done} من {total} منجزة — الإنهاء مبكراً مقبول تماماً",
  "routines.endRoutine": "إنهاء الروتين",
  "routines.ended": "انتهى",

  /* quick add */
  "qa.placeholder": "ماذا في بالك؟",
  "qa.placeholderToday": "ماذا تريد أن تفعل؟",
  "qa.desc": "العنوان يكفي. كل شيء آخر اختياري ويمكنه الانتظار.",
  "qa.addedInbox": "أُضيف إلى الوارد",
  "qa.noteAdded": "أُضيفت الملاحظة",
  "qa.addedEntertainment": "أُضيف إلى الترفيه",
  "qa.saved": "حُفظ",
  "qa.addedToday": "أُضيف إلى اليوم",
  "qa.addedWeek": "أُضيف إلى الأسبوع",
  "qa.addedSpace": "أُضيف إلى مساحة",
  "qa.more": "المزيد",
  "qa.description": "وصف (اختياري)",
  "qa.mediaType": "نوع الوسائط",
  "qa.onADay": "في يوم",
  "qa.period": "الفترة",
  "qa.time": "الوقت",
  "qa.repeat": "التكرار",
  "qa.noRepeat": "بلا تكرار",
  "qa.weekdays": "أيام الأسبوع",
  "qa.weekly": "أسبوعياً",
  "qa.monthly": "شهرياً",
  "qa.footerHint": "Enter للحفظ · ⌘/Ctrl+Enter لمواصلة الإضافة",

  /* item sheet */
  "item.srTitle": "تفاصيل العنصر",
  "item.srDesc": "عنصر واحد وكل مواضعه — الهوية محفوظة.",
  "item.titleAria": "العنوان",
  "item.moreActions": "المزيد من الإجراءات",
  "item.typeLabel": "النوع",
  "item.keptToast": "حُفظ لعناية لاحقة",
  "item.keepForLater": "احتفظ به لوقت لاحق",
  "item.restoredToast": "استُعيد",
  "item.archivedToast": "أُرشف — قابل للاستعادة في أي وقت",
  "item.about": "نبذة",
  "item.aboutPlaceholder": "سطر أو سطران هادئان عن هذا… (اختياري)",
  "item.status": "الحالة",
  "item.placementNote": "— الموضع مستقل عن الحالة",
  "item.appearsIn": "يظهر في",
  "item.openSpace": "فتح المساحة",
  "item.removeFromAria": "إزالة من {name}",
  "item.removedFromSpaceToast": "أُزيل من المساحة",
  "item.openThatDay": "افتح ذلك اليوم",
  "item.todayChip": "اليوم · {date}",
  "item.weekOfChip": "أسبوع {date}",
  "item.notPlaced": "لم يوضع في مكان بعد — يبقى قابل الوصول عبر البحث.",
  "item.addToDay": "إضافة إلى يوم",
  "item.addToSpace": "إضافة إلى مساحة",
  "item.noteSection": "ملاحظة",
  "item.openNoteEditor": "فتح محرر الملاحظة",
  "item.connections": "الروابط",
  "item.subtasks": "المهام الفرعية",
  "item.noSubtasks": "لا مهام فرعية بعد.",
  "item.partOf": "جزء من",
  "item.notPartOf": "ليس جزءاً من شيء.",
  "item.related": "مرتبط بـ",
  "item.nothingRelated": "لا شيء مرتبط.",
  "item.waitingOn": "ينتظر على",
  "item.noDeps": "لا اعتماديات.",
  "item.depsHint": "للعلم فقط — لا شيء محجوب.",
  "item.subtaskBtn": "مهمة فرعية",
  "item.relatedBtn": "مرتبط",
  "item.dependsOnBtn": "يعتمد على",
  "item.repeats": "التكرارات",
  "item.addRepeat": "إضافة تكرار",
  "item.doesntRepeat": "لا يتكرر. كل تكرار يحتفظ بحالته.",
  "item.everyWeeks": "كل {count} أسبوع",
  "item.everyMonths": "كل {count} شهر",
  "item.pausedState": "متوقف مؤقتاً",
  "item.stoppedState": "متوقف",
  "item.pausedToast": "أُوقف مؤقتاً",
  "item.resumedToast": "استُؤنف",
  "item.reenabledToast": "أُعيد تفعيله",
  "item.pause": "إيقاف مؤقت",
  "item.resume": "استئناف",
  "item.reenable": "إعادة تفعيل",
  "item.stopAllRepeats": "إيقاف كل التكرارات",
  "item.chooseSubtask": "اختر مهمة فرعية",
  "item.chooseRelated": "اختر عنصراً مرتبطاً",
  "item.dependsOnTitle": "هذا العنصر يعتمد على…",
  "item.linksOnlyNote": "روابط فقط — بلا نسخ وبلا حجب.",
  "item.subtaskLinkedToast": "رُبطت المهمة الفرعية",
  "item.linkedRelatedToast": "رُبط كمرتبط",
  "item.dependencyToast": "سُجّلت الاعتمادية",
  "item.created": "أُنشئ في {date}",
  "item.sessionToday": "جلسة اليوم",
  "item.season": "الموسم",
  "item.episode": "الحلقة",
  "item.totalSeasons": "إجمالي المواسم",
  "item.nextEpisode": "الحلقة القادمة",
  "item.ratingLabel": "تقييم شخصي — علامات ناعمة، لا درجة أبداً",
  "item.starsAria": "{count} نجوم",
  "item.ratingOf": "{value} / 5",
  "item.notRated": "بلا تقييم",
  "item.addSessionTitle": "أضف جلسة إلى يوم",
  "item.sessionAddedToast": "أُضيفت الجلسة إلى اليوم",
  "item.project": "المشروع",
  "item.projectPlaceholder": "ما هذا المشروع حقاً؟ (اختياري)",
  "item.targetDate": "التاريخ المستهدف",
  "item.day.0": "أحد",
  "item.day.1": "إثنين",
  "item.day.2": "ثلاثاء",
  "item.day.3": "أربعاء",
  "item.day.4": "خميس",
  "item.day.5": "جمعة",
  "item.day.6": "سبت",
  "item.makeItRepeat": "اجعله يتكرر",
  "item.repeatDesc": "تظهر التكرارات في أيامها، وكلٌّ منها بحالته.",
  "item.pattern": "النمط",
  "item.selectedWeekdays": "أيام أسبوع مختارة",
  "item.everyLabel": "كل",
  "item.starts": "يبدأ",
  "item.onDays": "في الأيام",
  "item.dayOfMonth": "يوم الشهر",
  "item.lastDay": "اليوم الأخير",
  "item.repeatsNowToast": "يتكرر الآن",
  "item.saveRepeat": "حفظ التكرار",
  "item.postponeDesc": "تذكير هادئ ليوم لاحق. لا شيء يتحرك ولا شيء يُجدول — العنصر يبقى في مكانه تماماً.",
  "item.comeBackOn": "عُد إليه في (اختياري)",
  "item.willSurfaceToast": "سيظهر في {date}",
  "item.postponedGentlyToast": "أُجّل برفق",
};

/* ============ runtime translation of service-layer strings ============ */

const RT_EXACT: Record<string, string> = {
  "Couldn't save that.": "تعذّر الحفظ.",
  "Couldn't add that.": "تعذّرت الإضافة.",
  "Media not found.": "الوسائط غير موجودة.",
  "Couldn't save that repeat.": "تعذّر حفظ هذا التكرار.",
  "That repeat is gone.": "هذا التكرار لم يعد موجوداً.",
  "Couldn't pause that.": "تعذّر الإيقاف المؤقت.",
  "Couldn't resume that.": "تعذّر الاستئناف.",
  "Couldn't stop that repeat.": "تعذّر إيقاف هذا التكرار.",
  "Couldn't re-enable that.": "تعذّرت إعادة التفعيل.",
  "Couldn't update that repeat.": "تعذّر تحديث هذا التكرار.",
  "A title is needed.": "العنوان مطلوب.",
  "Title is too long (500 max).": "العنوان طويل جداً (500 حرفاً كحد أقصى).",
  "Item not found.": "العنصر غير موجود.",
  "Description is too long.": "الوصف طويل جداً.",
  "Item or space not found.": "العنصر أو المساحة غير موجودَين.",
  "Link not found.": "الرابط غير موجود.",
  "An item can't relate to itself.": "لا يمكن ربط العنصر بنفسه.",
  "That would create a circular relationship.": "هذا سيُنشئ علاقة دائرية.",
  "Couldn't save that. Nothing was changed.": "تعذّر الحفظ. لم يتغير شيء.",
  "Couldn't refresh this day's setup.": "تعذّر تحديث إعداد هذا اليوم.",
  "An item is needed.": "العنصر مطلوب.",
  "A routine is needed.": "الروتين مطلوب.",
  "A routine entry can't also carry an item.": "مدخل الروتين لا يمكن أن يحمل عنصراً أيضاً.",
  "Start time should look like 09:30.": "وقت البداية يجب أن يكون بصيغة 09:30.",
  "End time should look like 10:30.": "وقت النهاية يجب أن يكون بصيغة 10:30.",
  "End time should be at or after the start time.": "وقت النهاية يجب أن يكون عند وقت البداية أو بعده.",
  "Duration should be 1–1440 minutes.": "المدة يجب أن تكون بين 1 و1440 دقيقة.",
  "That entry is gone.": "هذا المدخل لم يعد موجوداً.",
  "Couldn't move that.": "تعذّر النقل.",
  "Couldn't move that. Nothing was changed.": "تعذّر النقل. لم يتغير شيء.",
  "Couldn't remove that. Nothing changed.": "تعذّر الحذف. لم يتغير شيء.",
  "Couldn't reorder that.": "تعذّرت إعادة الترتيب.",
  "Already part of this week.": "موجود بالفعل في هذا الأسبوع.",
  "Couldn't add that to the week.": "تعذّرت إضافته إلى الأسبوع.",
  "That week is gone.": "هذا الأسبوع لم يعد موجوداً.",
  "That day isn't in this week.": "هذا اليوم ليس في هذا الأسبوع.",
  "Couldn't assign that day.": "تعذّر تعيين هذا اليوم.",
  "A space name is needed.": "اسم المساحة مطلوب.",
  "Couldn't create that space.": "تعذّر إنشاء المساحة.",
  "Space not found.": "المساحة غير موجودة.",
  "Couldn't archive that space.": "تعذّر أرشفة المساحة.",
  "Couldn't restore that space.": "تعذّرت استعادة المساحة.",
  "Couldn't move that space.": "تعذّر نقل المساحة.",
  "Couldn't save this review.": "تعذّر حفظ هذه المراجعة.",
  "Couldn't create that note.": "تعذّر إنشاء الملاحظة.",
  "This note is too long to save.": "هذه الملاحظة طويلة جداً بحيث لا تُحفظ.",
  "Couldn't save. Nothing was changed.": "تعذّر الحفظ. لم يتغير شيء.",
  "Couldn't change that.": "تعذّر التغيير.",
  "Return settings not found.": "إعدادات الإرجاع غير موجودة.",
  "This trigger needs a space or project.": "هذا المُطلِق يحتاج مساحة أو مشروعاً.",
  "This trigger needs a date.": "هذا المُطلِق يحتاج تاريخاً.",
  "A routine name is needed.": "اسم الروتين مطلوب.",
  "Couldn't create that routine.": "تعذّر إنشاء الروتين.",
  "Routine not found.": "الروتين غير موجود.",
  "Couldn't archive that routine.": "تعذّر أرشفة الروتين.",
  "Couldn't restore that routine.": "تعذّرت استعادة الروتين.",
  "Couldn't add that step.": "تعذّرت إضافة هذه الخطوة.",
  "That step is gone.": "هذه الخطوة لم تعد موجودة.",
  "Couldn't save that step.": "تعذّر حفظ هذه الخطوة.",
  "Couldn't remove that step.": "تعذّر حذف هذه الخطوة.",
  "Couldn't move that step.": "تعذّر نقل هذه الخطوة.",
  "Couldn't start that routine.": "تعذّر بدء هذا الروتين.",
  "Couldn't end that routine.": "تعذّر إنهاء هذا الروتين.",
  "Couldn't return that to Inbox.": "تعذّر إرجاعه إلى الوارد.",
  "Couldn't build the backup file.": "تعذّر إنشاء ملف النسخة الاحتياطية.",
  "That file isn't valid JSON.": "الملف ليس JSON صالحاً.",
  "That file doesn't look like a Life OS backup.": "لا يبدو هذا الملف نسخة احتياطية من نظام الحياة.",
  "The backup has no schema version.": "النسخة الاحتياطية بلا إصدار مخطط.",
  "This backup is from a newer version of Life OS.": "هذه النسخة الاحتياطية من إصدار أحدث من النظام.",
  "The backup has no data.": "النسخة الاحتياطية بلا بيانات.",
  "The backup file is corrupted (checksum mismatch).": "ملف النسخة الاحتياطية تالف (عدم تطابق المجموع الاختباري).",
  "Backup looks good.": "تبدو النسخة الاحتياطية سليمة.",
  "Restore failed. Your current data was not changed.": "فشلت الاستعادة. بياناتك الحالية لم تتغير.",
  "No restore snapshot is available.": "لا توجد لقطة استعادة متاحة.",
  /* v1.1 — pin & auto-backup */
  "The PIN must be 4 to 8 digits.": "الرمز يجب أن يكون من ٤ إلى ٨ أرقام.",
  "The current PIN is wrong.": "الرمز الحالي غير صحيح.",
  "Couldn't write the auto-backup.": "تعذّرت كتابة النسخة التلقائية.",
  "This database became too large for an on-device snapshot.": "أصبحت قاعدة البيانات أكبر من أن تُلتقط لقطة لها داخل الجهاز.",
  /* undo labels (fixed) */
  "Back in its space": "عاد إلى مساحته",
  "Removed from the day": "أُزيل من اليوم",
  "Back on the day": "عاد إلى اليوم",
  "Removed from the week": "أُزيل من الأسبوع",
  "Back in the week": "عاد إلى الأسبوع",
  /* resume suggestions */
  "A note you wanted to come back to.": "ملاحظة أردت العودة إليها.",
  "You kept this for later attention.": "احتفظت بهذا لعناية لاحقة.",
  "You postponed this until today.": "أجّلت هذا حتى اليوم.",
};

/** Translate a runtime string from the service layer (error message, undo
    label, suggestion message). Falls back to the original string. */
export function rt(message: string): string {
  if (!message) return message;
  if (getLangState() !== "ar") return message;
  const exact = RT_EXACT[message];
  if (exact) return exact;
  // Parameterized patterns
  let m = /^Coming up: (.+)\.$/.exec(message);
  if (m) return `قادم قريباً: ${m[1]}.`;
  m = /^Status back to (.+)$/.exec(message);
  if (m) return `الحالة عادت إلى ${rtLabel(m[1])}`;
  m = /^Back to (.+)$/.exec(message);
  if (m) return `عاد إلى ${rtLabel(m[1])}`;
  m = /^Removed from (.+)$/.exec(message);
  if (m) return `أُزيل من ${m[1]}`;
  m = /^Restore “(.+)”$/.exec(message);
  if (m) return `استعادة «${m[1]}»`;
  m = /^Archive “(.+)” again$/.exec(message);
  if (m) return `أرشفة «${m[1]}» مجدداً`;
  m = /^Removed “(.+)”$/.exec(message);
  if (m) return `أُزيل «${m[1]}»`;
  m = /^(.+) is already on this page\. Add another session\?$/.exec(message);
  if (m) return `«${m[1]}» موجود بالفعل في هذه الصفحة. إضافة جلسة أخرى؟`;
  m = /^(.+) is already on this day\.$/.exec(message);
  if (m) return `«${m[1]}» موجود بالفعل في هذا اليوم.`;
  return message;
}

/** Translate a known enum-ish label inside a runtime string. */
function rtLabel(label: string): string {
  return (
    STATUS_AR[label] ??
    TYPE_AR[label] ??
    PERIOD_AR[label] ??
    PRAYER_AR[label] ??
    label
  );
}

/* ============ enum labels ============ */

const TYPE_AR: Record<string, string> = {
  Unsorted: "غير مصنّف",
  Task: "مهمة",
  Activity: "نشاط",
  Event: "حدث",
  Idea: "فكرة",
  Note: "ملاحظة",
  Project: "مشروع",
  Entertainment: "ترفيه",
  Outcome: "حصيلة",
};

const STATUS_AR: Record<string, string> = {
  Active: "نشط",
  "In progress": "جارٍ",
  Paused: "متوقف مؤقتاً",
  Completed: "مكتمل",
  Cancelled: "ملغى",
  Archived: "مؤرشف",
};

const EXECUTION_AR: Record<string, string> = {
  Pending: "معلّق",
  Done: "تم",
  Skipped: "تم تجاوزه",
  Partial: "جزئي",
};

export const PRAYER_AR: Record<string, string> = {
  Fajr: "الفجر",
  Sunrise: "الشروق",
  Dhuhr: "الظهر",
  Asr: "العصر",
  Maghrib: "المغرب",
  Isha: "العشاء",
};

const PERIOD_AR: Record<string, string> = {
  Morning: "الصباح",
  Midday: "منتصف النهار",
  Afternoon: "العصر",
  Evening: "المساء",
  Night: "الليل",
};

const PERIOD_TAGLINE_AR: Record<string, string> = {
  "A gentle start": "بداية لطيفة",
  "Make room": "اترك متسعاً",
  "Open space": "مساحة مفتوحة",
  "Come back to yourself": "عُد إلى نفسك",
  "Leave it open": "اتركه مفتوحاً",
};

const PERIOD_EMPTY_AR: Record<string, string> = {
  Morning: "مساحة مفتوحة لما يجيء به الصباح.",
  Midday: "متسع لما يهم عند منتصف النهار.",
  Afternoon: "مساحة مفتوحة، لا شيء ينتظر.",
  Evening: "غرفة هادئة للمساء.",
  Night: "اترك الليل مفتوحاً.",
};

const CALC_METHOD_AR: Record<string, string> = {
  Egyptian: "الهيئة المصرية العامة للمساحة",
  MuslimWorldLeague: "رابطة العالم الإسلامي",
  NorthAmerica: "أيسنا (أمريكا الشمالية)",
  UmmAlQura: "أم القرى، مكة المكرمة",
  Makkah: "أم القرى، مكة المكرمة",
  Karachi: "جامعة العلوم الإسلامية، كراتشي",
  Tehran: "معهد الجيوفيزياء، طهران",
  Dubai: "دبي",
  Kuwait: "الكويت",
  Qatar: "قطر",
  Singapore: "MUIS، سنغافورة",
  Turkey: "ديانت، تركيا",
};

const PROGRESS_AR: Record<string, string> = {
  Planned: "مخطط",
  "In progress": "جارٍ",
  Paused: "متوقف مؤقتاً",
  Completed: "مكتمل",
  Dropped: "متروك",
};

/* English fallbacks (used when lang === "en" or the label is custom) */
const TYPE_EN: Record<string, string> = {
  unsorted: "Unsorted",
  task: "Task",
  activity: "Activity",
  event: "Event",
  idea: "Idea",
  note: "Note",
  project: "Project",
  entertainment: "Entertainment",
  outcome: "Outcome",
};

const STATUS_EN: Record<string, string> = {
  active: "Active",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const EXECUTION_EN: Record<string, string> = {
  pending: "Pending",
  completed: "Done",
  skipped: "Skipped",
  partial: "Partial",
};

const PROGRESS_EN: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  dropped: "Dropped",
};

const PRAYER_EN: Record<string, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const PERIOD_EMPTY_EN: Record<string, string> = {
  Morning: "Open space for whatever the morning brings.",
  Midday: "Room for whatever matters midday.",
  Afternoon: "Open space, nothing waiting.",
  Evening: "Quiet room for the evening.",
  Night: "Leave the night open.",
};

/* Label helpers — always reflect the active language. */

export function typeLabel(type: string): string {
  return getLangState() === "ar"
    ? (TYPE_AR[typeLabelEn(type)] ?? type)
    : (TYPE_EN[type] ?? type);
}
function typeLabelEn(type: string): string {
  return TYPE_EN[type] ?? type;
}

export function statusLabel(status: string): string {
  return getLangState() === "ar"
    ? (STATUS_AR[STATUS_EN[status] ?? status] ?? status)
    : (STATUS_EN[status] ?? status);
}

export function executionLabel(status: string): string {
  return getLangState() === "ar"
    ? (EXECUTION_AR[EXECUTION_EN[status] ?? status] ?? status)
    : (EXECUTION_EN[status] ?? status);
}

export function progressLabel(status: string): string {
  return getLangState() === "ar"
    ? (PROGRESS_AR[PROGRESS_EN[status] ?? status] ?? status)
    : (PROGRESS_EN[status] ?? status);
}

export function prayerLabel(key: PrayerKey | string): string {
  return getLangState() === "ar"
    ? (PRAYER_AR[PRAYER_EN[key] ?? key] ?? key)
    : (PRAYER_EN[key] ?? key);
}

export function calcMethodLabel(method: CalcMethod | string): string {
  return getLangState() === "ar"
    ? (CALC_METHOD_AR[method] ?? method)
    : method;
}

const MEDIA_TYPE_AR: Record<string, string> = {
  Movie: "فيلم",
  Series: "مسلسل",
  Anime: "أنمي",
  Game: "لعبة",
};

const MEDIA_TYPE_EN: Record<string, string> = {
  movie: "Movie",
  series: "Series",
  anime: "Anime",
  game: "Game",
};

export function mediaTypeLabel(mediaType: string): string {
  return getLangState() === "ar"
    ? (MEDIA_TYPE_AR[MEDIA_TYPE_EN[mediaType] ?? mediaType] ?? mediaType)
    : (MEDIA_TYPE_EN[mediaType] ?? mediaType);
}

/** Display name of a period: default English names render in Arabic when
    the app is Arabic; user-customized names are shown as typed. */
export function periodName(name: string): string {
  if (getLangState() !== "ar") return name;
  return PERIOD_AR[name] ?? name;
}

export function periodTagline(tagline: string | undefined, name: string): string | undefined {
  if (!tagline) return tagline;
  if (getLangState() !== "ar") return tagline;
  if (PERIOD_AR[name] && PERIOD_TAGLINE_AR[tagline]) {
    return PERIOD_TAGLINE_AR[tagline];
  }
  return tagline;
}

export function periodEmptyCopy(name: string): string {
  if (getLangState() === "ar") {
    return PERIOD_EMPTY_AR[name] ?? "مساحة مفتوحة لما يجيء به اليوم.";
  }
  return (
    PERIOD_EMPTY_EN[name] ??
    "Open space for whatever the day brings."
  );
}

/** Time-of-day greeting; `name` is appended when known. */
export function greeting(name: string | null | undefined): string {
  const h = new Date().getHours();
  const key =
    h < 12
      ? "today.greetMorning"
      : h < 17
        ? "today.greetAfternoon"
        : h < 20
          ? "today.greetEvening"
          : "today.greetNight";
  const greet = t(key);
  if (!name) return greet;
  return t("today.greetWithName", { greet, name });
}

/* ============ core translate function ============ */

export type TParams = Record<string, string | number>;

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, k: string) =>
    params[k] !== undefined ? String(params[k]) : whole
  );
}

/** Translate a key. Missing keys fall back to English, then to the key. */
export function t(key: string, params?: TParams): string {
  const lang = getLangState();
  const str = (lang === "ar" ? ar[key] : undefined) ?? en[key] ?? key;
  return interpolate(str, params);
}

/* ============ reactive store ============ */

interface I18NState {
  lang: Lang;
  dir: "ltr" | "rtl";
}

export const useI18nStore = create<I18NState>(() => ({
  lang: getLangState(),
  dir: getLangState() === "ar" ? "rtl" : "ltr",
}));

/** Apply a language everywhere: module state, DOM, localStorage, database. */
export async function setLang(lang: Lang, opts?: { persist?: boolean }): Promise<void> {
  setLangState(lang);
  useI18nStore.setState({
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
  });
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "ar" ? "ar" : "en";
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* private mode */
    }
  }
  if (opts?.persist !== false) {
    try {
      await setSetting(SETTING_KEYS.language, lang);
    } catch {
      /* db may not be ready during registration */
    }
  }
}

function detectInitialLang(): Lang {
  if (typeof localStorage !== "undefined") {
    try {
      const v = localStorage.getItem(LANG_STORAGE_KEY);
      if (v === "ar" || v === "en") return v;
    } catch {
      /* ignore */
    }
  }
  return "ar";
}

/** Boot the language layer from stored settings (call once on app start). */
export async function initI18n(): Promise<Lang> {
  let lang: Lang | undefined;
  try {
    lang = await getSetting<Lang | undefined>(SETTING_KEYS.language, undefined);
  } catch {
    lang = undefined;
  }
  const next = lang ?? detectInitialLang();
  await setLang(next, { persist: false });
  return next;
}

/* ============ hook ============ */

export function useT(): {
  t: (key: string, params?: TParams) => string;
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => Promise<void>;
} {
  const lang = useI18nStore((s) => s.lang);
  const dir = useI18nStore((s) => s.dir);
  return { t, lang, dir, setLang: (l: Lang) => setLang(l) };
}

export { db };
