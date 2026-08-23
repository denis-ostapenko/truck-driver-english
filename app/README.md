# Truck Driver English app

## Open

- Desktop launcher: `/Users/garryportman/Desktop/Truck Driver English.app`
- Local URL: `http://127.0.0.1:8002/index.html`
- Static server: `python3 server.py --bind 127.0.0.1 --port 8002`

The server applies CSP, Permissions-Policy and defensive response headers, blocks hidden and Python paths, and supports single byte ranges. The app is local and is not intended for publication.

## Current inventory

- 700 General Core units
- 400 Truck units
- 100 Hotshot units
- 500 professional units total. A unit is a learning task, not necessarily a unique surface term.
- 75 representative training prompts, not an official standardized question set
- 8 CVSA inspection levels
- 40 situations
- 80 sign cards: 49 original FHWA SVG, 15 variable-local training cards, 16 TRAINING DMS
- 24 synthetic training documents
- 21 communication lessons
- 16 approved illustrations
- 1,261 immutable historical studio masters, 1,274 reproducible catalog deliverables and 1,514 runtime MP3 files
- 75 complete listening rows with distinct clean, phone and roadside prompt assets
- 5 driver-answer listening tasks, q15, q37, q42, q64 and q71, with 15 additional local profile renders and typed date, time, weight, duration, pressure and OOS slots

## Current product contract

- Three applicability profiles: Tractor-trailer, Hotshot open and Hotshot enclosed.
- Every main collection has `profiles` and `conditions` metadata.
- The Hotshot wallet includes pickup registration and excludes tractor registration and IRP.
- Today includes due reviews for words, questions, signs, situations, documents and lessons, plus at least one applicable professional task for 5, 10 and 15 minute routes.
- The local date key uses `America/New_York` and follows DST.
- Mastery requires two independent unsupported retrievals at least 24 hours apart.
- The optional diagnostic materializes exactly 12 items per form from a larger bank after applicability filtering, with exactly three items each for vocabulary, listening, ELP and inspection. Item responses, stimulus versions, evidence and the form version are stored locally. The two forms follow the same blueprint, but the app does not claim psychometric equivalence.
- Listening diagnostic items require stimulus exposure. Productive items use a local keyed semantic evaluator. There is no self scoring.
- The diagnostic is not a validated CEFR or ACTFL assessment and does not assign either level.
- ELP Step 1 is a fixed seven-response training gate covering a safe command, power unit and trailer identification, origin, destination, cargo, carrier or employer, and duty status or HOS. Every response is typed before reveal and checked by a local task-specific semantic rubric. Status is derived from structured evidence. It is not an official FMCSA assessment.
- ELP Step 2 draws exactly 12 reading tasks from a 47-item English-bearing pool: 8 of 31 English-bearing FHWA SVG and 4 of 16 TRAINING DMS. All 49 FHWA SVG and all 16 DMS remain available in Reference. The 18 nearly wordless FHWA cards are familiarization-only and cannot qualify Step 2.
- Lessons qualify two separate constructs: reception-only first, then production-interaction at least 24 hours later. The reception attempt precedes Russian production cues, and the productive attempt has no answer audio.
- Typed slots keep template, display and spoken forms separate for time, date, weight, duration and identifiers.
- Semantic content IDs use `contentVersion` 2. The checked-in map preserves all 640 legacy IDs.
- State schema 5 deeply normalizes import and safely recovers main, backup and staging envelopes. External JSON history is imported as unverified and cannot create mastery, diagnostic readiness, Today completion, ELP readiness or journal closure.
- Recorder teardown stops MediaRecorder, tracks and object URLs on delete, close, error and SPA navigation.
- Tabs follow the APG roving tabindex keyboard model and JavaScript respects reduced motion.

## Audio behavior

The historical studio catalog remains checked in. Cycle 3 made no paid or network API call for audio.

For the 75 representative training prompts, clean, phone and roadside are locally derived from existing dry masters. The 225 prompt derivatives and 15 mandatory driver-answer derivatives have three byte-distinct and acoustically distinct profiles. Generated QA records decoded duration, RMS, peak, pairwise waveform correlation and pairwise difference RMS. The phone profile is band-limited to 300 through 3,400 Hz. The roadside profile adds deterministic audible low-frequency pink-noise ambience. These are training processing profiles, not field recordings of a particular inspector, phone, radio or roadside environment. Automated signal QA does not replace the documented human perceptual checklist, and the checklist must not be reported as complete until a person has listened to the required samples.

