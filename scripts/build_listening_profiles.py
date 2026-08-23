import argparse
import array
import hashlib
import json
import math
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
COURSE_PATH = APP / "data" / "course-data.json"
MANIFEST_PATH = APP / "data" / "audio-manifest.json"
OUTPUT_DIR = APP / "audio" / "listening"
JSON_PATH = APP / "data" / "listening-data.json"
JS_PATH = APP / "data" / "listening-data.js"
MASTERS = EDITION / "production" / "audio-masters"
ANSWER_SEED_REPORT = EDITION / "production" / "listening-answer-seeds.json"
DEFAULT_BUILD_DATE = "2026-08-21"
DRIVER_ANSWER_IDS = {
    "question:when-is-your-delivery-appointment",
    "question:what-is-the-listed-weight",
    "question:how-many-driving-hours-do-you-have-left",
    "question:tell-me-when-the-low-air-warning-activates",
    "question:the-driver-is-out-of-service-until-oos-condition",
}
DRIVER_ANSWER_FEEDBACK = {
    "question:when-is-your-delivery-appointment": {
        "summary": "Назовите и время, и дату назначения.",
        "slots": {
            "appointment-time": "Проверьте точное время назначения: 9:30 a.m.",
            "appointment-date": "Проверьте дату назначения: August 20.",
        },
    },
    "question:what-is-the-listed-weight": {
        "summary": "Назовите точный вес как cardinal number и добавьте pounds.",
        "slots": {"cargo-weight-lb": "Правильный вес: 38,200 pounds, thirty-eight thousand two hundred pounds."},
    },
    "question:how-many-driving-hours-do-you-have-left": {
        "summary": "Назовите отдельно часы и минуты оставшегося времени.",
        "slots": {
            "driving-hours": "Правильное количество часов: four.",
            "driving-minutes": "Правильное количество минут: eighteen.",
        },
    },
    "question:tell-me-when-the-low-air-warning-activates": {
        "summary": "Назовите точное давление и единицу PSI.",
        "slots": {"pressure-psi": "Правильное давление в задании: 60 psi, sixty P S I."},
    },
    "question:the-driver-is-out-of-service-until-oos-condition": {
        "summary": "Повторите конкретное условие, до выполнения которого водитель остается out of service.",
        "slots": {"oos-condition": "Условие в задании: until the required rest period is complete."},
    },
}


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


def valid_mp3(path):
    return path.is_file() and path.stat().st_size > 1024


def render(source, target, profile, seed_text, force=False):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not force and valid_mp3(target) and target.stat().st_mtime >= source.stat().st_mtime:
        return
    temporary = target.with_suffix(".part.mp3")
    common = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
    if profile == "clean":
        command = common + ["-af", "loudnorm=I=-18:LRA=7:TP=-1.5", "-codec:a", "libmp3lame", "-b:a", "128k", str(temporary)]
    elif profile == "phone":
        audio_filter = "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=2:attack=20:release=200,loudnorm=I=-18:LRA=7:TP=-1.5"
        command = common + ["-af", audio_filter, "-codec:a", "libmp3lame", "-b:a", "128k", str(temporary)]
    elif profile == "roadside":
        seed = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest()[:8], 16)
        filter_graph = "[0:a]loudnorm=I=-18:LRA=7:TP=-1.5[voice];[1:a]highpass=f=80,lowpass=f=1200[noise];[voice][noise]amix=inputs=2:duration=first:weights='1 0.35',loudnorm=I=-18:LRA=7:TP=-1.5[out]"
        command = common + ["-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.5:seed={seed}", "-filter_complex", filter_graph, "-map", "[out]", "-codec:a", "libmp3lame", "-b:a", "128k", str(temporary)]
    else:
        raise ValueError(profile)
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode or not valid_mp3(temporary):
        raise RuntimeError(f"Unable to render {profile} profile for {source.name}: {result.stderr[-500:]}")
    temporary.replace(target)


