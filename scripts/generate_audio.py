import argparse
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
MASTER_AUDIO = EDITION / "production" / "audio-masters"
MANIFEST_PATH = APP / "data" / "audio-manifest.json"
PRODUCTION_REPORT_PATH = APP / "data" / "audio-production-report.json"
AUDIO_DATA_PATH = APP / "data" / "audio-data.js"
API_BASE = "https://api.elevenlabs.io/v1"
MODEL_ID = "eleven_flash_v2_5"
OUTPUT_FORMAT = "mp3_44100_128"
EXPECTED_MASTERS = 1450
EXPECTED_CHARACTERS = 52661
EXPECTED_DELIVERABLES = 1466


def master_audio_path(master):
    return MASTER_AUDIO / master["role"] / f"{master['synthesisKey']}.mp3"


def api_request(path, api_key, method="GET", payload=None, timeout=60):
    headers = {"xi-api-key": api_key}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(API_BASE + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(), dict(response.headers)


def validate_contract(manifest):
    masters = manifest["synthesisMasters"]
    deliverables = manifest["deliverables"]
    characters = sum(item["characters"] for item in masters)
    if len(masters) != EXPECTED_MASTERS or characters != EXPECTED_CHARACTERS:
        raise SystemExit(f"Paid contract changed: {len(masters)} masters, {characters} characters")
    if len(deliverables) != EXPECTED_DELIVERABLES:
        raise SystemExit(f"Deliverable contract changed: {len(deliverables)} files")


def subscription_snapshot(api_key):
    raw, _ = api_request("/user/subscription", api_key)
    data = json.loads(raw)
    used = int(data.get("character_count", 0))
    limit = int(data.get("character_limit", 0))
    return {
        "tier": data.get("tier"),
        "used": used,
        "limit": limit,
        "available": max(0, limit - used),
        "nextResetUnix": data.get("next_character_count_reset_unix"),
    }


def valid_mp3(path):
    return path.is_file() and path.stat().st_size > 1024 and path.read_bytes()[:3] in {b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}


def synthesize_one(master, roles, api_key):
    output = master_audio_path(master)
    if valid_mp3(output):
        return "existing", output.stat().st_size
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "text": master["text"],
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.55,
            "similarity_boost": 0.78,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }
    voice_id = roles[master["role"]]["voiceId"]
    path = f"/text-to-speech/{voice_id}?output_format={OUTPUT_FORMAT}"
    last_error = None
    for attempt in range(5):
        try:
            audio, _ = api_request(path, api_key, method="POST", payload=payload, timeout=90)
            temporary = output.with_suffix(".mp3.part")
            temporary.write_bytes(audio)
            if not valid_mp3(temporary):
                raise RuntimeError(f"Invalid MP3 response, {len(audio)} bytes")
            temporary.replace(output)
            return "created", output.stat().st_size
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, RuntimeError) as error:
            last_error = error
            if isinstance(error, urllib.error.HTTPError) and error.code not in {408, 429, 500, 502, 503, 504}:
                break
            time.sleep(min(2 ** attempt, 16))
    raise RuntimeError(f"Synthesis failed for {master['synthesisKey']}: {last_error}")


def synthesize(manifest, api_key, workers):
    before = subscription_snapshot(api_key)
    masters = manifest["synthesisMasters"]
    pending_characters = sum(item["characters"] for item in masters if not valid_mp3(master_audio_path(item)))
    if before["available"] < pending_characters:
        raise SystemExit(f"Insufficient balance: {before['available']} available, up to {pending_characters} required")
    completed = 0
    created = 0
    existing = 0
    total_bytes = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(synthesize_one, item, manifest["roles"], api_key) for item in masters]
        for future in concurrent.futures.as_completed(futures):
            status, size = future.result()
            completed += 1
            created += status == "created"
            existing += status == "existing"
            total_bytes += size
            if completed % 25 == 0 or completed == len(masters):
                print(f"synthesis {completed}/{len(masters)} created={created} existing={existing}", flush=True)
    after = subscription_snapshot(api_key)
    return {
        "before": before,
        "after": after,
        "pendingCharacters": pending_characters,
        "creditsUsed": after["used"] - before["used"],
        "created": created,
        "existing": existing,
        "bytes": total_bytes,
    }


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
    raise ValueError(f"Unknown profile {profile}")


def render_one(item, masters_by_key):
    source = master_audio_path(masters_by_key[item["synthesisKey"]])
    target = APP / item["path"]
    if not valid_mp3(source):
        raise RuntimeError(f"Missing synthesis master {source}")
    if valid_mp3(target):
        return "existing", target.stat().st_size
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".part.mp3")
    result = subprocess.run(render_command(source, temporary, item["profile"], item["renderKey"]), capture_output=True, text=True)
    if result.returncode != 0 or not valid_mp3(temporary):
        raise RuntimeError(f"Render failed for {item['renderKey']}: {result.stderr[-500:]}")
    temporary.replace(target)
    return "created", target.stat().st_size


def write_audio_data(manifest):
    lookup = {}
    by_source = {}
    for item in manifest["deliverables"]:
        key = item["role"] + "\0" + item["text"]
        lookup.setdefault(key, {})[item["profile"]] = item["path"]
        for source in item["sources"]:
            source_key = "\0".join((source["sourceType"], source["sourceId"], source["field"]))
            by_source.setdefault(source_key, []).append({
                "text": item["text"],
                "role": item["role"],
                "profile": item["profile"],
                "path": item["path"],
            })
    payload = {
        "version": 1,
        "model": MODEL_ID,
        "lookup": lookup,
        "bySource": by_source,
    }
    AUDIO_DATA_PATH.write_text("window.TRUCK_AUDIO_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


def render(manifest, workers):
    masters_by_key = {item["synthesisKey"]: item for item in manifest["synthesisMasters"]}
    completed = 0
    created = 0
    existing = 0
    total_bytes = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(render_one, item, masters_by_key) for item in manifest["deliverables"]]
        for future in concurrent.futures.as_completed(futures):
            status, size = future.result()
            completed += 1
            created += status == "created"
            existing += status == "existing"
            total_bytes += size
            if completed % 50 == 0 or completed == len(manifest["deliverables"]):
                print(f"render {completed}/{len(manifest['deliverables'])} created={created} existing={existing}", flush=True)
    write_audio_data(manifest)
    return {"created": created, "existing": existing, "bytes": total_bytes}


def inventory_hashes(manifest):
    hashes = {}
    for item in manifest["deliverables"]:
        path = APP / item["path"]
        hashes[item["renderKey"]] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthesize", action="store_true")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if not (args.synthesize or args.render or args.all):
        parser.error("choose --synthesize, --render or --all")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    validate_contract(manifest)
    production = {"version": 1, "model": MODEL_ID, "outputFormat": OUTPUT_FORMAT}
    if PRODUCTION_REPORT_PATH.is_file():
        existing_report = json.loads(PRODUCTION_REPORT_PATH.read_text(encoding="utf-8"))
        if existing_report.get("model") == MODEL_ID and existing_report.get("outputFormat") == OUTPUT_FORMAT:
            production.update(existing_report)
    if args.synthesize or args.all:
        api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not api_key:
            raise SystemExit("ELEVENLABS_API_KEY is not set")
        production["synthesis"] = synthesize(manifest, api_key, max(1, min(args.workers, 8)))
    if args.render or args.all:
        production["render"] = render(manifest, max(1, min(args.workers, 8)))
        production["deliverableSha256"] = inventory_hashes(manifest)
    PRODUCTION_REPORT_PATH.write_text(json.dumps(production, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in production.items() if key != "deliverableSha256"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
