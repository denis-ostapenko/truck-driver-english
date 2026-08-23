import concurrent.futures
import hashlib
import json
import re
import subprocess
from collections import Counter
from datetime import date
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
CATALOG_PATH = EDITION / "production" / "audio-catalog-seed.json"
REPORT_PATH = APP / "data" / "audio-qa-report.json"
BASE_MASTERS = 1261
BASE_DELIVERABLES = 1274


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inspect_audio(path):
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,channels,duration",
            "-of", "json", str(path),
        ],
        capture_output=True,
        text=True,
    )
    if probe.returncode:
        raise RuntimeError(f"ffprobe failed for {path}: {probe.stderr[-300:]}")
    streams = json.loads(probe.stdout).get("streams", [])
    if len(streams) != 1:
        raise RuntimeError(f"Expected one audio stream: {path}")
    stream = streams[0]
    decode = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    if decode.returncode:
        raise RuntimeError(f"Decode failed for {path}: {decode.stderr[-300:]}")
    mean_match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", decode.stderr)
    max_match = re.search(r"max_volume:\s*(-?[0-9.]+) dB", decode.stderr)
    if not mean_match or not max_match:
        raise RuntimeError(f"Volume analysis failed for {path}")
    return {
        "codec": stream.get("codec_name"),
        "sampleRateHz": int(stream.get("sample_rate", 0)),
        "channels": int(stream.get("channels", 0)),
        "durationSeconds": round(float(stream.get("duration", 0)), 3),
        "meanDb": float(mean_match.group(1)),
        "maxDb": float(max_match.group(1)),
        "bytes": path.stat().st_size,
        "sha256": file_sha256(path),
    }


def main():
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    new_masters = catalog["synthesisMasters"][BASE_MASTERS:]
    new_deliverables = catalog["deliverables"][BASE_DELIVERABLES:]
    targets = []
    for item in new_masters:
        targets.append(("master", item, EDITION / item["stagingPath"]))
    for item in new_deliverables:
        targets.append(("deliverable", item, APP / item["path"]))

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(inspect_audio, path): (kind, item, path)
            for kind, item, path in targets
        }
        for future in concurrent.futures.as_completed(futures):
            kind, item, path = futures[future]
            row = future.result()
            row.update({
                "kind": kind,
                "key": item["synthesisKey"] if kind == "master" else item["renderKey"],
                "profile": item.get("profile", "dry-master"),
                "path": path.relative_to(EDITION).as_posix(),
            })
            results.append(row)

    issues = []
    for row in results:
        if row["codec"] != "mp3":
            issues.append(f"codec:{row['key']}")
        expected_sample_rate = 44100 if row["kind"] == "master" else 48000
        if row["sampleRateHz"] != expected_sample_rate or row["channels"] != 1:
            issues.append(f"format:{row['key']}")
        if not 0.25 <= row["durationSeconds"] <= 90:
            issues.append(f"duration:{row['key']}")
        if row["bytes"] <= 1024:
            issues.append(f"size:{row['key']}")
        if row["kind"] == "deliverable" and not -40 <= row["meanDb"] <= -8:
            issues.append(f"mean-level:{row['key']}")
        if row["kind"] == "deliverable" and not -6 <= row["maxDb"] <= 0:
            issues.append(f"peak-level:{row['key']}")

    deliverable_rows = [row for row in results if row["kind"] == "deliverable"]
    report = {
        "version": 1,
        "builtOn": date.today().isoformat(),
        "scope": "Cycle 3 generated audio expansion only; immutable prior catalog remains hash-verified separately.",
        "mastersChecked": len(new_masters),
        "deliverablesChecked": len(new_deliverables),
        "deliverablesByProfile": dict(sorted(Counter(item["profile"] for item in new_deliverables).items())),
        "technicalContract": {
            "codec": "mp3",
            "masterSampleRateHz": 44100,
            "deliverableSampleRateHz": 48000,
            "channels": 1,
            "minimumBytes": 1024,
            "durationSeconds": [0.25, 90],
            "deliverableMeanDb": [-40, -8],
            "deliverableMaxDb": [-6, 0],
        },
        "observed": {
            "durationSeconds": [min(row["durationSeconds"] for row in results), max(row["durationSeconds"] for row in results)],
            "deliverableMeanDb": [min(row["meanDb"] for row in deliverable_rows), max(row["meanDb"] for row in deliverable_rows)],
            "deliverableMaxDb": [min(row["maxDb"] for row in deliverable_rows), max(row["maxDb"] for row in deliverable_rows)],
            "totalBytes": sum(row["bytes"] for row in results),
        },
        "inventorySha256": hashlib.sha256(
            "\n".join(sorted(f"{row['kind']}\0{row['key']}\0{row['sha256']}" for row in results)).encode("utf-8")
        ).hexdigest(),
        "issues": issues,
        "status": "passed" if not issues else "failed",
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if issues:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
