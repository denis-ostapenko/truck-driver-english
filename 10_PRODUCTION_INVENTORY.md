# Production inventory

Inventory captured on 2026-08-20 at 04:46 EDT before cleanup.

## Scope

- Root: `/Users/garryportman/Documents/english-basic-app/truck-driver-edition`
- Files before cleanup: 69
- Directories before cleanup: 10
- File bytes before cleanup: 1,815,759
- Disk usage before cleanup: 1.9 MB
- Git repository: none in the project root
- Symlinks: none

## Canonical project content

| Group | Files | Status |
|---|---:|---|
| Planning and source documents `00` through `09` | 10 | Keep |
| Synthetic document samples and their README | 21 | Keep |
| Reproducible build and validation scripts | 2 | Keep |
| App shell, PWA files, icon and app README | 6 | Keep |
| Generated course data and build report | 3 | Keep, reproducible and currently consumed by the app or validator |
| Total canonical files before new production assets | 42 | Keep |

`course-data.js` is loaded by `index.html` and cached by `sw.js`. `course-data.json` is the validator source. `build-report.json` is the compact build contract. They are intentional generated outputs, not obsolete duplicates.

## Cleanup candidates

| Path | Files | Bytes | Classification |
|---|---:|---:|---|
| `app/.playwright-cli/` | 23 | 267,731 | Temporary browser QA snapshots |
| `app/output/playwright/` | 1 | 393,660 | Temporary browser QA screenshot |
| `scripts/__pycache__/` | 2 | 61,746 | Regenerable Python bytecode cache |
| Total | 26 | 723,137 | Move to Trash |

No other duplicate hashes, temporary files, log files, backup files, symlinks or obsolete generated outputs were found.

## Cleanup result

- The 26 identified files were moved recoverably to `/Users/garryportman/.Trash/truck-driver-edition-cleanup-2026-08-20-0448`.
- Final browser QA created another root-level `.playwright-cli` directory and regenerated `scripts/__pycache__`. Both were moved to `/Users/garryportman/.Trash/truck-driver-edition-final-qa-2026-08-20-0518`.
- Final project inventory after Hotshot expansion: 72 files, 11 directories, 5,971,701 file bytes, 6,008 KB disk usage.
- The final tree contains no Playwright snapshots, Python bytecode caches, output screenshots or cache directories.
- The growth from the pre-cleanup inventory is intentional: 16 approved WebP assets, Hotshot source data, four additional synthetic documents, visual and audio manifests and production documentation.
- Final Hotshot browser artifacts were moved recoverably to `/Users/garryportman/.Trash/truck-driver-edition-hotshot-qa-2026-08-20-0549`.

## Protected external components

- Desktop launcher: `/Users/garryportman/Desktop/Truck Driver English.app`
- LaunchAgent: `/Users/garryportman/Library/LaunchAgents/com.truckdriverenglish.app.plist`
- Truck app state key: `truck-driver-english-state-v1`, stored by the browser and not touched by filesystem cleanup
- Source English Basic app and port 8000: read-only for this production task

## Source English Basic baseline hashes

```text
c6f695333e32a2b4d75fb6c375c74035890580365cb4bc9b11ea4c6aebd7fd87  data/learning_core_1000.json
3ce59ce3a332f8a2de123ce1054905d6d78d8d98af0fd85334ff1e33ba2ec87d  data/learner_app_data.json
ace7512aabb34283c85fcef6039d444cefa44d0d3ec087e78579dc04169bc9cc  english-basic-learning-app.html
f6d13cfa7e5d3f386b418e345b6162940ab2ed7bdc1c930a3a3ad2b3f471c7d0  voice/gate.py
572fd2bd541eb515550bd77f8a5cc2a92eb675d3067b000d4fb69da426ef119f  voice/test_gate.py
```

## Runtime baseline

- `com.truckdriverenglish.app`: loaded and running
- Port 8000 English Basic: HTTP 200
- Port 8002 Truck Driver English: HTTP 200
- LaunchAgent plist: valid
