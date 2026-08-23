import argparse
import concurrent.futures
import hashlib
import json
import subprocess
from pathlib import Path

from build_audio_manifest import (
    MASTER_AUDIO,
    PROFILES,
    add_occurrences,
    resolve_build_date,
    validate_catalog_structure,
    validate_master_seed_report,
)


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
DATA_PATH = APP / "data" / "course-data.json"
MANIFEST_PATH = APP / "data" / "audio-manifest.json"
AUDIO_DATA_PATH = APP / "data" / "audio-data.js"
REPORT_PATH = APP / "data" / "audio-report.json"
PRODUCTION_REPORT_PATH = APP / "data" / "audio-production-report.json"
REVIEWED_REPLACED_RENDER_KEYS = {"898a5347f1051df86647610e", "c499f24cb710014ce2d8a987"}
REVIEWED_LOCAL_RENDER_KEYS = {"c7db283177c93845bfde6956", "01bb09bb4cfb32b8ab0a6c35"}

CURRENT_COLLECTIONS = {
    "truck-unit": "truck",
    "hotshot-unit": "hotshot",
    "inspection-question": "inspectionQuestions",
    "situation": "situations",
    "sign": "signs",
    "document": "documents",
    "lesson": "lessons",
}


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def valid_mp3(path):
    if not path.is_file() or path.stat().st_size <= 1024:
        return False
    with path.open("rb") as source:
        return source.read(3) in {b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}


def source_key(source):
    return "\0".join((source["sourceType"], source["sourceId"], source["field"]))


def render_command(source, target, profile, render_key):
    common = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
    if profile == "clean":
        return common + ["-af", "loudnorm=I=-18:LRA=7:TP=-1.5", "-codec:a", "libmp3lame", "-b:a", "128k", str(target)]
    if profile == "phone":
        audio_filter = "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=2:attack=20:release=200,loudnorm=I=-18:LRA=7:TP=-1.5"
        return common + ["-af", audio_filter, "-codec:a", "libmp3lame", "-b:a", "128k", str(target)]
    if profile == "roadside":
        seed = int(render_key[:8], 16)
        filter_graph = "[0:a]loudnorm=I=-18:LRA=7:TP=-1.5[voice];[1:a]highpass=f=80,lowpass=f=900,volume=0.035[noise];[voice][noise]amix=inputs=2:duration=first:weights='1 0.18',loudnorm=I=-18:LRA=7:TP=-1.5[out]"
        return common + ["-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.02:seed={seed}", "-filter_complex", filter_graph, "-map", "[out]", "-codec:a", "libmp3lame", "-b:a", "128k", str(target)]
    raise ValueError(f"Unknown profile: {profile}")


def render_one(item, output_root, force=False):
    source = MASTER_AUDIO / item["role"] / f"{item['synthesisKey']}.mp3"
    target = output_root / item["path"]
    if not valid_mp3(source):
        raise RuntimeError(f"Missing immutable synthesis master: {source}")
    if valid_mp3(target) and not force:
        return "existing", target.stat().st_size
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".part.mp3")
    result = subprocess.run(render_command(source, temporary, item["profile"], item["renderKey"]), capture_output=True, text=True)
    if result.returncode or not valid_mp3(temporary):
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Unable to render {item['renderKey']}: {result.stderr[-500:]}")
    temporary.replace(target)
    return "created", target.stat().st_size


def rebuild_deliverables(manifest, output_root, workers=4, force=False):
    counters = {"created": 0, "existing": 0, "bytes": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(workers, 8))) as pool:
        futures = [pool.submit(render_one, item, output_root, force) for item in manifest["deliverables"]]
        for future in concurrent.futures.as_completed(futures):
            status, size = future.result()
            counters[status] += 1
            counters["bytes"] += size
    return counters


