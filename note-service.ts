/* NoteService — regular notes, Markdown content, Return Notes (§3.6, §3.8). */

import { db } from "../db";
import { emitChange } from "../events";
import { uid } from "../ids";
import type {
  NoteDetails,
  Result,
  ReturnNoteSettings,
} from "../types";
import { err, ok } from "../types";
import { createItem } from "./item-service";

export async function createNote(input: {
  title: string;
  content?: string;
  format?: "plain" | "markdown";
  noteType?: "regular" | "return";
}): Promise<Result<{ itemId: string }>> {
  const res = await createItem({
    type: "note",
    title: input.title,
  });
  if (!res.ok) return res as Result<{ itemId: string }>;
  const itemId = res.value.id;
  const now = Date.now();
  const details: NoteDetails = {
    itemId,
    content: (input.content ?? "").slice(0, 1_000_000),
    format: input.format ?? "markdown",
    noteType: input.noteType ?? "regular",
    updatedAt: now,
  };
  try {
    await db.transaction("rw", [db.noteDetails, db.returnNoteSettings], async () => {
      await db.noteDetails.put(details);
      if (details.noteType === "return") {
        await db.returnNoteSettings.put({
          noteItemId: itemId,
          enabled: true,
          trigger: "app_open",
          repeat: "none",
        });
      }
    });
    emitChange(["noteDetails", "returnNoteSettings"]);
    return ok({ itemId });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't create that note." });
  }
}

/** Save content (debounced at the UI layer; 600 ms + blur/visibilitychange). */
export async function saveNoteContent(
  itemId: string,
  content: string,
  format: "plain" | "markdown"
): Promise<Result<void>> {
  if (content.length > 1_000_000)
    return err({ code: "validation", message: "This note is too long to save." });
  try {
    await db.noteDetails.update(itemId, {
      content,
      format,
      updatedAt: Date.now(),
    });
    emitChange(["noteDetails"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save. Nothing was changed." });
  }
}

export async function getNoteDetails(itemId: string): Promise<NoteDetails | undefined> {
  return db.noteDetails.get(itemId);
}

export async function setNoteType(
  itemId: string,
  noteType: "regular" | "return"
): Promise<Result<void>> {
  try {
    await db.transaction("rw", [db.noteDetails, db.returnNoteSettings], async () => {
      await db.noteDetails.update(itemId, { noteType, updatedAt: Date.now() });
      if (noteType === "return") {
        const existing = await db.returnNoteSettings.get(itemId);
        if (!existing) {
          await db.returnNoteSettings.put({
            noteItemId: itemId,
            enabled: true,
            trigger: "app_open",
            repeat: "none",
          });
        }
      }
    });
    emitChange(["noteDetails", "returnNoteSettings"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't change that." });
  }
}

export async function updateReturnNoteSettings(
  noteItemId: string,
  patch: Partial<Omit<ReturnNoteSettings, "noteItemId">>
): Promise<Result<void>> {
  const current = await db.returnNoteSettings.get(noteItemId);
  if (!current)
    return err({ code: "not_found", message: "Return settings not found." });
  const next: ReturnNoteSettings = { ...current, ...patch };
  if (
    (next.trigger === "space_open" || next.trigger === "project_open") &&
    !next.targetId
  )
    return err({
      code: "validation",
      message: "This trigger needs a space or project.",
    });
  if (next.trigger === "date" && !next.targetDate)
    return err({ code: "validation", message: "This trigger needs a date." });
  if (next.trigger === "app_open") next.targetId = undefined;
  if (next.trigger !== "date") next.targetDate = undefined;
  try {
    await db.returnNoteSettings.put(next);
    emitChange(["returnNoteSettings"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that." });
  }
}

export async function getReturnSettings(
  noteItemId: string
): Promise<ReturnNoteSettings | undefined> {
  return db.returnNoteSettings.get(noteItemId);
}
