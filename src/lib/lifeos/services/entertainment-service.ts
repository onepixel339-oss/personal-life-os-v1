/* EntertainmentService — movies, series, anime, games (§3.7, D8).
   Item.status is always derived from progressStatus; never edited independently. */

import { db, logActivity } from "../db";
import { emitChange } from "../events";
import type {
  EntertainmentDetails,
  ItemType,
  MediaType,
  ProgressStatus,
  Result,
} from "../types";
import { ENT_STATUS_MAP, err, ok } from "../types";
import type { Undoable } from "./history-service";
import { createItem, changeItemType } from "./item-service";
import { addEntryToDay } from "./planning-service";

export interface MediaInput {
  title: string;
  mediaType: MediaType;
  progressStatus: ProgressStatus;
  currentSeason?: number;
  currentEpisode?: number;
  totalSeasons?: number;
  nextEpisodeDate?: string;
  rating?: number; // 0..10, half steps stored as integers
}

function sanitizeMedia(input: Partial<MediaInput>): string | null {
  if (
    input.currentSeason !== undefined &&
    (input.currentSeason < 0 || input.currentSeason > 100)
  )
    return "Season looks off.";
  if (
    input.currentEpisode !== undefined &&
    (input.currentEpisode < 0 || input.currentEpisode > 2000)
  )
    return "Episode looks off.";
  if (
    input.totalSeasons !== undefined &&
    (input.totalSeasons < 0 || input.totalSeasons > 100)
  )
    return "Total seasons looks off.";
  if (
    input.rating !== undefined &&
    (input.rating < 0 || input.rating > 10)
  )
    return "Rating should be between 0 and 5 stars.";
  return null;
}

export async function createMedia(
  input: MediaInput
): Promise<Result<{ itemId: string }>> {
  const problem = sanitizeMedia(input);
  if (problem) return err({ code: "validation", message: problem });
  const res = await createItem({
    type: "entertainment",
    title: input.title,
  });
  if (!res.ok) return res as Result<{ itemId: string }>;
  const itemId = res.value.id;
  const details: EntertainmentDetails = {
    itemId,
    mediaType: input.mediaType,
    progressStatus: input.progressStatus,
    currentSeason: input.mediaType === "movie" ? undefined : input.currentSeason,
    currentEpisode: input.mediaType === "movie" ? undefined : input.currentEpisode,
    totalSeasons: input.mediaType === "movie" ? undefined : input.totalSeasons,
    nextEpisodeDate:
      input.mediaType === "movie" ? undefined : input.nextEpisodeDate,
    rating: input.rating,
  };
  try {
    await db.transaction("rw", [db.entertainmentDetails, db.items], async () => {
      await db.entertainmentDetails.put(details);
      await db.items.update(itemId, {
        status: ENT_STATUS_MAP[input.progressStatus],
        updatedAt: Date.now(),
      });
    });
    emitChange(["entertainmentDetails", "items"]);
    return ok({ itemId });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't add that." });
  }
}

