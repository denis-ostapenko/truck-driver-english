# Audio production and listening contract

## Current status

Cycle 2 made no paid API call. Existing immutable dry masters remain the source library. Runtime and clean reconstruction do not depend on a `.staging` directory.

Current checked-in contract:

- 1,261 immutable masters;
- 42,090 characters across current master identities;
- 1,274 final MP3 deliverables;
- 43,932,018 bytes across reconstructed deliverables;
- 1,514 runtime MP3 files, including 240 listening derivatives;
- output format `mp3_44100_128` for the catalog deliverables;
- integrity map `app/data/audio-production-report.json`;
- runtime lookup `app/data/audio-data.js`;
- `paidApiCalls: 0` for Cycle 2 local reconstruction and profile rendering.

The `paidTtsCharacters: 42064` field is retained only as historical provenance for the earlier paid production run. It is not the current master character contract. The current catalog contract is `catalogMasterCharacters: 42090`, which includes reviewed local identity replacements and punctuation correction. The historical generation model recorded in the manifest is `eleven_flash_v2_5`; this is provenance, not an instruction to run another paid job.

## Clean local reconstruction

The canonical identity list is frozen in `production/audio-catalog-seed.json`. `production/audio-master-seeds.json` pins every master hash. A normal verification does not initialize or rewrite either seed:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_audio_manifest.py --verify-only
```

A clean deliverable proof is rendered into a new temporary output root from the immutable masters:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/sync_audio_catalog.py \
  --built-on 2026-08-21 \
  --output-root /absolute/path/to/empty/app-root \
  --rebuild-deliverables \
  --force-render \
  --render-only \
  --workers 8
```

The fresh Cycle 2 proof created 1,274 deliverables totaling 43,932,018 bytes and verified 1,274 of 1,274 hashes. It made zero paid API calls. Seed initialization and hash refresh flags are maintainer-only operations and are not part of a clean build.

## Roles

| Content | Role |
|---|---|
| Truck and Hotshot word | driver |
| Truck and Hotshot example | driver |
| Representative training prompt | inspector |
| Representative training answer | driver |
| Situation line | speaker-specific role |
| Sign legend | narrator or current exact fallback |
| Document practice | driver |
| Lesson phrase | driver |

The data layer stores `wordRole`, `exampleRole`, `promptRole` and `answerRole`. The validator rejects a prompt rendered with the driver role or an answer rendered with the inspector role.

## Typed values

Authoring templates may contain typed slots. The audio lookup receives materialized spoken text, not a generic digit-by-digit conversion.

Examples:

- time: `7:40 a.m.` becomes `seven forty A.M.`;
- weight: `38,200` becomes `thirty-eight thousand two hundred`;
- USDOT number: digits are read individually;
- equipment identifier `T-204`: prefix and digits are read as an identifier;
- `question-71`: `The driver is out of service until the required rest period is complete.`

Every slot has separate `display` and `spoken` values. The build fails on unresolved brackets.

## Listening matrix for 75 prompts

`app/data/listening-data.json` and `app/data/listening-data.js` contain one row for every representative training prompt. Each row has three distinct local assets:

- clean;
- phone;
- roadside.

Clean, phone and roadside are rendered locally from existing dry studio masters. Phone uses a telephone-oriented band limit and compression. Roadside adds deterministic low-frequency pink-noise ambience. The builder stores hashes, byte sizes, decoded durations and signal QA for all three profiles and records `paidApiCalls: 0`. The profiles are rebuilt without any network or synthesis request:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_listening_profiles.py \
  --built-on 2026-08-21 \
  --force
```

Automated DSP QA checks local file existence, minimum size, three distinct SHA-256 hashes, decoded duration, RMS and peak levels, pairwise waveform correlation, pairwise difference RMS and typed semantic slot coverage. This verifies that clean, phone and roadside are different files with the expected measurable processing. It does not replace human listening.

These files are training processing profiles. They are not recordings of a particular inspector, telephone, radio channel or roadside environment. They do not prove that a learner will understand speech in real noise. Human perceptual QA was not performed in Cycle 2 and remains a required manual signoff for speech intelligibility, number distinguishability, phone coloration and roadside noise balance. The UI labels unavailable profiles as unavailable instead of silently substituting the same file under another name.

Repeat with pause reuses the roadside clip with an explicit pause. It is a repetition mode, not a fourth acoustic profile.

## Exact text and fallback

Audio is selected by current semantic source ID, field, role, profile and exact materialized text. A legacy `audioSourceId` may be used only when the old recording still matches the current text and role.

Signs 23, 27, 30, 34, 35, 52, 54, 55, 62, 63 and 64 were corrected in Cycle 1. Their stale legacy audio is disabled. Browser Web Speech may read the exact current legend and action. If both local media and Web Speech are unavailable, the app reports the limitation and keeps the text visible.

This same rule applies to any newly materialized prompt whose old MP3 contains a placeholder or different value. Case-insensitive validation rejects `a.m..` and `p.m..` in both generated content and catalog identities. The corrected catalog identity is `I came on duty at nine thirty A.M.`. Its driver and inspector identities received deterministic keys, current hashes and locally rendered roadside deliverables without a paid call.

## Offline behavior

The shell cache does not duplicate the full audio library. Audio enters the versioned media cache after use. Cached Range requests are served from the complete stored response. A clip that was never warmed may be unavailable after the local server is stopped.

## Validation

`scripts/validate_app.py` verifies:

- master and deliverable counts;
- local file existence and minimum size;
- production integrity map size;
- prompt and answer roles;
- JSON and JavaScript listening wrapper equality;
- exact coverage of all 75 semantic question IDs;
- distinct SHA-256 content for clean, phone and roadside in every row;
- materialized `spokenText`, including `question-71`;
- zero paid API calls in the listening profile build;
- nonempty limitation text.

`tests/test_audio_catalog.py` also verifies 1,261 current master hashes, 1,274 deliverable hashes, the 42,090-character current master contract, zero Cycle 2 paid calls and the case-insensitive double-punctuation denylist.

Additional regression:

```bash
python3 -m unittest tests.test_audio_catalog tests.test_listening_profiles
```

No test opens a real microphone or external audio API.

Automated status is PASS. Final human perceptual status is NOT PERFORMED, so the audio set is suitable for a local pilot but does not have unconditional production signoff.
