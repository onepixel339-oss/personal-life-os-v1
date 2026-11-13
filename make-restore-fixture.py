#!/usr/bin/env python3
"""Craft a valid Life OS backup file for the browser restore E2E test.

Mirrors backup-service.ts: checksum = "sha256:" + SHA-256 over canonical
JSON of `data` (keys sorted recursively, JSON.stringify separators).
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ALL_STORES = [
    "items", "spaces", "itemSpaceLinks", "itemRelationships",
    "projectDetails", "noteDetails", "returnNoteSettings",
    "entertainmentDetails", "inboxEntries", "weeklyPlans", "weeklyEntries",
    "dailyPlans", "dailyPeriods", "dailyEntries", "periodSettings",
    "recurrenceRules", "occurrenceStates", "routines", "routineItems",
    "routineExecutions", "routineExecutionSteps", "weeklyReviews",
    "resumeMarkers", "resumeSuggestionStates", "activityHistory",
    "appSettings",
]

now = int(datetime.now(timezone.utc).timestamp() * 1000)

data = {store: [] for store in ALL_STORES}
data["items"] = [
    {
        "id": "restored-item-1",
        "type": "task",
        "title": "عنصر مستعاد من الملف",
        "description": "",
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    },
]
data["spaces"] = [
    {
        "id": "restored-space-1",
        "name": "مساحة المستعادة",
        "description": "",
        "sortOrder": "1",
        "createdAt": now,
    },
]

settings = {
    "user.name": "سارة",
    "user.registeredAt": now,
    "ui.language": "ar",
}


def canonical(value):
    if isinstance(value, list):
        return [canonical(v) for v in value]
    if isinstance(value, dict):
        return {k: canonical(v) for k, v in sorted(value.items())}
    return value


canonical_str = json.dumps(
    canonical(data), ensure_ascii=False, separators=(",", ":")
)
checksum = "sha256:" + hashlib.sha256(
    canonical_str.encode("utf-8")
).hexdigest()

payload = {
    "app": "personal-life-os",
    "schemaVersion": 1,
    "exportedAt": datetime.now(timezone.utc).isoformat(),
    "appVersion": "1.0.0",
    "counts": {k: len(v) for k, v in data.items()},
    "checksum": checksum,
    "data": data,
    "settings": settings,
}

out = Path("/home/z/my-project/tests/fixtures/restore-e2e-backup.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"written {out} ({out.stat().st_size} bytes), checksum {checksum[:20]}…")
