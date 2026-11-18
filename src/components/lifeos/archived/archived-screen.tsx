/* Archived information — items & spaces, always recoverable (§14.6, F13). */

"use client";

import { ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useArchivedItems } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import { useT } from "@/lib/lifeos/i18n";
import { restoreItem } from "@/lib/lifeos/services/item-service";
import { restoreSpace } from "@/lib/lifeos/services/space-service";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
  SectionLabel,
  TypeChip,
} from "../shared/primitives";

export function ArchivedScreen() {
  const data = useArchivedItems();
  const openItem = useUIStore((s) => s.openItem);
  const { t, lang } = useT();

  if (!data) {
    return (
      <div className="py-16 text-center font-serif italic text-muted-foreground">
        {t("archived.opening")}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("archived.title")}
        subtitle={t("archived.subtitle")}
      />

      <div className="space-y-5">
        <section>
          <SectionLabel>{t("archived.items", { count: data.items.length })}</SectionLabel>
          {data.items.length === 0 ? (
            <Card className="mt-1.5 px-6 py-6">
              <EmptyState compact message={t("archived.noItems")} />
            </Card>
          ) : (
            <Card className="mt-1.5 px-2 py-1.5">
              <ul className="flex flex-col">
                {data.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-t border-border/60 px-2 py-2.5 first:border-t-0 md:px-3"
                  >
                    <button
                      type="button"
                      onClick={() => openItem(item.id)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <span className="block truncate text-[14.5px] text-muted-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1.5">
                        <TypeChip type={item.type} />
                        <Chip tone="muted">
                          {t("archived.archivedAt", {
                            date: item.archivedAt
                              ? new Date(item.archivedAt).toLocaleDateString(
                                  lang === "ar" ? "ar-EG" : undefined
                                )
                              : "",
                          })}
                        </Chip>
                      </span>
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 rounded-full border-border bg-surface text-[12px]"
                      onClick={() =>
                        run(restoreItem(item.id), { success: t("archived.itemBack", { title: item.title }) })
                      }
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" /> {t("archived.restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <SectionLabel>{t("archived.spaces", { count: data.spaces.length })}</SectionLabel>
          {data.spaces.length === 0 ? (
            <Card className="mt-1.5 px-6 py-6">
              <EmptyState compact message={t("archived.noSpaces")} />
            </Card>
          ) : (
            <Card className="mt-1.5 px-2 py-1.5">
              <ul className="flex flex-col">
                {data.spaces.map((space) => (
                  <li
                    key={space.id}
                    className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2.5 first:border-t-0"
                  >
                    <span className="min-w-0 flex-1 truncate font-serif text-[14.5px] text-muted-foreground">
                      {space.name}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 rounded-full border-border bg-surface text-[12px]"
                      onClick={() =>
                        run(restoreSpace(space.id), { success: t("archived.spaceBack", { name: space.name }) })
                      }
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" /> {t("archived.restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