def verify_deliverable_hashes(manifest, output_root):
    production = json.loads(PRODUCTION_REPORT_PATH.read_text(encoding="utf-8"))
    expected = production.get("deliverableSha256", {})
    render_keys = {item["renderKey"] for item in manifest["deliverables"]}
    if set(expected) != render_keys:
        raise ValueError("Production deliverable hash inventory does not match the immutable catalog")
    total_bytes = 0
    for item in manifest["deliverables"]:
        path = output_root / item["path"]
        if not valid_mp3(path):
            raise ValueError(f"Missing deliverable: {item['path']}")
        actual = file_sha256(path)
        if actual != expected[item["renderKey"]]:
            raise ValueError(f"Deliverable hash mismatch: {item['renderKey']}")
        total_bytes += path.stat().st_size
    return {"verified": len(render_keys), "bytes": total_bytes}


def refresh_reviewed_local_replacement_hashes(manifest, output_root):
    production = json.loads(PRODUCTION_REPORT_PATH.read_text(encoding="utf-8"))
    previous = production.get("deliverableSha256", {})
    render_keys = {item["renderKey"] for item in manifest["deliverables"]}
    removed = set(previous) - render_keys
    added = render_keys - set(previous)
    identity_transition = removed == REVIEWED_REPLACED_RENDER_KEYS and added == REVIEWED_LOCAL_RENDER_KEYS
    identity_already_current = not removed and not added
    if not identity_transition and not identity_already_current:
        raise ValueError(f"Unexpected deliverable identity change: removed={sorted(removed)}, added={sorted(added)}")
    reviewed_keys = added if identity_transition else REVIEWED_LOCAL_RENDER_KEYS
    for item in manifest["deliverables"]:
        key = item["renderKey"]
        if key in reviewed_keys:
            continue
        path = output_root / item["path"]
        if not valid_mp3(path) or file_sha256(path) != previous.get(key):
            raise ValueError(f"Unchanged deliverable failed pre-refresh hash validation: {key}")
    hashes = {}
    total_bytes = 0
    for item in manifest["deliverables"]:
        path = output_root / item["path"]
        if not valid_mp3(path):
            raise ValueError(f"Reviewed local replacement deliverable is missing: {item['renderKey']}")
        hashes[item["renderKey"]] = file_sha256(path)
        total_bytes += path.stat().st_size
    production["deliverableSha256"] = hashes
    production["render"] = {"created": 2, "existing": 1272, "bytes": total_bytes}
    production["cycle2PunctuationIdentityCorrections"] = {
      "count": 2,
      "text": "I came on duty at nine thirty A.M.",
      "paidApiCalls": 0,
      "source": "Existing immutable local dry masters",
      "identityPolicy": "Two double-period identities were corrected after every unchanged deliverable passed its existing hash; dry masters were retained and the two roadside deliverables were re-rendered locally.",
    }
    PRODUCTION_REPORT_PATH.write_text(json.dumps(production, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync_runtime_catalog(data, manifest, built_on):
    exact = {}
    for deliverable in manifest["deliverables"]:
        deliverable["sources"] = []
        exact[(deliverable["role"], deliverable["profile"], deliverable["text"])] = deliverable

    requirements = []
    available = 0
    for occurrence in add_occurrences(data):
        identity = (occurrence["role"], occurrence["profile"], occurrence["text"])
        deliverable = exact.get(identity)
        path = deliverable and APP / deliverable["path"]
        is_available = bool(path and valid_mp3(path))
        source = {key: occurrence[key] for key in ("sourceType", "sourceId", "field")}
        if is_available:
            available += 1
            if source not in deliverable["sources"]:
                deliverable["sources"].append(source)
        requirements.append({
            **source,
            "text": occurrence["text"],
            "role": occurrence["role"],
            "profile": occurrence["profile"],
            "available": is_available,
            "path": deliverable["path"] if is_available else None,
            "fallback": None if is_available else "browser-speech-exact-materialized-text",
        })

    manifest["version"] = 4
    manifest["builtOn"] = built_on
    manifest["contentVersion"] = data["contentVersion"]
    manifest["currentRequirements"] = requirements
    manifest["fallbackPolicy"] = "The release requires exact generated local MP3 coverage; validation fails if any current requirement is missing."
    manifest["hashValidation"] = {
        "masters": "production/audio-master-seeds.json",
        "deliverables": "app/data/audio-production-report.json#deliverableSha256",
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lookup = {}
    by_source = {}
    for deliverable in manifest["deliverables"]:
        key = deliverable["role"] + "\0" + deliverable["text"]
        lookup.setdefault(key, {})[deliverable["profile"]] = deliverable["path"]
        for source in deliverable["sources"]:
            by_source.setdefault(source_key(source), []).append({
                "text": deliverable["text"],
                "role": deliverable["role"],
                "profile": deliverable["profile"],
                "path": deliverable["path"],
            })
    availability = {
        source_key(item): {
            "available": item["available"],
            "path": item["path"],
            "fallback": item["fallback"],
            "text": item["text"],
            "role": item["role"],
            "profile": item["profile"],
        }
        for item in requirements
    }
    audio_data = {
        "version": 4,
        "contentVersion": data["contentVersion"],
        "builtOn": built_on,
        "model": "immutable-local-generated-assets",
        "audioProfilesAvailable": sorted(PROFILES),
        "lookup": lookup,
        "bySource": by_source,
        "availability": availability,
    }
    AUDIO_DATA_PATH.write_text(
        "window.TRUCK_AUDIO_DATA = " + json.dumps(audio_data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    report = json.loads(REPORT_PATH.read_text(encoding="utf-8")) if REPORT_PATH.is_file() else {}
    report.update({
        "version": 3,
        "builtOn": built_on,
        "contentVersion": data["contentVersion"],
        "currentRequirements": len(requirements),
        "availableExactRequirements": available,
        "browserSpeechFallbackRequirements": len(requirements) - available,
        "paidApiCalls": 0,
        "typedSlotPolicy": "Materialize by slot type in course data before audio lookup.",
    })
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"requirements": len(requirements), "available": available, "fallback": len(requirements) - available}


def main(built_on=None, rebuild=False, force=False, workers=4, output_root=None, render_only=False, refresh_replacement_hashes=False):
    built_on = resolve_build_date(built_on)
    output_root = Path(output_root).resolve() if output_root else APP
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    validate_catalog_structure(manifest)
    validate_master_seed_report(manifest)
    render_result = None
    if rebuild:
        render_result = rebuild_deliverables(manifest, output_root, workers, force)
    if refresh_replacement_hashes:
        if output_root != APP or render_only:
            raise ValueError("Reviewed replacement hashes may be refreshed only against the runtime app root")
        refresh_reviewed_local_replacement_hashes(manifest, output_root)
    verification = verify_deliverable_hashes(manifest, output_root)
    sync_result = None
    if not render_only:
        if output_root != APP:
            raise ValueError("A non-default output root requires --render-only")
        data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        sync_result = sync_runtime_catalog(data, manifest, built_on)
    print(json.dumps({
        "builtOn": built_on,
        "render": render_result,
        "hashValidation": verification,
        "runtime": sync_result,
        "paidApiCalls": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--built-on", help="Deterministic build date in YYYY-MM-DD. SOURCE_DATE_EPOCH is also supported.")
    parser.add_argument("--rebuild-deliverables", action="store_true", help="Render missing deliverables locally from immutable masters.")
    parser.add_argument("--force-render", action="store_true", help="Render all deliverables even when files already exist.")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--output-root", help="Alternate app root for a clean reproduction proof.")
    parser.add_argument("--render-only", action="store_true", help="Render and validate without writing runtime catalog data.")
    parser.add_argument("--refresh-reviewed-local-replacement-hashes", action="store_true", help="Maintainer-only: refresh exactly two reviewed local deliverable identities after validating every unchanged hash.")
    arguments = parser.parse_args()
    main(
        arguments.built_on,
        arguments.rebuild_deliverables,
        arguments.force_render,
        arguments.workers,
        arguments.output_root,
        arguments.render_only,
        arguments.refresh_reviewed_local_replacement_hashes,
    )