export async function updateMedia(
  itemId: string,
  patch: Partial<MediaInput>
): Promise<Result<void>> {
  const details = await db.entertainmentDetails.get(itemId);
  if (!details) return err({ code: "not_found", message: "Media not found." });
  const problem = sanitizeMedia(patch);
  if (problem) return err({ code: "validation", message: problem });
  const next: EntertainmentDetails = { ...details };
  if (patch.mediaType !== undefined) next.mediaType = patch.mediaType;
  if (patch.progressStatus !== undefined) next.progressStatus = patch.progressStatus;
  if (patch.currentSeason !== undefined) next.currentSeason = patch.currentSeason;
  if (patch.currentEpisode !== undefined) next.currentEpisode = patch.currentEpisode;
  if (patch.totalSeasons !== undefined) next.totalSeasons = patch.totalSeasons;
  if (patch.nextEpisodeDate !== undefined) next.nextEpisodeDate = patch.nextEpisodeDate;
  if (patch.rating !== undefined) next.rating = patch.rating;
  if (next.mediaType === "movie") {
    next.currentSeason = undefined;
    next.currentEpisode = undefined;
    next.totalSeasons = undefined;
    next.nextEpisodeDate = undefined;
  }
  const derivedStatus = ENT_STATUS_MAP[next.progressStatus];
  try {
    await db.transaction("rw", [db.entertainmentDetails, db.items], async () => {
      await db.entertainmentDetails.put(next);
      const item = await db.items.get(itemId);
      if (item && item.status !== derivedStatus) {
        await db.items.update(itemId, {
          status: derivedStatus,
          completedAt:
            derivedStatus === "completed" ? Date.now() : item.completedAt,
          updatedAt: Date.now(),
        });
      }
    });
    emitChange(["entertainmentDetails", "items"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that." });
  }
}

export async function getMediaDetails(
  itemId: string
): Promise<EntertainmentDetails | undefined> {
  return db.entertainmentDetails.get(itemId);
}

/** A viewing/gaming session references the same Item — never a copy (§3.7).
 *  v1.5: the dialog's period choice rides along (same fix as items). */
export async function addSessionToToday(
  itemId: string,
  opts: {
    date: string;
    periodSettingId?: string;
    startTime?: string;
    allowMultiple?: boolean;
  }
): Promise<
  Result<{ added: boolean; entryId?: string; alreadyPlaced?: boolean } & Undoable>
> {
  const res = await addEntryToDay({
    date: opts.date,
    kind: "item",
    itemId,
    periodSettingId: opts.periodSettingId,
    startTime: opts.startTime,
    allowMultiple: opts.allowMultiple,
  });
  if (!res.ok) return res as never;
  return ok({
    added: true,
    entryId: res.value.id,
    alreadyPlaced: res.value.alreadyPlaced,
    ...(res.value.undo ? { undo: res.value.undo } : {}),
  });
}

/** v1.5: turn an EXISTING item into entertainment — identity preserved
 *  (links, placements, inbox entry all stay). This closes the old inbox
 *  path that created a new media item and permanently deleted the original
 *  with no undo trail. Details are seeded (editable from the item sheet). */
export async function convertToEntertainment(
  itemId: string,
  mediaType: MediaType = "series"
): Promise<Result<{ itemId: string } & Undoable>> {
  const item = await db.items.get(itemId);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  const existingDetails = await db.entertainmentDetails.get(itemId);
  const previousType = item.type;
  // v1.5.1 (review B1): the undo must give the item back EXACTLY as it
  // was — type, status, and archive stamp — not just the type.
  const previousStatus = item.status;
  const previousArchivedAt = item.archivedAt;
  const createdDetails = !existingDetails;
  const details: EntertainmentDetails =
    existingDetails ?? {
      itemId,
      mediaType,
      progressStatus: "planned",
    };
  const nextStatus = ENT_STATUS_MAP[details.progressStatus] ?? "active";
  try {
    await db.transaction("rw", [db.items, db.entertainmentDetails], async () => {
      await db.entertainmentDetails.put(details);
      await db.items.update(itemId, {
        type: "entertainment",
        status: item.status === nextStatus ? item.status : nextStatus,
        updatedAt: Date.now(),
      });
    });
    logActivity("item", itemId, `type:${previousType}->entertainment`);
    emitChange(["items", "entertainmentDetails"]);
    return ok({
      itemId,
      undo: {
        label: "Back to its type",
        undo: async () => {
          const revert = await changeItemType(itemId, previousType);
          if (revert.ok) {
            await db.items.update(itemId, {
              status: previousStatus,
              archivedAt: previousArchivedAt,
              updatedAt: Date.now(),
            });
            if (createdDetails) {
              await db.entertainmentDetails.delete(itemId);
              emitChange(["entertainmentDetails"]);
            }
            emitChange(["items"]);
          }
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't add that." });
  }
}

export const MEDIA_LABELS: Record<MediaType, string> = {
  movie: "Movie",
  series: "Series",
  anime: "Anime",
  game: "Game",
};

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  dropped: "Dropped",
};

export function progressLabelFor(mediaType: MediaType, status: ProgressStatus): string {
  if (status === "in_progress") {
    return mediaType === "game" ? "Playing" : "Watching";
  }
  return PROGRESS_LABELS[status];
}

export function mediaTypeIcon(mediaType: MediaType): string {
  switch (mediaType) {
    case "movie":
      return "film";
    case "series":
      return "tv";
    case "anime":
      return "sparkles";
    case "game":
      return "gamepad";
  }
}

export type { ItemType };
