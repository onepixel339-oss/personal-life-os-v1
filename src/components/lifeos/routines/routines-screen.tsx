/* Routines screen — flexible templates + a gentle runner (§8.7, F10). */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Plus, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useRoutines, useViewPrefs } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import { todayLocal } from "@/lib/lifeos/dates";
import {
  addRoutineItem,
  addRoutineToToday,
  archiveRoutine,
  createRoutine,
  endRoutine,
  removeRoutineItem,
  setStepStatus,
  startRoutine,
} from "@/lib/lifeos/services/routine-service";
import type { Routine, RoutineExecutionStep } from "@/lib/lifeos/types";
import { t, useT } from "@/lib/lifeos/i18n";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
  SectionLabel,
} from "../shared/primitives";
import { AddToTodayDialog } from "../shared/dialogs";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { cn } from "@/lib/utils";

export function RoutinesScreen() {
  const data = useRoutines();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [runner, setRunner] = useState<Routine | null>(null);
  const [addToTodayFor, setAddToTodayFor] = useState<Routine | null>(null);
  const { t } = useT();

  const activeExecution = useLiveQuery(
    () =>
      db.routineExecutions
        .filter((e) => e.state === "in_progress")
        .last(),
    []
  );

  return (
    <div>
      <PageHeader
        title={t("routines.title")}
        subtitle={t("routines.subtitle")}
        actions={
          <Button
            size="sm"
            className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> {t("routines.newRoutine")}
          </Button>
        }
      />

      {activeExecution && activeExecution.state === "in_progress" ? (
        <RunnerCard executionId={activeExecution.id} />
      ) : null}

      {data === undefined ? (
        <div className="py-12 text-center font-serif italic text-muted-foreground">{t("common.loading")}</div>
      ) : data.active.length === 0 ? (
        <Card className="px-6 py-10">
          <EmptyState
            message={t("routines.empty")}
            action={
              <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(true)}>
                {t("routines.createFirst")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.active.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onStart={() => setRunner(routine)}
              onAddToToday={() => setAddToTodayFor(routine)}
            />
          ))}
        </div>
      )}

      <CreateRoutineDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setName("");
            setDescription("");
            setSteps([""]);
          }
        }}
        name={name}
        setName={setName}
        description={description}
        setDescription={setDescription}
        steps={steps}
        setSteps={setSteps}
        busy={busy}
        setBusy={setBusy}
      />

      <RunnerDialog routine={runner} onOpenChange={(o) => !o && setRunner(null)} />

      <AddToTodayDialog
        open={addToTodayFor !== null}
        onOpenChange={(o) => setAddToTodayFor(o ? addToTodayFor : null)}
        itemTitle={addToTodayFor?.name}
        title={t("routines.placeTitle")}
        onConfirm={async (choice) => {
          if (!addToTodayFor) return;
          const res = await run(
            addRoutineToToday(addToTodayFor.id, choice.date),
            { quiet: true }
          );
          if (res.ok) {
            const { toast } = await import("sonner");
            toast(t("routines.placedToast", { name: addToTodayFor.name, date: choice.date }));
          }
        }}
      />
    </div>
  );
}

function RoutineCard({
  routine,
  onStart,
  onAddToToday,
}: {
  routine: Routine;
  onStart: () => void;
  onAddToToday: () => void;
}) {
  const data = useRoutines();
  const { t } = useT();
  const steps = data?.itemsByRoutine.get(routine.id) ?? [];
  const total = steps.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);
  return (
    <Card className="px-4 py-3.5 md:px-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-serif text-[16.5px] text-ink">
            <Zap className="me-1.5 inline h-4 w-4 text-primary/70" />
            {routine.name}
          </h3>
          {routine.description ? (
            <p className="mt-1 text-[13px] text-muted-foreground">{routine.description}</p>
          ) : null}
          <ol className="mt-2 space-y-0.5">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-[13px] text-ink-soft">
                <span className="w-4 text-[11px] text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.durationMinutes ? (
                  <span className="text-[11.5px] text-muted-foreground">
                    {t("entry.min", { m: s.durationMinutes })}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={t("routines.removeStepAria", { title: s.title })}
                  className="text-muted-foreground/40 hover:text-[#a5533c]"
                  onClick={() => run(removeRoutineItem(s.id), { quiet: true })}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ol>
          {steps.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] italic text-muted-foreground">
              {t("routines.noStepsYet")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button
            size="sm"
            className="h-8 rounded-full bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary-deep"
            onClick={onStart}
          >
            <Play className="h-3.5 w-3.5" /> {t("routines.start")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-border bg-surface px-3 text-[12px]"
            onClick={onAddToToday}
          >
            {t("nav.today")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-2 text-[11.5px] text-muted-foreground"
            onClick={() => run(archiveRoutine(routine.id), { success: t("routines.archivedToast") })}
          >
            {t("routines.archiveShort")}
          </Button>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <AddStepInline routineId={routine.id} />
        {total ? (
          <Chip tone="neutral">{t("routines.minTotal", { count: total })}</Chip>
        ) : null}
      </div>
    </Card>
  );
}

function AddStepInline({ routineId }: { routineId: string }) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const { t } = useT();
  return (
    <form
      className="flex flex-1 items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await run(
          addRoutineItem(routineId, {
            title,
            durationMinutes: minutes ? Number(minutes) : undefined,
          }),
          { quiet: true }
        );
        setTitle("");
        setMinutes("");
      }}
    >
      <Input
      dir="auto"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("routines.addStepPlaceholder")}
        className="h-8 rounded-full border-border bg-surface px-3 text-[12.5px]"
      />
      <Input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder={t("routines.minShort")}
        className="h-8 w-16 rounded-full border-border bg-surface px-3 text-[12.5px]"
        aria-label={t("routines.durationAria")}
      />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-2.5 text-muted-foreground"
        aria-label={t("routines.addStepAria")}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