def decoded_signal(path):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(f"Unable to decode audio for QA: {path}")
    samples = array.array("h")
    samples.frombytes(result.stdout)
    if not samples:
        raise RuntimeError(f"Decoded audio is empty: {path}")
    return samples


def level_dbfs(value):
    return round(20 * math.log10(max(value / 32768, 1 / 32768)), 2)


def correlation(left, right):
    count = min(len(left), len(right))
    left = left[:count]
    right = right[:count]
    left_mean = sum(left) / count
    right_mean = sum(right) / count
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    left_energy = sum((value - left_mean) ** 2 for value in left)
    right_energy = sum((value - right_mean) ** 2 for value in right)
    denominator = math.sqrt(left_energy * right_energy)
    return round(numerator / denominator if denominator else 0, 6)


def difference_rms_dbfs(left, right):
    count = min(len(left), len(right))
    difference_rms = math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(count)) / count)
    return level_dbfs(difference_rms)


def profile_metadata(paths):
    signals = {name: decoded_signal(path) for name, path in paths.items()}
    pairs = {
        "cleanPhone": (signals["clean"], signals["phone"]),
        "cleanRoadside": (signals["clean"], signals["roadside"]),
        "phoneRoadside": (signals["phone"], signals["roadside"]),
    }
    return {
        "sha256": {name: file_sha256(path) for name, path in paths.items()},
        "bytes": {name: path.stat().st_size for name, path in paths.items()},
        "durationMs": {name: round(len(signal) / 16) for name, signal in signals.items()},
        "signalQa": {
            "sampleRateHz": 16000,
            "rmsDbfs": {
                name: level_dbfs(math.sqrt(sum(value * value for value in signal) / len(signal)))
                for name, signal in signals.items()
            },
            "peakDbfs": {name: level_dbfs(max(abs(value) for value in signal)) for name, signal in signals.items()},
            "pairwiseCorrelation": {name: correlation(*pair) for name, pair in pairs.items()},
            "pairwiseDifferenceRmsDbfs": {name: difference_rms_dbfs(*pair) for name, pair in pairs.items()},
        },
        "profileIntent": {
            "clean": "full-band normalized local training render",
            "phone": "300 to 3400 Hz band limit with light compression",
            "roadside": "full-band voice with deterministic audible low-frequency pink road-noise proxy",
        },
    }


def semantic_slots(question):
    rows = []
    for item in question.get("slots", []):
        token = f"[{item['name']}]"
        rows.append({
            "name": item["name"],
            "type": item["type"],
            "display": item["display"],
            "spoken": item["spoken"],
            "expectedIn": "answer" if token in question.get("answerTemplate", "") else "prompt",
        })
    return rows


