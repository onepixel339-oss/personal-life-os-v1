#!/usr/bin/env python3
"""Insert dir="auto" as the first attribute of specific user-text inputs.

The audit found mixed Arabic/English user content (titles, descriptions,
notes, answers) typed into fields that inherit the app-wide RTL direction —
classic bidi mangling. This adds dir="auto" to exactly those fields.
Numeric/time/date fields are intentionally left untouched.
"""
import sys

# (file, 1-based line number of the opening tag)
TARGETS = [
    ("src/components/lifeos/weekly/weekly-screen.tsx", 666),
    ("src/components/lifeos/weekly/weekly-screen.tsx", 673),
    ("src/components/lifeos/search/search-dialog.tsx", 137),
    ("src/components/lifeos/entertainment/entertainment-screen.tsx", 214),
    ("src/components/lifeos/quickadd/quick-add-sheet.tsx", 296),
    ("src/components/lifeos/quickadd/quick-add-sheet.tsx", 343),
    ("src/components/lifeos/inbox/inbox-screen.tsx", 80),
    ("src/components/lifeos/shared/dialogs.tsx", 151),
    ("src/components/lifeos/spaces/spaces-screen.tsx", 549),
    ("src/components/lifeos/spaces/spaces-screen.tsx", 563),
    ("src/components/lifeos/spaces/spaces-screen.tsx", 623),
    ("src/components/lifeos/spaces/spaces-screen.tsx", 628),
    ("src/components/lifeos/notes/notes-screen.tsx", 65),
    ("src/components/lifeos/notes/notes-screen.tsx", 372),
    ("src/components/lifeos/routines/routines-screen.tsx", 262),
    ("src/components/lifeos/routines/routines-screen.tsx", 322),
    ("src/components/lifeos/routines/routines-screen.tsx", 329),
    ("src/components/lifeos/routines/routines-screen.tsx", 338),
    ("src/components/lifeos/itemsheet/item-sheet.tsx", 200),
    ("src/components/lifeos/itemsheet/item-sheet.tsx", 341),
    ("src/components/lifeos/itemsheet/item-sheet.tsx", 1044),
    ("src/components/lifeos/review/review-screen.tsx", 209),
]

# settings period name/tagline — locate by content instead of line number
SETTINGS_PAIRS = [
    ('src/components/lifeos/settings/settings-screen.tsx',
     '                    <Input\n                      value={s.name}\n',
     '                    <Input\n                      dir="auto"\n                      value={s.name}\n'),
    ('src/components/lifeos/settings/settings-screen.tsx',
     '                    <Input\n                      value={s.tagline ?? ""}\n',
     '                    <Input\n                      dir="auto"\n                      value={s.tagline ?? ""}\n'),
]

DIR_LINE = 'dir="auto"\n'
indent_prefix = None

changed = 0
for path, lineno in TARGETS:
    with open(path) as f:
        lines = f.readlines()
    idx = lineno - 1
    line = lines[idx]
    stripped = line.strip()
    if not (stripped.startswith("<Input") or stripped.startswith("<Textarea") or stripped.startswith("<input")):
        print(f"SKIP (not an opening tag): {path}:{lineno} -> {stripped!r}")
        continue
    if any('dir="auto"' in lines[j] for j in range(idx, min(idx + 5, len(lines)))):
        print(f"SKIP (already has dir): {path}:{lineno}")
        continue
    indent = line[: len(line) - len(line.lstrip())]
    lines.insert(idx + 1, indent + DIR_LINE)
    with open(path, "w") as f:
        f.writelines(lines)
    changed += 1
    print(f"OK {path}:{lineno}")

for path, old, new in SETTINGS_PAIRS:
    with open(path) as f:
        s = f.read()
    if new in s:
        print(f"SKIP (already applied): {path} pair")
        continue
    if old not in s:
        print(f"WARN pair not found in {path}")
        sys.exit(1)
    s = s.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(s)
    changed += 1
    print(f"OK pair {path}")

print(f"total changed: {changed}")
