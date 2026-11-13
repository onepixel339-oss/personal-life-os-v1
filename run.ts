/* run(): execute a service call with gentle toasts + undo wiring (D18). */

import { toast } from "sonner";
import type { Result } from "./types";
import { rt, t } from "./i18n";
import {
  pushUndo,
  undoCommand,
  type Undoable,
  type UndoCommand,
} from "./services/history-service";

export async function run<T>(
  promise: Promise<Result<T>>,
  opts?: { success?: string; quiet?: boolean }
): Promise<Result<T>> {
  const r = await promise;
  if (!r.ok) {
    toast.error(rt(r.error.message), { duration: 4000 });
    return r;
  }
  const undo = (r.value as Undoable | null | undefined)?.undo;
  if (undo) {
    pushUndo(undo);
    if (!opts?.quiet) {
      toastWithUndo(undo);
    }
  } else if (opts?.success && !opts?.quiet) {
    toast.success(rt(opts.success), { duration: 3000 });
  }
  return r;
}

export function toastWithUndo(command: UndoCommand): void {
  toast(rt(command.label), {
    duration: 10000,
    action: {
      label: t("common.undo"),
      onClick: () => {
        void undoCommand(command);
      },
    },
  });
}

export async function runQuiet<T>(
  promise: Promise<Result<T>>
): Promise<Result<T>> {
  const r = await promise;
  if (!r.ok) toast.error(rt(r.error.message), { duration: 4000 });
  return r;
}
