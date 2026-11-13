/* SpaceService — external memory environments (§3.3). */

import { db, logActivity } from "../db";
import { emitChange } from "../events";
import { keyAfter, keyBetween } from "../fractional";
import { uid } from "../ids";
import type { Result, Space } from "../types";
import { err, ok } from "../types";

export const SPACE_COLORS = [
  "terracotta",
  "sage",
  "lavender",
  "sand",
  "clay",
  "olive",
] as const;

export const SPACE_ICONS = [
  "book",
  "leaf",
  "sun",
  "moon",
  "star",
  "sparkle",
  "globe",
  "compass",
  "heart",
  "pen",
  "music",
  "code",
] as const;

export async function createSpace(input: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}): Promise<Result<Space>> {
  const name = input.name.trim();
  if (!name || name.length > 120)
    return err({ code: "validation", message: "A space name is needed." });
  const existing = await db.spaces.toArray();
  const space: Space = {
    id: uid(),
    name,
    description: (input.description ?? "").slice(0, 2000),
    icon: input.icon,
    color: input.color,
    sortOrder: keyAfter(
      existing.filter((s) => !s.archivedAt).map((s) => s.sortOrder)
    ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  try {
    await db.spaces.add(space);
    logActivity("space", space.id, "create");
    emitChange(["spaces"]);
    return ok(space);
  } catch (e) {
    console.error(e);
    return err({ code: "db_error", message: "Couldn't create that space." });
  }
}

/** Case-insensitive duplicate name check for the gentle UI warning. */
export async function spaceNameExists(name: string): Promise<boolean> {
  const target = name.trim().toLowerCase();
  const all = await db.spaces.toArray();
  return all.some(
    (s) => !s.archivedAt && s.name.trim().toLowerCase() === target
  );
}

export async function updateSpace(
  id: string,
  patch: { name?: string; description?: string; icon?: string; color?: string }
): Promise<Result<Space>> {
  const space = await db.spaces.get(id);
  if (!space) return err({ code: "not_found", message: "Space not found." });
  const next: Partial<Space> = { updatedAt: Date.now() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 120)
      return err({ code: "validation", message: "A space name is needed." });
    next.name = name;
  }
  if (patch.description !== undefined) next.description = patch.description.slice(0, 2000);
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.color !== undefined) next.color = patch.color;
  try {
    await db.spaces.update(id, next);
    emitChange(["spaces"]);
    return ok({ ...space, ...next } as Space);
  } catch (e) {
    console.error(e);
    return err({ code: "db_error", message: "Couldn't save that." });
  }
}

/** Archive a space: links and items untouched (§3.3.3). */
export async function archiveSpace(id: string): Promise<Result<void>> {
  const space = await db.spaces.get(id);
  if (!space) return err({ code: "not_found", message: "Space not found." });
  if (space.archivedAt) return ok(undefined);
  try {
    await db.spaces.update(id, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
    logActivity("space", id, "archive");
    emitChange(["spaces"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "db_error", message: "Couldn't archive that space." });
  }
}

export async function restoreSpace(id: string): Promise<Result<void>> {
  const space = await db.spaces.get(id);
  if (!space) return err({ code: "not_found", message: "Space not found." });
  try {
    await db.spaces.update(id, {
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    emitChange(["spaces"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "db_error", message: "Couldn't restore that space." });
  }
}

/** Reorder: move space id before targetId (null = to the end). */
export async function moveSpace(
  id: string,
  targetId: string | null
): Promise<Result<void>> {
  const active = (await db.spaces.toArray()).filter((s) => !s.archivedAt);
  const me = active.find((s) => s.id === id);
  if (!me) return err({ code: "not_found", message: "Space not found." });
  const sorted = [...active].sort((a, b) =>
    a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
  );
  const idx = sorted.findIndex((s) => s.id === id);
  const without = sorted.filter((s) => s.id !== id);
  let key: string;
  if (targetId === null) {
    key = keyAfter(without.map((s) => s.sortOrder));
  } else {
    const tIdx = without.findIndex((s) => s.id === targetId);
    const before = tIdx > 0 ? without[tIdx - 1].sortOrder : null;
    const after = tIdx >= 0 ? without[tIdx].sortOrder : null;
    key = keyBetween(before, after);
  }
  void idx;
  try {
    await db.spaces.update(id, { sortOrder: key, updatedAt: Date.now() });
    emitChange(["spaces"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "db_error", message: "Couldn't move that space." });
  }
}
