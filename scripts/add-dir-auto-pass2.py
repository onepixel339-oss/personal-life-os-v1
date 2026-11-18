#!/usr/bin/env python3
"""Content-based pass for the dir="auto" fields the line-based pass missed
(line numbers shifted after the first inserts)."""

PAIRS = [
    ("src/components/lifeos/weekly/weekly-screen.tsx",
     "<Input\n", None, "value={subtask}", None),
]

# (file, anchor-line-content-that-follows-the-opening-tag)
TARGETS = [
    ("src/components/lifeos/weekly/weekly-screen.tsx", "value={subtask}"),
    ("src/components/lifeos/quickadd/quick-add-sheet.tsx", "value={description}"),
    ("src/components/lifeos/spaces/spaces-screen.tsx", "value={description}"),  # 2x
    ("src/components/lifeos/spaces/spaces-screen.tsx", "value={name}"),        # dialog one (inline already done)
    ("src/components/lifeos/notes/notes-screen.tsx", "value={content}"),
    ("src/components/lifeos/routines/routines-screen.tsx", "value={name}"),
    ("src/components/lifeos/routines/routines-screen.tsx", "value={description}"),
    ("src/components/lifeos/routines/routines-screen.tsx", "value={s}"),
    ("src/components/lifeos/itemsheet/item-sheet.tsx", "value={description}"),
    ("src/components/lifeos/itemsheet/item-sheet.tsx", "value={goal}"),
]

changed = 0
for path, anchor in TARGETS:
    with open(path) as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not (stripped.startswith("<Input") or stripped.startswith("<Textarea") or stripped.startswith("<input")):
            continue
        # look at the next 3 lines for the anchor
        window = lines[i + 1 : i + 4]
        if not any(anchor in w for w in window):
            continue
        if any('dir="auto"' in w for w in window):
            continue  # already done
        indent = line[: len(line) - len(line.lstrip())]
        lines.insert(i + 1, indent + 'dir="auto"\n')
        with open(path, "w") as f:
            f.writelines(lines)
        changed += 1
        print(f"OK {path} -> {anchor} (line {i + 1})")
        break
    else:
        print(f"NOT FOUND: {path} -> {anchor}")

print(f"total changed: {changed}")
