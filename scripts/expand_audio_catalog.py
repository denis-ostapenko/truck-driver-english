import hashlib
import json
from collections import defaultdict
from pathlib import Path

from build_audio_manifest import add_occurrences


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
COURSE_PATH = APP / "data" / "course-data.json"
MANIFEST_PATH = APP / "data" / "audio-manifest.json"
CATALOG_PATH = EDITION / "production" / "audio-catalog-seed.json"
BUILD_DATE = "2026-08-22"
BASE_MASTERS = 1261
BASE_DELIVERABLES = 1274
TARGET_MASTERS = 1450
TARGET_DELIVERABLES = 1466


def identity_key(*parts):
    return hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:24]


def main():
    data = json.loads(COURSE_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    masters = catalog["synthesisMasters"]
    deliverables = catalog["deliverables"]
    if not BASE_MASTERS <= len(masters) <= TARGET_MASTERS:
        raise ValueError(f"Unexpected source master count: {len(masters)}")
    if not BASE_DELIVERABLES <= len(deliverables) <= TARGET_DELIVERABLES:
        raise ValueError(f"Unexpected source deliverable count: {len(deliverables)}")

    masters_by_identity = {(item["role"], item["text"]): item for item in masters}
    deliverables_by_identity = {
        (item["role"], item["profile"], item["text"]): item for item in deliverables
    }
    sources_by_identity = defaultdict(list)
    for occurrence in add_occurrences(data):
        identity = (occurrence["role"], occurrence["profile"], occurrence["text"])
        source = {key: occurrence[key] for key in ("sourceType", "sourceId", "field")}
        if source not in sources_by_identity[identity]:
            sources_by_identity[identity].append(source)

    for role, profile, text in sorted(sources_by_identity):
        master_identity = (role, text)
        master = masters_by_identity.get(master_identity)
        if master is None:
            synthesis_key = identity_key(role, text)
            master = {
                "synthesisKey": synthesis_key,
                "text": text,
                "characters": len(text),
                "role": role,
                "stagingPath": f"production/audio-masters/{role}/{synthesis_key}.mp3",
                "profiles": [],
                "deliverableRenderKeys": [],
            }
            masters.append(master)
            masters_by_identity[master_identity] = master

        deliverable_identity = (role, profile, text)
        deliverable = deliverables_by_identity.get(deliverable_identity)
        if deliverable is None:
            render_key = identity_key(role, profile, text)
            deliverable = {
                "renderKey": render_key,
                "synthesisKey": master["synthesisKey"],
                "text": text,
                "characters": len(text),
                "role": role,
                "profile": profile,
                "path": f"audio/{role}/{profile}/{render_key}.mp3",
                "sources": [],
            }
            deliverables.append(deliverable)
            deliverables_by_identity[deliverable_identity] = deliverable
        master["profiles"] = sorted(set(master.get("profiles", [])) | {profile})
        master["deliverableRenderKeys"] = sorted(
            set(master.get("deliverableRenderKeys", [])) | {deliverable["renderKey"]}
        )

    if len(masters) != TARGET_MASTERS or len(deliverables) != TARGET_DELIVERABLES:
        raise ValueError(
            f"Expanded catalog mismatch: {len(masters)} masters, {len(deliverables)} deliverables"
        )

    catalog["seedVersion"] = 2
    catalog["sourceProductionDate"] = BUILD_DATE
    catalog["coveragePolicy"] = "Every current course audio requirement has an exact generated MP3 for its role, profile, and materialized text."
    catalog["cycle3FullCoverageExpansion"] = {
        "builtOn": BUILD_DATE,
        "addedMasters": TARGET_MASTERS - BASE_MASTERS,
        "addedDeliverables": TARGET_DELIVERABLES - BASE_DELIVERABLES,
        "reason": "Replace every browser-speech fallback with a generated local MP3.",
    }
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for key in ("synthesisIdentity", "renderIdentity", "outputFormat", "roles", "profiles"):
        manifest[key] = catalog[key]
    manifest["version"] = 4
    manifest["builtOn"] = BUILD_DATE
    manifest["synthesisMasters"] = masters
    manifest["deliverables"] = deliverables
    manifest["currentRequirements"] = []
    manifest["fallbackPolicy"] = "The release requires exact generated local MP3 coverage; validation fails if any current requirement is missing."
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "masters": len(masters),
        "masterCharacters": sum(item["characters"] for item in masters),
        "deliverables": len(deliverables),
    }))


if __name__ == "__main__":
    main()