function CreateRoutineDialog({
  open,
  onOpenChange,
  name,
  setName,
  description,
  setDescription,
  steps,
  setSteps,
  busy,
  setBusy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  steps: string[];
  setSteps: (v: string[]) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("routines.newRoutine")}</DialogTitle>
          <DialogDescription>
            {t("routines.createDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
          dir="auto"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("routines.namePlaceholder")}
            className="h-11 rounded-xl border-border bg-surface"
          />
          <Textarea
          dir="auto"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("routines.descPlaceholder")}
            className="min-h-[52px] rounded-xl border-border bg-surface"
          />
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 text-[12px] text-muted-foreground">{i + 1}.</span>
              <Input
              dir="auto"
                value={s}
                onChange={(e) =>
                  setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))
                }
                placeholder={t("routines.step")}
                className="h-9 rounded-xl border-border bg-surface text-[13px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-full p-0 text-muted-foreground"
                aria-label={t("routines.removeStep")}
                onClick={() => setSteps(steps.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSteps([...steps, ""])}
            className="justify-self-start rounded-full px-2 py-1 text-[12.5px] text-muted-foreground hover:bg-primary-soft/35 hover:text-primary-deep"
          >
            {t("routines.anotherStep")}
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await run(createRoutine({ name, description }), { quiet: true });
                if (!res.ok) return;
                const routine = res.value;
                for (const step of steps.filter((s) => s.trim())) {
                  await run(
                    addRoutineItem(routine.id, { title: step.trim() }),
                    { quiet: true }
                  );
                }
                const { toast } = await import("sonner");
                toast(t("routines.readyToast", { name: routine.name }));
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("routines.createRoutine")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- runner ---------- */

function RunnerDialog({
  routine,
  onOpenChange,
}: {
  routine: Routine | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const [executionId, setExecutionId] = useState<string | null>(null);
  const started = useMemo(() => routine !== null, [routine]);
  const [routineId, setRoutineId] = useState<string | null>(null);

  if ((routine?.id ?? null) !== routineId) {
    setRoutineId(routine?.id ?? null);
    setExecutionId(null);
  }

  useEffect(() => {
    if (!routine) return;
    void startRoutine(routine.id, todayLocal()).then((res) => {
      if (res.ok) setExecutionId(res.value.id);
    });
  }, [routine]);

  return (
    <Dialog open={started} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            {routine?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            {t("routines.runnerDesc")}
          </DialogDescription>
        </DialogHeader>
        {executionId ? (
          <RunnerBody executionId={executionId} onEnd={() => onOpenChange(false)} />
        ) : (
          <p className="py-6 text-center font-serif italic text-muted-foreground">
            {t("routines.settingUp")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RunnerCard({ executionId }: { executionId: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-primary/40 bg-primary-soft/25 px-4 py-3 text-start"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-deep">
          {t("routines.inProgress")}
        </span>
        <span className="mt-0.5 block text-[14px] text-ink">
          {t("routines.tapToContinue")}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{t("routines.continueTitle")}</DialogTitle>
            <DialogDescription>{t("routines.skipFreely")}</DialogDescription>
          </DialogHeader>
          <RunnerBody executionId={executionId} onEnd={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RunnerBody({
  executionId,
  onEnd,
}: {
  executionId: string;
  onEnd: () => void;
}) {
  const steps = useLiveQuery(
    () => db.routineExecutionSteps.where("executionId").equals(executionId).toArray(),
    [executionId]
  );
  const execution = useLiveQuery(() => db.routineExecutions.get(executionId), [executionId]);
  const sorted = useMemo(
    () =>
      (steps ?? []).sort((a, b) =>
        a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
      ),
    [steps]
  );
  const doneCount = sorted.filter((s) => s.status !== "pending").length;
  const { t } = useT();

  if (!sorted) return null;
  return (
    <div>
      <ul className="space-y-1.5">
        {sorted.map((step: RoutineExecutionStep, i) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={async () => {
                const next =
                  step.status === "done"
                    ? "pending"
                    : step.status === "skipped"
                      ? "done"
                      : "skipped";
                await run(setStepStatus(step.id, next as "pending" | "done" | "skipped"), {
                  quiet: true,
                });
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors",
                step.status === "done"
                  ? "border-sage/40 bg-sage-soft/50 text-muted-foreground"
                  : step.status === "skipped"
                    ? "border-border bg-surface-context/60 text-muted-foreground/70"
                    : "border-border bg-surface text-ink-soft"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  step.status === "done"
                    ? "border-sage bg-sage text-[#fffaf3]"
                    : step.status === "skipped"
                      ? "border-muted-foreground/40 text-muted-foreground"
                      : "border-muted-foreground/40 text-muted-foreground"
                )}
                aria-hidden
              >
                {step.status === "done" ? "✓" : step.status === "skipped" ? "–" : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{step.titleSnapshot}</span>
              {step.durationSnapshot ? (
                <span className="text-[11.5px] text-muted-foreground">
                  {t("entry.min", { m: step.durationSnapshot })}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
        {t("routines.doneOf", { done: doneCount, total: sorted.length })}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="outline"
          className="rounded-full border-border bg-surface"
          onClick={async () => {
            await run(endRoutine(executionId), { quiet: true });
            onEnd();
          }}
        >
          {t("routines.endRoutine")}
        </Button>
        {execution?.state === "in_progress" ? null : (
          <span className="self-center text-[12px] text-muted-foreground">{t("routines.ended")}</span>
        )}
      </div>
    </div>
  );
}

export { SectionLabel };
