/* SearchService — offline global search over everything (§10.1).
   MiniSearch index rebuilt at startup and refreshed (debounced) on data
   changes. Arabic-normalized, case-insensitive, prefix + fuzzy matching. */

import MiniSearch, {
  type Options as MiniSearchOptions,
  type SearchResult,
} from "minisearch";
import { db } from "../db";
import { emitChange, onDataChange } from "../events";
import type { Item, ItemType, ItemStatus, Space } from "../types";

/* Arabic + general text normalization */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[\u0623\u0625\u0627\u0671]/g, "\u0627") // alef forms
    .replace(/\u0649/g, "\u064A") // alef maqsura -> ya
    .replace(/\u0629/g, "\u0647") // ta marbuta -> ha
    .replace(/\u0624/g, "\u0648") // waw-hamza
    .replace(/\u0626/g, "\u064A") // ya-hamza
    .trim();
}

interface SearchDoc {
  id: string;
  kind: "item" | "space";
  itemType?: ItemType;
  title: string;
  description: string;
  content: string;
  goal: string;
  spaceNames: string;
  status?: ItemStatus;
  archived?: boolean;
  updatedAt?: number;
  createdAt?: number;
}

let index: MiniSearch<SearchDoc> | null = null;
let rebuilding = false;
let dirty = false;

const miniSearchOptions: MiniSearchOptions<SearchDoc> = {
  fields: ["title", "description", "content", "goal", "spaceNames"],
  storeFields: [
    "id",
    "kind",
    "itemType",
    "title",
    "status",
    "archived",
    "updatedAt",
    "createdAt",
  ],
  searchOptions: {
    prefix: true,
    fuzzy: 0.15,
    boost: { title: 4, spaceNames: 3, description: 2, content: 1, goal: 2 },
  },
  processTerm: (term) => {
    const normalized = normalizeText(term);
    return normalized.length ? normalized : null;
  },
};

export async function buildIndex(): Promise<void> {
  const [
    items,
    spaces,
    links,
    noteRows,
    projectRows,
    entRows,
  ] = await Promise.all([
    db.items.toArray(),
    db.spaces.toArray(),
    db.itemSpaceLinks.toArray(),
    db.noteDetails.toArray(),
    db.projectDetails.toArray(),
    db.entertainmentDetails.toArray(),
  ]);
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const noteByItem = new Map(noteRows.map((n) => [n.itemId, n]));
  const projectByItem = new Map(projectRows.map((p) => [p.itemId, p]));
  const entByItem = new Map(entRows.map((e) => [e.itemId, e]));
  const docs: SearchDoc[] = [];
  for (const item of items) {
    const spaceNames = links
      .filter((l) => l.itemId === item.id)
      .map((l) => spaceById.get(l.spaceId)?.name ?? "")
      .filter(Boolean)
      .join(" ");
    const note = noteByItem.get(item.id);
    const project = projectByItem.get(item.id);
    const ent = entByItem.get(item.id);
    docs.push({
      id: `item:${item.id}`,
      kind: "item",
      itemType: item.type,
      title: item.title,
      description: item.description ?? "",
      content: note?.content ?? "",
      goal: project?.goal ?? "",
      spaceNames,
      status: item.status,
      archived: !!item.archivedAt || item.status === "archived",
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
    });
  }
  for (const space of spaces) {
    docs.push({
      id: `space:${space.id}`,
      kind: "space",
      title: space.name,
      description: space.description ?? "",
      content: "",
      goal: "",
      spaceNames: "",
      archived: !!space.archivedAt,
      updatedAt: space.updatedAt,
      createdAt: space.createdAt,
    });
  }
  const next = new MiniSearch(miniSearchOptions);
  next.addAll(docs);
  index = next;
}

async function rebuildIfDirty(): Promise<void> {
  if (rebuilding) {
    dirty = true;
    return;
  }
  rebuilding = true;
  try {
    await buildIndex();
  } finally {
    rebuilding = false;
    if (dirty) {
      dirty = false;
      void rebuildIfDirty();
    }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
export function ensureSearchStarted(): void {
  void buildIndex().catch(() => undefined);
  onDataChange(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void rebuildIfDirty().catch(() => undefined);
    }, 400);
  });
}

export interface SearchFilters {
  type?: ItemType | "space";
  spaceId?: string;
  status?: ItemStatus;
  includeArchived?: boolean;
}

export interface SearchHit {
  id: string;
  kind: "item" | "space";
  itemId?: string;
  spaceId?: string;
  itemType?: ItemType;
  title: string;
  status?: ItemStatus;
  archived: boolean;
  score: number;
}

export function search(query: string, filters: SearchFilters = {}): SearchHit[] {
  if (!index) return [];
  const q = query.trim();
  if (!q) return [];
  let results: SearchResult[];
  try {
    results = index.search(q);
  } catch {
    return [];
  }
  const hits: SearchHit[] = [];
  for (const r of results) {
    const doc = r as SearchResult & {
      kind: "item" | "space";
      itemType?: ItemType;
      status?: ItemStatus;
      archived?: boolean;
    };
    if (doc.kind === "item") {
      if (filters.type && filters.type !== doc.itemType) continue;
      if (filters.status && filters.status !== doc.status) continue;
    } else if (filters.type && filters.type !== "space") continue;
    if (!filters.includeArchived && doc.archived) continue;
    hits.push({
      id: doc.id,
      kind: doc.kind,
      itemId: doc.kind === "item" ? doc.id.slice(5) : undefined,
      spaceId: doc.kind === "space" ? doc.id.slice(6) : undefined,
      itemType: doc.itemType,
      title: String(doc.title ?? ""),
      status: doc.status,
      archived: !!doc.archived,
      score: r.score,
    });
  }
  // archived ranked last; slight recency nudge otherwise
  hits.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return b.score - a.score;
  });
  return hits.slice(0, 60);
}

/** Simple contextual snippet around the first matching term. */
export function makeSnippet(text: string, query: string, max = 120): string {
  if (!text) return "";
  const terms = query
    .split(/\s+/)
    .map((t) => normalizeText(t))
    .filter(Boolean);
  const lower = normalizeText(text);
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) return text.slice(0, max) + (text.length > max ? "…" : "");
  const start = Math.max(0, pos - 30);
  const end = Math.min(text.length, pos + max - 30);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end) +
    (end < text.length ? "…" : "")
  );
}

export type { Item, Space };
void emitChange;