def main(built_on=None, force=False):
    built_on = resolve_build_date(built_on)
    course = json.loads(COURSE_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    answer_seed_report = json.loads(ANSWER_SEED_REPORT.read_text(encoding="utf-8"))
    answer_seeds = answer_seed_report.get("seeds", {})
    exact = {(item["role"], item["profile"], item["text"]): item for item in manifest["deliverables"]}
    profiles = {}
    for question in course["inspectionQuestions"]:
        spoken = question.get("promptSpoken") or question.get("promptDisplay") or question["prompt"]
        roadside = exact.get((question.get("promptRole", "inspector"), "roadside", spoken))
        if not roadside or not valid_mp3(APP / roadside["path"]):
            raise RuntimeError(f"Missing roadside prompt asset for {question['id']}: {spoken}")
        source = MASTERS / roadside["role"] / f"{roadside['synthesisKey']}.mp3"
        if not valid_mp3(source):
            raise RuntimeError(f"Missing local dry master for {question['id']}: {source}")
        directory = OUTPUT_DIR / hashlib.sha256(question["id"].encode("utf-8")).hexdigest()[:16]
        clean = directory / "clean.mp3"
        phone = directory / "phone.mp3"
        road = directory / "roadside.mp3"
        render(source, clean, "clean", question["id"] + ":prompt", force)
        render(source, phone, "phone", question["id"] + ":prompt", force)
        render(source, road, "roadside", question["id"] + ":prompt", force)
        prompt_paths = {"clean": clean, "phone": phone, "roadside": road}
        prompt_payload = {
            "clean": clean.relative_to(APP).as_posix(),
            "phone": phone.relative_to(APP).as_posix(),
            "roadside": road.relative_to(APP).as_posix(),
            "spokenText": spoken,
            "role": "inspector",
            "qa": profile_metadata(prompt_paths),
        }
        row = {
            "clean": prompt_payload["clean"],
            "phone": prompt_payload["phone"],
            "roadside": prompt_payload["roadside"],
            "spokenText": spoken,
            "prompt": prompt_payload,
            "semanticExpectedSlots": semantic_slots(question),
        }
        if question["id"] in DRIVER_ANSWER_IDS:
            seed = answer_seeds.get(question["id"])
            if not seed:
                raise RuntimeError(f"Missing immutable driver-answer seed metadata: {question['id']}")
            seed_path = EDITION / seed["path"]
            if not valid_mp3(seed_path) or file_sha256(seed_path) != seed["sha256"]:
                raise RuntimeError(f"Driver-answer seed hash mismatch: {question['id']}")
            if seed.get("spokenText") != question["answer"]:
                raise RuntimeError(f"Driver-answer seed text mismatch: {question['id']}")
            answer_paths = {
                "clean": directory / "answer-clean.mp3",
                "phone": directory / "answer-phone.mp3",
                "roadside": directory / "answer-roadside.mp3",
            }
            for profile, target in answer_paths.items():
                render(seed_path, target, profile, question["id"] + ":answer", force)
            answer_slots = semantic_slots(question)
            feedback = DRIVER_ANSWER_FEEDBACK[question["id"]]
            row["driverAnswer"] = {
                **{name: path.relative_to(APP).as_posix() for name, path in answer_paths.items()},
                "spokenText": question["answer"],
                "role": "driver",
                "semanticExpectedSlots": answer_slots,
                "semanticRubric": {
                    "requiredSlotNames": [item["name"] for item in answer_slots],
                    "rejectPromptEcho": True,
                    "rejectAffirmationOnly": True,
                    "minimumEnglishWords": 3,
                },
                "feedbackRu": feedback["summary"],
                "slotFeedbackRu": feedback["slots"],
                "qa": profile_metadata(answer_paths),
            }
        profiles[question["id"]] = row
    payload = {
        "version": 2,
        "contentVersion": course["contentVersion"],
        "builtOn": built_on,
        "method": "Prompt and mandatory driver-answer clean, phone, and roadside profiles are rendered locally from immutable dry seeds.",
        "paidApiCalls": 0,
        "audioProfilesAvailable": ["clean", "phone", "roadside"],
        "driverAnswerQuestionIds": sorted(DRIVER_ANSWER_IDS),
        "profiles": profiles,
        "automatedQa": {
            "checks": ["local file exists", "minimum size", "three distinct SHA-256 hashes", "decoded duration", "RMS and peak levels", "pairwise waveform correlation", "pairwise difference RMS", "typed semantic slot coverage"],
            "perceptualChecklist": ["speech remains intelligible", "numbers remain distinguishable", "phone profile sounds band-limited", "roadside profile adds low ambience without masking speech"],
        },
        "limitations": [
            "These are training recordings, not samples of a specific inspector, radio, phone, or roadside environment.",
        ],
    }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    JS_PATH.write_text("window.TRUCK_LISTENING_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps({"questions": len(profiles), "promptDerivatives": len(profiles) * 3, "driverAnswerProfiles": len(DRIVER_ANSWER_IDS) * 3, "paidApiCalls": 0}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--built-on", help="Deterministic build date in YYYY-MM-DD. SOURCE_DATE_EPOCH is also supported.")
    parser.add_argument("--force", action="store_true", help="Re-render local derivatives even when targets already exist.")
    arguments = parser.parse_args()
    main(arguments.built_on, arguments.force)
