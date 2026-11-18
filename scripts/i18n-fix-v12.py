#!/usr/bin/env python3
"""Fix the i18n v1.2 fallout, take 2: restore EN values and drop the
duplicated AR block (anchored on key lines, immune to comment drift)."""

PATH = "src/lib/lifeos/i18n.ts"
lines = open(PATH, encoding="utf-8").readlines()

def find(substr, start=0):
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    return -1

# 1) restore EN dictionary values (first occurrences)
i = find('"app.tagline"')
assert i is not None and i < 100, f"en app.tagline position unexpected: {i}"
lines[i] = '  "app.tagline": "Your day\'s quiet companion — at your pace.",\n'

i = find('"register.body"')
assert i is not None and i < 120, f"en register.body position unexpected: {i}"
lines[i] = '  "register.body": "A calm companion for a day you want to shape: periods around prayer times, spaces for memory, notes and routines — all of it on this device only.",\n'

i = find('"about.version"')
assert i is not None and i < 500, f"en about.version position unexpected: {i}"
lines[i] = '  "about.version": "Version 1.2.0 · schema 1 · Your day\'s quiet companion.",\n'

# 2) drop the duplicated AR v1.2 block.
#    "friday.title" occurs 3x: EN, AR copy1, AR copy2.
occ = []
for idx, ln in enumerate(lines):
    if '"friday.title"' in ln:
        occ.append(idx)
assert len(occ) == 3, f"expected 3 friday.title occurrences, got {len(occ)}: {occ}"
second = occ[2]
# walk back to the blank line + comment that precede the duplicate block
start = second
while start > 0 and "/*" not in lines[start]:
    start -= 1
if start > 0 and lines[start - 1].strip() == "":
    start -= 1
# walk forward to the block's last key ("review.fridayNote")
end = second
while '"review.fridayNote"' not in lines[end]:
    end += 1
del lines[start : end + 1]
print(f"deleted duplicate AR block: original lines {start + 1}..{end + 1}")

open(PATH, "w", encoding="utf-8").writelines(lines)
print("done")
