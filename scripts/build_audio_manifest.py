import argparse
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
COURSE_PATH = APP / "data" / "course-data.json"
MANIFEST_PATH = APP / "data" / "audio-manifest.json"
REPORT_PATH = APP / "data" / "audio-report.json"
PRODUCTION_REPORT_PATH = APP / "data" / "audio-production-report.json"
CATALOG_SEED_PATH = EDITION / "production" / "audio-catalog-seed.json"
MASTER_SEED_REPORT_PATH = EDITION / "production" / "audio-master-seeds.json"
MASTER_AUDIO = EDITION / "production" / "audio-masters"
DEFAULT_BUILD_DATE = "2026-08-21"
EXPECTED_MASTERS = 1450
EXPECTED_MASTER_CHARACTERS = 52661
HISTORICAL_PAID_CHARACTERS = 52635
EXPECTED_DELIVERABLES = 1466

SPEAKER_ROLES = {
    "Driver": "driver",
    "Inspector": "inspector",
    "Officer": "inspector",
    "Trooper": "state-trooper",
    "Dispatcher": "dispatcher",
    "Guard": "gate-clerk",
    "Clerk": "gate-clerk",
    "Scale Clerk": "gate-clerk",
    "Cashier": "gate-clerk",
    "Staff": "gate-clerk",
    "Spotter": "gate-clerk",
    "Receiver": "receiver",
    "Loader": "receiver",
    "Maintenance": "mechanic",
    "Roadside": "roadside-assistance",
    "911": "state-trooper",
}

SPEAKER_SEMANTIC_ROLES = {
    "Driver": "driver",
    "Inspector": "safety-inspector",
    "Officer": "enforcement-officer",
    "Trooper": "state-trooper",
    "Dispatcher": "carrier-dispatcher",
    "Guard": "security-gate-guard",
    "Clerk": "shipping-clerk",
    "Scale Clerk": "scale-clerk",
    "Cashier": "fuel-cashier",
    "Staff": "parking-attendant",
    "Spotter": "vehicle-spotter",
    "Receiver": "receiver",
    "Loader": "loader",
    "Maintenance": "maintenance-technician",
    "Roadside": "roadside-assistance",
    "911": "emergency-dispatcher",
}

ROLES = {
    "driver": {"casting": "calm adult male driver, neutral American English", "voiceName": "Roger - Laid-Back, Casual, Resonant", "voiceId": "CwhRBWXzGAHq8TQ4Fs17"},
    "inspector": {"casting": "clear authoritative adult inspector, neutral American English", "voiceName": "Eric - Smooth, Trustworthy", "voiceId": "cjVigY5qzO86Huf0OWal"},
    "state-trooper": {"casting": "calm concise state trooper, neutral American English", "voiceName": "Adam - Dominant, Firm", "voiceId": "pNInz6obpgDQGcFmaJgB"},
    "dispatcher": {"casting": "efficient adult dispatcher, neutral American English", "voiceName": "Sarah - Mature, Reassuring, Confident", "voiceId": "EXAVITQu4vr4xnSDxMaL"},
    "gate-clerk": {"casting": "practical warehouse or gate clerk, neutral American English", "voiceName": "Matilda - Knowledgable, Professional", "voiceId": "XrExE9yKIg1WjnnlVkGX"},
    "receiver": {"casting": "clear warehouse receiver, neutral American English", "voiceName": "Bella - Professional, Bright, Warm", "voiceId": "hpp4J3VqNfWAUOO0d1Us"},
    "mechanic": {"casting": "direct experienced mechanic, neutral American English", "voiceName": "Brian - Deep, Resonant and Comforting", "voiceId": "nPczCjzI2devNBz1zQrb"},
    "roadside-assistance": {"casting": "calm roadside assistance operator, neutral American English", "voiceName": "River - Relaxed, Neutral, Informative", "voiceId": "SAz9YHcvj6GT2YYXdXww"},
}

