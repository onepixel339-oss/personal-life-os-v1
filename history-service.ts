/* HistoryService — session-level undo stack (Master Specification §12.5.1, D18).
   In-memory, max 20 commands; each undo runs as its own transaction. */

export interface UndoCommand {
  label: string;
  undo: () => Promise<void>;
}

export type Undoable = { undo?: UndoCommand };

const MAX = 20;
let stack: UndoCommand[] = [];
const changeListeners = new Set<() => void>();

export function pushUndo(command: UndoCommand): void {
  stack.push(command);
  if (stack.length > MAX) stack = stack.slice(-MAX);
  for (const fn of changeListeners) fn();
}

export function undoLast(): UndoCommand | null {
  const command = stack.pop() ?? null;
  for (const fn of changeListeners) fn();
  return command;
}

export function peekUndo(): UndoCommand | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function undoCount(): number {
  return stack.length;
}

export function clearUndo(): void {
  stack = [];
  for (const fn of changeListeners) fn();
}

export function onUndoStackChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Keyboard undo (Cmd/Ctrl+Z) for the last action. */
export async function handleUndoShortcut(): Promise<string | null> {
  const command = undoLast();
  if (!command) return null;
  try {
    await command.undo();
    return command.label;
  } catch (e) {
    console.error("undo shortcut failed", e);
    return null;
  }
}

/** Run a specific command's undo and remove it from the stack. */
export async function undoCommand(command: UndoCommand): Promise<void> {
  const idx = stack.lastIndexOf(command);
  if (idx >= 0) stack.splice(idx, 1);
  for (const fn of changeListeners) fn();
  try {
    await command.undo();
  } catch (e) {
    console.error("undoCommand failed", e);
  }
}
