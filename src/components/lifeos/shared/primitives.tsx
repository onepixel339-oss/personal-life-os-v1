/* Living Daybook shared primitives (§15).
   Calm state language: pending = open circle, completed = sage check,
   skipped = muted dash, partial = half-filled. Never red. */

"use client";

import { cn } from "@/lib/utils";
import {
  Check,
  Minus,
  List,
  Columns3,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExecutionStatus, ItemType, ItemStatus } from "@/lib/lifeos/types";
import { statusLabel, typeLabel, useT } from "@/lib/lifeos/i18n";

/* ---------- execution status control (§15.3) ---------- */

export function ExecutionMark({
  status,
  onCycle,
  onPick,
  size = 24,
}: {
  status: ExecutionStatus;
  onCycle?: () => void;
  onPick?: (s: ExecutionStatus) => void;
  size?: number;
}) {
  const { t } = useT();
  const base =
    "relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const style = { width: size, height: size };
  if (status === "completed") {
    return (
      <button
        type="button"
        aria-label={t("prim.doneReopen")}
        title={t("prim.doneReopen")}
        className={cn(base, "bg-sage text-[#fffaf3] hover:bg-sage/85")}
        style={style}
        onClick={onCycle}
      >
        <Check style={{ width: size * 0.58, height: size * 0.58 }} strokeWidth={2.6} />
      </button>
    );
  }
  if (status === "skipped") {
    return (
      <button
        type="button"
        aria-label={t("prim.skippedReopen")}
        title={t("prim.skippedReopen")}
        className={cn(base, "border-2 border-muted-foreground/40 text-muted-foreground/60 hover:border-muted-foreground/70")}
        style={style}
        onClick={onCycle}
      >
        <Minus style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.6} />
      </button>
    );
  }
  if (status === "partial") {
    return (
      <button
        type="button"
        aria-label={t("prim.partialDone")}
        title={t("prim.partialDone")}
        className={cn(base, "border-2 border-sage/70")}
        style={style}
        onClick={onCycle}
      >
        <span
          className="rounded-full bg-sage"
          style={{ width: "58%", height: "58%" }}
        />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={t("prim.markDone")}
      title={t("prim.markDoneHint")}
      className={cn(base, "border-2 border-muted-foreground/45 hover:border-primary")}
      style={style}
      onClick={onCycle}
    >
      {onPick ? null : null}
    </button>
  );
}

/* ---------- page header ---------- */

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 md:mb-7">
      {kicker ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {kicker}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-[26px] leading-tight text-foreground md:text-[34px]">
          {title}
        </h1>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      {subtitle ? (
        <p className="mt-1.5 max-w-xl font-serif italic text-[15px] text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/* ---------- view switcher (§3.1/§3.2) ---------- */

export function ViewSwitcher({
  view,
  onChange,
}: {
  view: "list" | "timeline";
  onChange: (v: "list" | "timeline") => void;
}) {
  const { t } = useT();
  return (
    <div
      role="group"
      aria-label={t("prim.view")}
      className="inline-flex items-center rounded-full border border-border bg-surface p-0.5"
    >
      {(
        [
          { v: "list", icon: List, label: t("prim.listView") },
          { v: "timeline", icon: Columns3, label: t("prim.timelineView") },
        ] as const
      ).map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          aria-label={label}
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors",
            view === v
              ? "bg-primary-soft text-primary-deep"
              : "text-muted-foreground hover:text-ink-soft"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

/* ---------- empty states (§18) ---------- */

export function EmptyState({
  message,
  action,
  compact,
}: {
  message: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl text-center",
        compact ? "px-3 py-4" : "px-4 py-8"
      )}
    >
      <p className="font-serif italic text-[15px] text-muted-foreground">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* ---------- chips ---------- */

export function Chip({
  children,
  tone = "neutral",
  className,
  onClick,
  title,
  asSpanButton,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "terracotta" | "sage" | "muted" | "lavender";
  className?: string;
  onClick?: () => void;
  title?: string;
  /** v1.5: render as <span role="button"> — required wherever the chip sits
   *  inside another button (invalid HTML + hydration warnings otherwise). */
  asSpanButton?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "border-border bg-surface text-ink-soft",
    terracotta: "border-primary-soft bg-primary-soft/40 text-primary-deep",
    sage: "border-sage-soft bg-sage-soft/60 text-[#4d5340] dark:text-sage",
    muted: "border-border bg-transparent text-muted-foreground",
    lavender: "border-lavender-soft bg-lavender-soft/60 text-ink-soft",
  };
  const interactive = !!onClick;
  const spanInteractive = interactive && asSpanButton;
  const Comp = spanInteractive ? "span" : interactive ? "button" : "span";
  return (
    <Comp
      title={title}
      onClick={
        interactive
          ? (e: React.MouseEvent) => {
              // v1.5.1 (review M5): interactive chips often sit inside a
              // larger clickable row — the chip's action must not also fire
              // the row's. Non-interactive chips never block the row.
              e.stopPropagation();
              onClick?.();
            }
          : undefined
      }
      {...(spanInteractive
        ? {
            role: "button",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
        tones[tone],
        interactive && "transition-colors hover:border-border-strong",
        className
      )}
    >
      {children}
    </Comp>
  );
}

export function TypeChip({ type }: { type: ItemType }) {
  if (type === "unsorted") return <Chip tone="muted">{typeLabel(type)}</Chip>;
  return <Chip tone="neutral">{typeLabel(type)}</Chip>;
}

export function StatusChip({ status }: { status: ItemStatus }) {
  if (status === "completed") return <Chip tone="sage">{statusLabel(status)}</Chip>;
  if (status === "archived") return <Chip tone="muted">{statusLabel(status)}</Chip>;
  if (status === "cancelled") return <Chip tone="muted">{statusLabel(status)}</Chip>;
  if (status === "paused") return <Chip tone="muted">{statusLabel(status)}</Chip>;
  if (status === "in_progress") return <Chip tone="terracotta">{statusLabel(status)}</Chip>;
  return null;
}

/* ---------- buttons ---------- */

export function GentleButton({
  children,
  icon: Icon,
  onClick,
  variant = "soft",
  className,
  disabled,
  title,
  type = "button",
}: {
  children?: React.ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: "soft" | "ghost" | "outline" | "solid";
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const variants: Record<string, string> = {
    soft: "bg-primary-soft/50 text-primary-deep hover:bg-primary-soft",
    ghost: "text-ink-soft hover:bg-accent",
    outline: "border border-border bg-surface text-ink-soft hover:border-border-strong hover:bg-surface-context",
    solid: "bg-primary text-primary-foreground hover:bg-primary-deep",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        variants[variant],
        className
      )}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function BeginButton({
  label = "begin",
  onClick,
  className,
}: {
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-primary-soft/40 hover:text-primary-deep",
        className
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/* ---------- layout helpers ---------- */

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-[var(--shadow-warm)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function RowLink({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-surface-context focus-visible:outline-2 focus-visible:outline-ring",
        className
      )}
    >
      {children}
    </button>
  );
}

export function statusSubtitle(status: ItemStatus): string | null {
  return statusLabel(status);
}

export { Button };