PROFILES = {
    "clean": {
        "source": "dry studio master",
        "processing": "no ambience, no telephone filter, peak normalized",
    },
    "phone": {
        "source": "dry studio master",
        "processing": "telephone band limit and light compression, keep numbers intelligible",
    },
    "roadside": {
        "source": "dry studio master",
        "processing": "very light road ambience under voice, no masking of consonants or numbers",
    },
}


def clean_text(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if re.search(r"\[[^\]]+\]", text):
        raise ValueError(f"Unmaterialized typed slot in audio text: {text}")
    return text


def expand_text(value):
    return [clean_text(part) for part in str(value or "").split(" / ") if clean_text(part)]


def situation_profile(_index, item):
    if item.get("audioProfile") in PROFILES:
        return item["audioProfile"]
    mechanic = item.get("mechanic", "").lower()
    if "phone" in mechanic:
        return "phone"
    if "roadside" in mechanic:
        return "roadside"
    return "clean"


def add_occurrences(data):
    occurrences = []

    def add(text, role, profile, source_type, source_id, field, semantic_role=None):
        for expanded in expand_text(text):
            occurrences.append({
                "text": expanded,
                "role": role,
                "semanticRole": semantic_role or role,
                "voicePreset": role,
                "voiceId": ROLES[role]["voiceId"],
                "profile": profile,
                "sourceType": source_type,
                "sourceId": source_id,
                "field": field,
            })

    for item in data["truck"]:
        profile = item.get("audioProfile") or ("roadside" if item.get("kind") in {"training-prompt", "training-answer"} else "clean")
        add(item["word"], item.get("wordRole", "driver"), profile, "truck-unit", item["id"], "word")
        add(item["example"], item.get("exampleRole", "driver"), profile, "truck-unit", item["id"], "example")

    for item in data["hotshot"]:
        add(item["word"], item.get("wordRole", "driver"), item.get("audioProfile", "clean"), "hotshot-unit", item["id"], "word")
        add(item["example"], item.get("exampleRole", "driver"), item.get("audioProfile", "clean"), "hotshot-unit", item["id"], "example")

    for item in data["inspectionQuestions"]:
        add(item["prompt"], "inspector", "roadside", "inspection-question", item["id"], "prompt")
        add(item["answer"], "driver", "roadside", "inspection-question", item["id"], "answer")

    for index, item in enumerate(data["situations"]):
        profile = situation_profile(index, item)
        for line_index, line in enumerate(item["dialogue"], start=1):
            role = SPEAKER_ROLES[line["speaker"]]
            semantic_role = line.get("semanticRole") or SPEAKER_SEMANTIC_ROLES[line["speaker"]]
            add(line["english"], role, profile, "situation", item["id"], f"dialogue-{line_index}", semantic_role)
        for variant in item.get("practiceContract", {}).get("variants", []):
            for turn in variant.get("criticalTurns", []):
                add(
                    turn["prompt"],
                    turn["promptRole"],
                    profile,
                    "situation",
                    item["id"],
                    f"practice-{variant['id']}-{turn['id']}-prompt",
                )

    for item in data["signs"]:
        add(item["display"], "driver", "clean", "sign", item["id"], "display")
        add(item["actionEn"], "driver", "clean", "sign", item["id"], "action")

    for item in data["documents"]:
        practice = item.get("practice") or "This training document is available for inspection."
        add(practice, "driver", "clean", "document", item["id"], "practice")

    for item in data["lessons"]:
        profile = item.get("audioProfile", "clean")
        for phrase_index, phrase in enumerate(item["phrases"], start=1):
            add(phrase, "driver", profile, "lesson", item["id"], f"phrase-{phrase_index}")

    add(
        "Could you repeat that more slowly, please?",
        "driver",
        "clean",
        "static-ui",
        "voice-lab",
        "model",
    )

    return occurrences


def materialize_current_requirements(data, catalog):
    deliverables = {
        (item["role"], item["profile"], item["text"]): item
        for item in catalog["deliverables"]
    }
    requirements = []
    for occurrence in add_occurrences(data):
        deliverable = deliverables.get((occurrence["role"], occurrence["profile"], occurrence["text"]))
        path = APP / deliverable["path"] if deliverable else None
        available = bool(path and path.is_file() and path.stat().st_size > 1024)
        requirements.append({
            **occurrence,
            "available": available,
            "path": deliverable["path"] if available else None,
            "fallback": None if available else "browser-speech-exact-materialized-text",
        })
    return requirements


def resolve_build_date(explicit=None):
    value = explicit
    if value is None and os.environ.get("SOURCE_DATE_EPOCH"):
        try:
            value = datetime.fromtimestamp(int(os.environ["SOURCE_DATE_EPOCH"]), tz=timezone.utc).date().isoformat()
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("SOURCE_DATE_EPOCH must be a valid Unix timestamp") from error
    value = value or DEFAULT_BUILD_DATE
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat()
    except ValueError as error:
        raise ValueError("--built-on must use YYYY-MM-DD") from error


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_catalog(manifest):
    return {
        "seedVersion": 1,
        "sourceProductionDate": manifest.get("builtOn", "2026-08-20"),
        "synthesisIdentity": manifest["synthesisIdentity"],
        "renderIdentity": manifest["renderIdentity"],
        "outputFormat": manifest["outputFormat"],
        "roles": manifest["roles"],
        "profiles": manifest["profiles"],
        "synthesisMasters": manifest["synthesisMasters"],
        "deliverables": [{**item, "sources": []} for item in manifest["deliverables"]],
    }


def validate_catalog_structure(catalog):
    masters = catalog.get("synthesisMasters", [])
    deliverables = catalog.get("deliverables", [])
    if len(masters) != EXPECTED_MASTERS:
        raise ValueError(f"Immutable catalog must contain {EXPECTED_MASTERS} masters, got {len(masters)}")
    if sum(item.get("characters", 0) for item in masters) != EXPECTED_MASTER_CHARACTERS:
        raise ValueError("Immutable master character count changed")
    if len(deliverables) != EXPECTED_DELIVERABLES:
        raise ValueError(f"Immutable catalog must contain {EXPECTED_DELIVERABLES} deliverables, got {len(deliverables)}")

    master_keys = set()
    render_keys = set()
    for master in masters:
        identity = "\0".join((master["role"], master["text"]))
        expected_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
        if master["synthesisKey"] != expected_key:
            raise ValueError(f"Invalid synthesis identity: {master['synthesisKey']}")
        if master["synthesisKey"] in master_keys:
            raise ValueError(f"Duplicate synthesis key: {master['synthesisKey']}")
        master_keys.add(master["synthesisKey"])
        expected_path = f"production/audio-masters/{master['role']}/{master['synthesisKey']}.mp3"
        if master.get("stagingPath") != expected_path:
            raise ValueError(f"Invalid master seed path: {master['synthesisKey']}")

    for item in deliverables:
        identity = "\0".join((item["role"], item["profile"], item["text"]))
        expected_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
        if item["renderKey"] != expected_key:
            raise ValueError(f"Invalid render identity: {item['renderKey']}")
        if item["renderKey"] in render_keys:
            raise ValueError(f"Duplicate render key: {item['renderKey']}")
        render_keys.add(item["renderKey"])
        if item["synthesisKey"] not in master_keys:
            raise ValueError(f"Missing synthesis master for {item['renderKey']}")
        expected_path = f"audio/{item['role']}/{item['profile']}/{item['renderKey']}.mp3"
        if item.get("path") != expected_path:
            raise ValueError(f"Invalid deliverable path: {item['renderKey']}")
        if item["profile"] not in PROFILES or item["role"] not in ROLES:
            raise ValueError(f"Unknown role or profile: {item['renderKey']}")
    return master_keys, render_keys


def build_master_seed_report(catalog, built_on):
    rows = []
    for master in sorted(catalog["synthesisMasters"], key=lambda item: item["synthesisKey"]):
        path = MASTER_AUDIO / master["role"] / f"{master['synthesisKey']}.mp3"
        if not path.is_file() or path.stat().st_size <= 1024:
            raise ValueError(f"Missing immutable master: {path.relative_to(EDITION)}")
        rows.append({
            "synthesisKey": master["synthesisKey"],
            "path": path.relative_to(EDITION).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": file_sha256(path),
        })
    return {
        "version": 1,
        "builtOn": built_on,
        "policy": "Immutable local dry masters. Normal rebuilds verify these hashes and never call a paid API.",
        "localReplacements": catalog.get("cycle2LocalReplacements", []),
        "masterCount": len(rows),
        "totalBytes": sum(item["bytes"] for item in rows),
        "masters": rows,
    }


def validate_master_seed_report(catalog):
    report = json.loads(MASTER_SEED_REPORT_PATH.read_text(encoding="utf-8"))
    expected_keys = {item["synthesisKey"] for item in catalog["synthesisMasters"]}
    rows = report.get("masters", [])
    row_keys = {item.get("synthesisKey") for item in rows}
    if report.get("masterCount") != EXPECTED_MASTERS or len(rows) != EXPECTED_MASTERS or row_keys != expected_keys:
        raise ValueError("Immutable master seed inventory is incomplete")
    total_bytes = 0
    for item in rows:
        path = EDITION / item["path"]
        if not path.is_file() or path.stat().st_size != item.get("bytes"):
            raise ValueError(f"Immutable master size mismatch: {item['synthesisKey']}")
        if file_sha256(path) != item.get("sha256"):
            raise ValueError(f"Immutable master hash mismatch: {item['synthesisKey']}")
        total_bytes += path.stat().st_size
    if total_bytes != report.get("totalBytes"):
        raise ValueError("Immutable master byte total changed")
    return report


def build_report(data, catalog, built_on, master_report):
    occurrences = add_occurrences(data)
    unique_texts = {item["text"] for item in occurrences}
    source_type_occurrences = Counter(item["sourceType"] for item in occurrences)
    deliverables = catalog["deliverables"]
    role_files = Counter(item["role"] for item in deliverables)
    profile_files = Counter(item["profile"] for item in deliverables)
    role_characters = Counter()
    profile_characters = Counter()
    for item in deliverables:
        role_characters[item["role"]] += item["characters"]
        profile_characters[item["profile"]] += item["characters"]
    return {
        "version": 3,
        "builtOn": built_on,
        "contentVersion": data["contentVersion"],
        "includedCourseObjects": {
            "truckUnits": len(data["truck"]),
            "hotshotUnits": len(data["hotshot"]),
            "inspectionQuestions": len(data["inspectionQuestions"]),
            "situations": len(data["situations"]),
            "signs": len(data["signs"]),
            "documents": len(data["documents"]),
            "lessons": len(data["lessons"]),
        },
        "sourceOccurrencesAfterAlternativeExpansion": len(occurrences),
        "sourceOccurrencesByType": dict(sorted(source_type_occurrences.items())),
        "uniqueExactTexts": len(unique_texts),
        "uniqueExactTextCharacters": sum(len(text) for text in unique_texts),
        "paidTtsRequests": EXPECTED_MASTERS,
        "paidTtsCharacters": HISTORICAL_PAID_CHARACTERS,
        "catalogMasterCharacters": EXPECTED_MASTER_CHARACTERS,
        "localReplacementMasters": 2,
        "finalAudioFiles": EXPECTED_DELIVERABLES,
        "finalAudioCharacters": sum(item["characters"] for item in deliverables),
        "filesByRole": dict(sorted(role_files.items())),
        "charactersByRole": dict(sorted(role_characters.items())),
        "filesByProfile": dict(sorted(profile_files.items())),
        "charactersByProfile": dict(sorted(profile_characters.items())),
        "catalogSeed": CATALOG_SEED_PATH.relative_to(EDITION).as_posix(),
        "masterSeedReport": MASTER_SEED_REPORT_PATH.relative_to(EDITION).as_posix(),
        "masterSeedReportSha256": file_sha256(MASTER_SEED_REPORT_PATH),
        "verifiedMasterFiles": master_report["masterCount"],
        "verifiedMasterBytes": master_report["totalBytes"],
        "paidApiCalls": 0,
        "unresolvedPlaceholders": [],
    }


def initialize_seeds(built_on):
    if not MANIFEST_PATH.is_file():
        raise ValueError("Existing canonical app/data/audio-manifest.json is required for seed initialization")
    existing = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    catalog = canonical_catalog(existing)
    validate_catalog_structure(catalog)
    CATALOG_SEED_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    master_report = build_master_seed_report(catalog, built_on)
    MASTER_SEED_REPORT_PATH.write_text(json.dumps(master_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return catalog, master_report


def main(built_on=None, initialize=False, verify_only=False, refresh_master_hashes=False):
    built_on = resolve_build_date(built_on)
    if initialize:
        catalog, master_report = initialize_seeds(built_on)
    elif refresh_master_hashes:
        catalog = json.loads(CATALOG_SEED_PATH.read_text(encoding="utf-8"))
        validate_catalog_structure(catalog)
        master_report = build_master_seed_report(catalog, built_on)
        MASTER_SEED_REPORT_PATH.write_text(json.dumps(master_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        if not CATALOG_SEED_PATH.is_file() or not MASTER_SEED_REPORT_PATH.is_file():
            raise ValueError("Immutable audio seed files are missing. Seed initialization is a maintainer-only operation.")
        catalog = json.loads(CATALOG_SEED_PATH.read_text(encoding="utf-8"))
        validate_catalog_structure(catalog)
        master_report = validate_master_seed_report(catalog)
    if verify_only:
        print(json.dumps({"status": "verified", "masters": EXPECTED_MASTERS, "deliverables": EXPECTED_DELIVERABLES, "paidApiCalls": 0}))
        return

    data = json.loads(COURSE_PATH.read_text(encoding="utf-8"))
    manifest = {
        "version": 3,
        "builtOn": built_on,
        "contentVersion": data["contentVersion"],
        "catalogSeed": CATALOG_SEED_PATH.relative_to(EDITION).as_posix(),
        "masterSeedReport": MASTER_SEED_REPORT_PATH.relative_to(EDITION).as_posix(),
        "synthesisIdentity": catalog["synthesisIdentity"],
        "renderIdentity": catalog["renderIdentity"],
        "outputFormat": catalog["outputFormat"],
        "roles": catalog["roles"],
        "speakerMetadata": {
            speaker: {"semanticRole": SPEAKER_SEMANTIC_ROLES[speaker], "voicePreset": preset, "voiceId": ROLES[preset]["voiceId"]}
            for speaker, preset in SPEAKER_ROLES.items()
        },
        "profiles": catalog["profiles"],
        "synthesisMasters": catalog["synthesisMasters"],
        "deliverables": catalog["deliverables"],
        "currentRequirements": [],
        "fallbackPolicy": "The release requires exact generated local MP3 coverage; validation fails if any current requirement is missing.",
    }
    report = build_report(data, catalog, built_on, master_report)
    manifest["currentRequirements"] = materialize_current_requirements(data, catalog)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "builtOn": built_on,
        "verifiedMasters": master_report["masterCount"],
        "catalogDeliverables": len(catalog["deliverables"]),
        "currentRequirements": report["sourceOccurrencesAfterAlternativeExpansion"],
        "paidApiCalls": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--built-on", help="Deterministic build date in YYYY-MM-DD. SOURCE_DATE_EPOCH is also supported.")
    parser.add_argument("--initialize-seeds-from-existing", action="store_true", help="Maintainer-only: freeze the existing canonical catalog and local master hashes.")
    parser.add_argument("--refresh-master-hashes-from-catalog-seed", action="store_true", help="Maintainer-only: freeze hashes after an explicitly reviewed local seed replacement.")
    parser.add_argument("--verify-only", action="store_true", help="Verify catalog identities and all immutable master hashes without writing app data.")
    arguments = parser.parse_args()
    main(arguments.built_on, arguments.initialize_seeds_from_existing, arguments.verify_only, arguments.refresh_master_hashes_from_catalog_seed)