The canonical audio seed is `production/audio-catalog-seed.json`. Hashes and byte sizes for all 1,261 dry masters are in `production/audio-master-seeds.json`. Hashes for all 1,274 catalog deliverables remain in `app/data/audio-production-report.json`. `scripts/build_audio_manifest.py` verifies every master hash before writing the runtime manifest. `scripts/sync_audio_catalog.py` verifies every deliverable hash and can reconstruct all catalog deliverables locally with ffmpeg. Neither script performs synthesis or calls a paid API.

Cycle 2 replaced the two historical role variants of the malformed tanker answer with `Yes. I have a tanker endorsement.`. The replacement dry masters were created once with offline macOS system voices, frozen into the immutable seed and rendered locally. Counts remain exactly 1,261 masters and 1,274 catalog deliverables.

The current federal ELD information packet is represented explicitly in `course-data.json`: data transfer instructions, malfunction instructions and enough blank graph grids for at least eight days. Effective July 22, 2026, the ELD user manual is optional device help and is not a federally required onboard item. The generated malfunction instructions preserve written notice within 24 hours, reconstruction of the current 24-hour period and previous seven consecutive days, manual paper RODS and the normal eight-day repair deadline. Document rows include conditions, current source references and effective-date context, including the temporary April 11 through October 11, 2026 MEC and NRII transition context.

When exact corrected content has no matching studio asset, the app uses browser Web Speech for the exact current text or disables the unavailable profile. Corrected sign text does not reuse stale mismatched MP3 files.

## Rebuild and validate

Run from `truck-driver-edition`:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_app.py --built-on 2026-08-21
PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_audio_manifest.py --built-on 2026-08-21
PYTHONDONTWRITEBYTECODE=1 python3 scripts/sync_audio_catalog.py --built-on 2026-08-21
PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_listening_profiles.py --built-on 2026-08-21
python3 scripts/validate_app.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
find app -name '*.js' -print0 | xargs -0 -n1 node --check
```

All four data and audio builders accept `--built-on YYYY-MM-DD`. They also accept `SOURCE_DATE_EPOCH` when `--built-on` is omitted. The default checked-in date is fixed, not the wall-clock date. The build reads source data from the parent English Basic project but writes only inside `truck-driver-edition/app/data`. It does not modify the source app.

To prove a clean local reconstruction of all 1,274 catalog deliverables without changing runtime files:

```bash
audio_repro_dir=$(mktemp -d /tmp/truck-audio-repro.XXXXXX)
PYTHONDONTWRITEBYTECODE=1 python3 scripts/sync_audio_catalog.py \
  --built-on 2026-08-21 \
  --rebuild-deliverables \
  --force-render \
  --workers 8 \
  --output-root "$audio_repro_dir" \
  --render-only
```

The command succeeds only if all regenerated files match the checked-in SHA-256 inventory. Remove that exact temporary directory after inspection. Seed initialization is not part of a normal rebuild. The maintainer-only `--initialize-seeds-from-existing` option is reserved for an explicitly authorized new canonical production run.

Browser regression uses an isolated test origin. Recorder tests use mocked MediaRecorder and MediaStream objects and never grant microphone permission. State fixtures use in-memory storage and never read or clear the real localStorage on origin 8002.

## Offline and cache

The current service worker uses versioned shell and media caches, removes stale cache versions, waits for cache writes and supports cached Range responses. The shell includes current scripts, course data, 16 illustrations and 49 official SVG files. Media becomes available warm offline after first use.

No runtime `.staging` directory is required or distributed.

## State compatibility

The storage key remains `truck-driver-english-state-v1`. The internal state schema is version 5 and accepts legacy versions 1 through 4. The content schema is version 2. State import uses `app/data/content-id-migrations.json` to preserve old IDs as unverified history across semantic changes, including cross-collection moves.

Current implementation and compliance notes are in `../19_CYCLE_3_FINAL_REMEDIATION.md`. Cycle 1, Cycle 2, Batch 2, Batch 3 and Batch 4 documents are historical snapshots and are explicitly superseded.
