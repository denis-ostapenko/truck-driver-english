import hashlib
import json
import re
from collections import Counter
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
DATA_DIR = APP / "data"
PROFILES = {"tractor", "hotshot-open", "hotshot-enclosed"}
COLLECTIONS = {
    "core": 700,
    "truck": 400,
    "hotshot": 100,
    "inspectionQuestions": 75,
    "situations": 40,
    "signs": 80,
    "documents": 24,
    "lessons": 21,
}
DRIVER_ANSWER_LISTENING_LEGACY_IDS = {"question-15", "question-37", "question-42", "question-64", "question-71"}
BUCKET_TO_COLLECTION = {
    "words": ("core", "truck", "hotshot"),
    "questions": ("inspectionQuestions",),
    "situations": ("situations",),
    "signs": ("signs",),
    "documents": ("documents",),
    "lessons": ("lessons",),
}
FIXED_SIGN_LEGENDS = {
    "sign-23": ("R12-2", "AXLE WEIGHT LIMIT 5 TONS", "assets/signs/R12-02.svg"),
    "sign-27": ("W7-2bP", "TRUCKS USE LOWER GEAR", "assets/signs/W07-02bP.svg"),
    "sign-30": ("W8-6", "TRUCK CROSSING", "assets/signs/W08-06.svg"),
    "sign-34": ("W8-21", "GUSTY WINDS AREA", "assets/signs/W08-21.svg"),
    "sign-35": ("W8-14", "FALLEN ROCKS", "assets/signs/W08-14.svg"),
    "sign-52": ("R2-6aP", "FINES DOUBLE", "assets/signs/R02-06aP.svg"),
    "sign-54": ("W21-5bR", "RIGHT SHOULDER CLOSED AHEAD", "assets/signs/W21-05bR.svg"),
    "sign-55": ("D8-1a", "WEIGH STATION AHEAD", "assets/signs/D08-01a.svg"),
    "sign-62": ("R7-1", "NO PARKING ANY TIME", "assets/signs/R07-01.svg"),
    "sign-63": ("D5-1", "REST AREA 2 MILES", "assets/signs/D05-01.svg"),
    "sign-64": ("D9-17P", "NEXT SERVICES 23 MILES", "assets/signs/D09-17P.svg"),
}
SLOT_TYPES = {
    "location",
    "organization",
    "time",
    "date",
    "equipment-identifier",
    "identifier-digits",
    "cargo-description",
    "credential-endorsement",
    "credential-code",
    "document-identifier",
    "weight-cardinal",
    "duration-hours",
    "duration-minutes",
    "statement",
    "pressure",
    "defect-description",
    "securement-method",
    "oos-condition",
    "duty-status",
}
OWNED_DOCS = [
    "00_START_HERE.md",
    "USER_GUIDE_RU.md",
    "app/README.md",
    "07_INSPECTIONS_AND_OFFICIAL_QUESTIONS.md",
    "11_VISUAL_BIBLE_BATCH_1.md",
    "12_AUDIO_PRODUCTION.md",
    "14_BATCH_2_PRODUCT_SYSTEM.md",
    "15_BATCH_3_MODERNIZATION.md",
    "16_BATCH_4_FINAL_PRODUCT.md",
    "17_CYCLE_1_REMEDIATION.md",
]


class Validation:
    def __init__(self):
        self.issues = []

    def check(self, condition, message):
        if not condition:
            self.issues.append(message)

    def finish(self):
        if self.issues:
            details = "\n".join(f"- {message}" for message in self.issues)
            raise SystemExit(f"validation failed ({len(self.issues)} issues):\n{details}")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_window_json(path, prefix):
    source = path.read_text(encoding="utf-8")
    if not source.startswith(prefix) or not source.endswith(";\n"):
        raise ValueError(f"Invalid JavaScript data wrapper: {path}")
    return json.loads(source[len(prefix):-2])


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def check_signal_qa(validation, qa, label):
    signal = qa.get("signalQa", {})
    profiles = {"clean", "phone", "roadside"}
    pairs = {"cleanPhone", "cleanRoadside", "phoneRoadside"}
    validation.check(signal.get("sampleRateHz") == 16000, f"Listening QA sample rate mismatch: {label}")
    rms = signal.get("rmsDbfs", {})
    peak = signal.get("peakDbfs", {})
    correlations = signal.get("pairwiseCorrelation", {})
    differences = signal.get("pairwiseDifferenceRmsDbfs", {})
    validation.check(set(rms) == profiles and all(isinstance(value, (int, float)) and -30 < value < -10 for value in rms.values()), f"Listening QA RMS out of range: {label}")
    validation.check(set(peak) == profiles and all(isinstance(value, (int, float)) and -20 < value <= 0 for value in peak.values()), f"Listening QA peak out of range: {label}")
    validation.check(set(correlations) == pairs and all(isinstance(value, (int, float)) and abs(value) < 0.997 for value in correlations.values()), f"Listening profiles lack acoustic separation: {label}")
    validation.check(set(differences) == pairs and all(isinstance(value, (int, float)) and value > -45 for value in differences.values()), f"Listening profile difference is below threshold: {label}")


def materialize(template, slots, spoken=False):
    result = template
    field = "spoken" if spoken else "display"
    for slot in slots:
        result = result.replace(f"[{slot.get('name', '')}]", str(slot.get(field, "")))
    return result


def records_by_legacy(records):
    return {item.get("legacyId"): item for item in records}


def check_required_files(validation):
    required = [
        APP / "index.html",
        APP / "styles.css",
        APP / "app.js",
        APP / "app-core.js",
        APP / "state-store.js",
        APP / "recorder-controller.js",
        APP / "server.py",
        APP / "manifest.webmanifest",
        APP / "sw.js",
        APP / "assets" / "icon.svg",
        DATA_DIR / "course-data.json",
        DATA_DIR / "course-data.js",
        DATA_DIR / "content-id-migrations.json",
        DATA_DIR / "visual-assets.json",
        DATA_DIR / "audio-manifest.json",
        DATA_DIR / "audio-data.js",
        DATA_DIR / "audio-production-report.json",
        DATA_DIR / "audio-qa-report.json",
        DATA_DIR / "listening-data.json",
        DATA_DIR / "listening-data.js",
        DATA_DIR / "build-report.json",
        EDITION / "production" / "audio-catalog-seed.json",
        EDITION / "production" / "audio-master-seeds.json",
        EDITION / "production" / "listening-answer-seeds.json",
    ] + [EDITION / path for path in OWNED_DOCS]
    for path in required:
        validation.check(path.is_file(), f"Missing required file: {path.relative_to(EDITION)}")


def check_course_contract(validation, data):
    validation.check(data.get("contentVersion") == 2, "Course contentVersion must be 2")
    validation.check(data.get("corpusLabel") == "Representative training prompts", "Incorrect corpusLabel")
    expected_stats = {
        "generalCore": 700,
        "truckTrack": 400,
        "hotshotTrack": 100,
        "inspectionQuestions": 75,
        "situations": 40,
        "signs": 80,
        "officialSignSvgs": 49,
        "variableLocalSigns": 15,
        "trainingDms": 16,
        "documents": 24,
        "lessons": 21,
        "legacyIdMigrations": 640,
        "professionalUnits": 500,
    }
    for collection, expected in COLLECTIONS.items():
        validation.check(len(data.get(collection, [])) == expected, f"{collection}: expected {expected}")
    for key, expected in expected_stats.items():
        validation.check(data.get("stats", {}).get(key) == expected, f"stats.{key}: expected {expected}")

    profile_rows = data.get("applicabilityProfiles", [])
    validation.check({row.get("id") for row in profile_rows} == PROFILES, "Applicability profile matrix is incomplete")

    all_ids = []
    expected_prefixes = {
        "core": "c:",
        "truck": "t:",
        "hotshot": "h:",
        "inspectionQuestions": "question:",
        "situations": "situation:",
        "signs": "sign:",
        "documents": "document:",
        "lessons": "lesson:",
    }
    positional_patterns = [
        re.compile(r"^(question|situation|sign|doc|lesson)-\d+$"),
        re.compile(r"^t:.*:\d+$"),
    ]
    for collection in COLLECTIONS:
        records = data.get(collection, [])
        ids = [item.get("id") for item in records]
        validation.check(len(ids) == len(set(ids)), f"Duplicate ids in {collection}")
        all_ids.extend(ids)
        for item in records:
            item_id = item.get("id", "")
            validation.check(item_id.startswith(expected_prefixes[collection]), f"Non-semantic id in {collection}: {item_id}")
            validation.check(not any(pattern.fullmatch(item_id) for pattern in positional_patterns), f"Positional current id: {item_id}")
            profiles = item.get("profiles")
            validation.check(isinstance(profiles, list) and bool(profiles), f"Missing profiles: {item_id}")
            if isinstance(profiles, list):
                validation.check(set(profiles).issubset(PROFILES), f"Unknown profile on {item_id}")
                validation.check(len(profiles) == len(set(profiles)), f"Duplicate profile on {item_id}")
            conditions = item.get("conditions")
            equipment = item.get("equipment")
            validation.check(isinstance(equipment, list), f"Missing equipment list: {item_id}")
            if isinstance(equipment, list):
                validation.check(len(equipment) == len(set(equipment)), f"Duplicate equipment on {item_id}")
                validation.check(set(equipment) <= {"tractor-trailer", "hotshot", "pickup", "gooseneck", "open-trailer", "enclosed-trailer", "air-brakes", "dry-van", "load-bars"}, f"Unknown equipment on {item_id}")
            validation.check(isinstance(conditions, list), f"Missing conditions list: {item_id}")
            if isinstance(conditions, list):
                validation.check(all(isinstance(value, str) and value for value in conditions), f"Bad condition on {item_id}")
                validation.check(len(conditions) == len(set(conditions)), f"Duplicate condition on {item_id}")
    validation.check(len(all_ids) == len(set(all_ids)), "Current ids collide across collections")
    inventory = data.get("applicabilityInventory", {})
    inventory_sources = {
        "words": data["core"] + data["truck"] + data["hotshot"],
        "questions": data["inspectionQuestions"], "situations": data["situations"],
        "signs": data["signs"], "documents": data["documents"], "lessons": data["lessons"],
        "regulatoryScoredQuestions": data.get("regulatoryScoredQuestions", []),
    }
    validation.check(set(inventory) == set(inventory_sources), "Applicability inventory collections are incomplete")
    for collection, records in inventory_sources.items():
        rows = inventory.get(collection, {})
        validation.check(set(rows) == {item["id"] for item in records}, f"Applicability inventory ids differ: {collection}")
        for item in records:
            validation.check(rows.get(item["id"]) == {"profiles": item["profiles"], "equipment": item["equipment"], "conditions": item["conditions"]}, f"Applicability inventory metadata differs: {item['id']}")
            curriculum = item.get("curriculum", {})
            validation.check(isinstance(curriculum.get("sequence"), int) and curriculum.get("phase") in {"foundation", "controlled-interleaving", "advanced-after-foundation"}, f"Curriculum metadata missing: {item['id']}")


def check_units(validation, data):
    units = data["core"] + data["truck"] + data["hotshot"]
    professional_units = data["truck"] + data["hotshot"]
    for item in units:
        item_id = item.get("id")
        for field in ("word", "translation", "pronRu", "example", "theme", "wordRole", "exampleRole"):
            validation.check(isinstance(item.get(field), str) and bool(item[field].strip()), f"Empty {field}: {item_id}")
        if item.get("kind") == "training-prompt":
            expected_roles = ("inspector", "driver")
        elif item.get("kind") == "training-answer":
            expected_roles = ("driver", "inspector")
        else:
            expected_roles = ("driver", "driver")
        validation.check((item.get("wordRole"), item.get("exampleRole")) == expected_roles, f"Unexpected voice roles: {item_id}")

    metadata_labels = {
        "terminology",
        "representative-inspection-bank",
        "extra-phrase",
        "sign-bank",
        "required-phrase",
        "document-pack",
        "hotshot-module",
    }
    for item in data["truck"] + data["hotshot"]:
        item_id = item["id"]
        translation = str(item.get("translationRu") or item.get("translation") or "").strip()
        validation.check(bool(re.search(r"[А-Яа-яЁё]", translation)), f"Translation is not useful Russian: {item_id}")
        validation.check(translation.casefold() not in metadata_labels, f"Metadata used as translation: {item_id}")
        validation.check(item.get("pronRu", "").strip().casefold() != item.get("word", "").strip().casefold(), f"Missing pronunciation adaptation: {item_id}")
        validation.check(item.get("word", "").strip().casefold().strip(".") != item.get("example", "").strip().casefold().strip("."), f"Professional example repeats target: {item_id}")
        for slot in item.get("slots", []):
            validation.check(slot.get("type") in SLOT_TYPES, f"Unknown unit slot type on {item_id}")
            validation.check(bool(slot.get("display")) and bool(slot.get("spoken")), f"Incomplete unit slot on {item_id}")
        if item.get("slots"):
            template = item.get("wordTemplate", "")
            display = materialize(template, item["slots"])
            spoken = materialize(template, item["slots"], spoken=True)
            validation.check(display == item.get("wordDisplay"), f"Unit display materialization mismatch: {item_id}")
            validation.check(spoken == item.get("word"), f"Unit spoken materialization mismatch: {item_id}")
            validation.check(not re.search(r"\[[^]]+\]", display), f"Unresolved unit slot: {item_id}")

    report = load_json(DATA_DIR / "build-report.json")
    expected_selection = {
        "terminology": 120,
        "requiredPhrases": 30,
        "representativePromptAndAnswerUnits": 144,
        "documentPhrases": 20,
        "professionalPriorityPhrases": 44,
        "signActions": 42,
    }
    validation.check(report.get("truckSelection") == expected_selection, "Truck selection quotas changed")
    validation.check(sum(expected_selection.values()) == 400, "Truck selection quotas do not total 400")
    professional = data.get("professionalUnits", {})
    validation.check(len(professional_units) == professional.get("count") == 500, "Professional unit count or label metadata changed")
    validation.check(professional.get("label") == "500 professional units", "Professional corpus must be labeled as units, not unique terms")
    validation.check("not necessarily a unique surface term" in professional.get("unitPolicy", ""), "Professional unit policy is missing")
    normalized_surfaces = [re.sub(r"[^a-z0-9]+", " ", item["word"].casefold()).strip() for item in professional_units]
    validation.check(len(normalized_surfaces) == len(set(normalized_surfaces)), "Professional units contain an exact normalized surface duplicate")
    resolved = {item.get("specializedId"): item.get("specializedForm") for item in professional.get("resolvedConceptPairs", [])}
    validation.check(resolved.get("h:trailer-axle") == "Hotshot trailer axle", "Trailer axle duplicate policy is unresolved")
    validation.check(resolved.get("h:axle-weight") == "individual axle weight", "Axle weight duplicate policy is unresolved")
    truck_by_id = {item["id"]: item for item in data["truck"]}
    commodity_unit = truck_by_id.get("t:required:i-am-hauling-commodity", {})
    commodity_overlays = commodity_unit.get("profileMaterializations", {})
    validation.check(set(commodity_overlays) == PROFILES, "Required cargo phrase lacks profile materializations")
    validation.check(commodity_overlays.get("tractor", {}).get("word") == "I am hauling packaged food." and commodity_overlays.get("hotshot-open", {}).get("word") == "I am hauling two vehicles." and commodity_overlays.get("hotshot-enclosed", {}).get("word") == "I am hauling a passenger vehicle.", "Required cargo phrase profile answers differ")
    for profile in ("hotshot-open", "hotshot-enclosed"):
        payload = json.dumps(commodity_overlays.get(profile, {}), ensure_ascii=False).casefold()
        validation.check("packaged food" not in payload and "pallet" not in payload, f"Tractor cargo leaked into required Hotshot phrase: {profile}")
    for item_id in (
        "t:term:cargo-securement",
        "t:term:tie-down-strap",
        "t:question:how-is-the-cargo-secured:prompt",
        "t:question:how-is-the-cargo-secured:answer",
        "t:professional:the-cargo-is-secured-and-the-seal-is-intact",
    ):
        validation.check("cargo-securement" in truck_by_id.get(item_id, {}).get("conditions", []), f"Cargo securement unit condition missing: {item_id}")
    validation.check("cargo-securement" not in truck_by_id.get("t:term:cargo-weight", {}).get("conditions", []), "Cargo weight was over-tagged as securement")
    validation.check("cargo-securement" not in truck_by_id.get("t:term:load-bar", {}).get("conditions", []), "Load-bar equipment vocabulary was over-tagged as securement")
    hotshot_by_id = {item["id"]: item for item in data["hotshot"]}
    validation.check(hotshot_by_id.get("h:enclosed-car-trailer", {}).get("profiles") == ["hotshot-enclosed"], "Enclosed car trailer leaked into Hotshot open")
    hotshot_h4 = [item for item in data["hotshot"] if item.get("theme", "").startswith("H4.")]
    validation.check(bool(hotshot_h4) and all("cargo-securement" in item.get("conditions", []) for item in hotshot_h4), "H4 securement units do not require the cargo securement condition")
    for item_id in ("h:e-track", "h:soft-loop", "h:wheel-chock"):
        validation.check("cargo-securement" in hotshot_by_id.get(item_id, {}).get("conditions", []), f"Enclosed securement condition missing: {item_id}")
    validation.check("cargo-securement" not in hotshot_by_id.get("h:rear-ramp-door", {}).get("conditions", []), "Enclosed ramp door was over-tagged as cargo securement")
    pronunciation_review = report.get("pronunciationReview", {})
    validation.check(pronunciation_review.get("professionalUnitsReviewed") == 500, "Pronunciation review does not cover all 500 professional units")
    validation.check("Unknown tokens fail the build" in pronunciation_review.get("fallbackPolicy", ""), "Unknown pronunciation tokens do not fail the build")
    validation.check(pronunciation_review.get("fallbackOccurrencesResolved", 0) >= 49, "Fewer than 49 pronunciation fallback cases were resolved")
    lexicon = load_json(EDITION / "data" / "pronunciation-lexicon.json")
    validation.check(lexicon.get("review", {}).get("professionalUnitsReviewed") == 500, "Pronunciation lexicon review metadata is incomplete")
    expected_pronunciations = {
        "adjust": "эджАст",
        "another": "энАзэр",
        "but": "бат",
        "columbus": "кэлАмбэс",
        "come": "кам",
        "cut": "кат",
        "does": "даз",
        "front": "франт",
        "hundred": "хАндрэд",
        "lug": "лаг",
        "malfunction": "мэлфАнкшэн",
        "number": "нАмбэр",
        "nut": "нат",
        "one": "уан",
        "rub": "раб",
        "truck": "трак",
        "up": "ап",
        "what": "уат",
        "vehicle": "вИэкэл",
        "out-of-service": "аут-эв-сЁрвис",
        "overage": "Оувэридж",
        "heavy-duty": "хЭви-дьюти",
        "over-the-tire": "Оувэр-зэ-тАйэр",
        "driver-side": "дрАйвэр-сайд",
        "e-track": "И-трэк",
    }
    for token, expected in expected_pronunciations.items():
        validation.check(lexicon.get("entries", {}).get(token) == expected, f"Pronunciation correction changed: {token}")
    review = lexicon.get("review", {})
    validation.check(review.get("strutAh1TokenTypesReviewed") == 34 and "AH1" in review.get("strutVowelPolicy", ""), "STRUT AH1 pronunciation audit metadata is incomplete")
    validation.check(len(review.get("spotListenChecklist", [])) >= 10, "Pronunciation spot-listen checklist is incomplete")
    builder_source = (EDITION / "scripts" / "build_app.py").read_text(encoding="utf-8")
    validation.check("_grapheme_pronunciation" not in builder_source, "Unsafe grapheme pronunciation fallback remains")
    validation.check("Unknown pronunciation token" in builder_source, "Unknown pronunciation token fail-fast is missing")
    themes = Counter(item.get("theme", "").casefold() for item in data["truck"])
    for theme in ("dispatch", "dock", "cargo", "scale", "emergency", "delivery"):
        validation.check(themes[theme] >= 4, f"Professional priority theme missing: {theme}")
    validation.check(not re.search(r"\[\s*:\s*400\s*\]", builder_source), "Positional [:400] selection returned")


def check_migrations(validation, data):
    embedded = data.get("idMigrations", {})
    checked_in = load_json(DATA_DIR / "content-id-migrations.json")
    validation.check(embedded == checked_in, "Embedded and checked-in migration maps differ")
    validation.check(embedded.get("sourceContentVersion") == 1, "Migration source version must be 1")
    validation.check(embedded.get("targetContentVersion") == data.get("contentVersion"), "Migration target version mismatch")
    migrations = embedded.get("migrations", {})
    validation.check(embedded.get("count") == 640 == len(migrations), "Migration map must preserve all 640 legacy ids")
    target_ids = {
        bucket: {item["id"] for collection in collections for item in data[collection]}
        for bucket, collections in BUCKET_TO_COLLECTION.items()
    }
    cross_bucket = 0
    for old_id, route in migrations.items():
        validation.check(isinstance(old_id, str) and bool(old_id), "Empty legacy migration id")
        source_bucket = route.get("sourceCollection")
        target_bucket = route.get("targetCollection")
        target_id = route.get("id")
        validation.check(source_bucket in BUCKET_TO_COLLECTION, f"Bad sourceCollection for {old_id}")
        validation.check(target_bucket in BUCKET_TO_COLLECTION, f"Bad targetCollection for {old_id}")
        if target_bucket in target_ids:
            validation.check(target_id in target_ids[target_bucket], f"Migration target missing for {old_id}: {target_id}")
        if source_bucket != target_bucket:
            cross_bucket += 1
    validation.check(cross_bucket == 37, f"Expected 37 cross-bucket migrations, got {cross_bucket}")


def check_questions(validation, data):
    questions = data["inspectionQuestions"]
    expected_legacy = {f"question-{index:02d}" for index in range(1, 76)}
    validation.check({item.get("legacyId") for item in questions} == expected_legacy, "Question legacy id coverage changed")
    for item in questions:
        item_id = item["id"]
        validation.check(item.get("corpus") == "representative-training-prompts", f"Incorrect question corpus: {item_id}")
        validation.check("not an official standardized question" in item.get("sourceLabel", ""), f"Missing question limitation: {item_id}")
        validation.check(item.get("promptRole") == "inspector", f"Wrong prompt role: {item_id}")
        validation.check(item.get("answerRole") == "driver", f"Wrong answer role: {item_id}")
        validation.check(item.get("audioProfilesAvailable") == ["clean", "phone", "roadside"], f"Question audio profile contract is incomplete: {item_id}")
        validation.check(item.get("driverAnswerListeningAvailable") is (item.get("legacyId") in DRIVER_ANSWER_LISTENING_LEGACY_IDS), f"Driver-answer listening flag mismatch: {item_id}")
        for field in ("prompt", "answer", "promptDisplay", "answerDisplay", "promptRu", "answerRu"):
            validation.check(isinstance(item.get(field), str) and bool(item[field].strip()), f"Empty question field {field}: {item_id}")
        validation.check(not re.search(r"\[[^]]+\]", item.get("prompt", "") + item.get("answer", "")), f"Unresolved question value: {item_id}")
        slots = item.get("slots")
        validation.check(isinstance(slots, list), f"Missing typed slots list: {item_id}")
        seen = set()
        for slot in slots or []:
            name = slot.get("name")
            validation.check(isinstance(name, str) and bool(name), f"Unnamed slot: {item_id}")
            validation.check(name not in seen, f"Duplicate slot name on {item_id}: {name}")
            seen.add(name)
            validation.check(slot.get("type") in SLOT_TYPES, f"Unknown slot type on {item_id}: {slot.get('type')}")
            validation.check(bool(slot.get("display")) and bool(slot.get("spoken")), f"Incomplete slot on {item_id}: {name}")
            token = f"[{name}]"
            validation.check(token in item.get("promptTemplate", "") + item.get("answerTemplate", ""), f"Unused typed slot on {item_id}: {name}")
        validation.check(materialize(item.get("promptTemplate", ""), slots or []) == item.get("promptDisplay"), f"Prompt slot materialization mismatch: {item_id}")
        validation.check(materialize(item.get("answerTemplate", ""), slots or []) == item.get("answerDisplay"), f"Answer slot materialization mismatch: {item_id}")
        validation.check(materialize(item.get("promptTemplate", ""), slots or [], spoken=True) == item.get("prompt"), f"Prompt spoken materialization mismatch: {item_id}")
        validation.check(materialize(item.get("answerTemplate", ""), slots or [], spoken=True) == item.get("answer"), f"Answer spoken materialization mismatch: {item_id}")

    question_71 = records_by_legacy(questions).get("question-71", {})
    expected_q71 = "The driver is out of service until the required rest period is complete."
    validation.check(question_71.get("prompt") == expected_q71, "question-71 prompt is not materialized")
    validation.check(question_71.get("answer") == "Understood. I will remain out of service until the required rest period is complete.", "question-71 answer does not carry the OOS condition")
    validation.check(question_71.get("slots", [{}])[0].get("type") == "oos-condition", "question-71 typed slot is missing")
    by_id = {item["id"]: item for item in questions}
    duty_status = by_id.get("question:what-is-your-current-duty-status", {})
    validation.check(duty_status.get("profiles") == ["tractor", "hotshot-open", "hotshot-enclosed"], "ELP duty-status question is not available to every profile")
    validation.check(duty_status.get("conditions") == [], "ELP duty-status question still requires ELD or RODS")
    validation.check(by_id.get("question:how-is-the-cargo-secured", {}).get("conditions") == ["cargo-securement"], "Cargo securement question condition is missing")
    validation.check("cargo-securement" not in by_id.get("question:what-are-you-hauling", {}).get("conditions", []), "Ordinary cargo question was over-tagged as securement")
    for question_id in (
        "question:what-are-you-hauling",
        "question:what-is-your-truck-and-trailer-number",
        "question:where-is-the-periodic-inspection-documentation",
        "question:when-was-the-tractor-last-inspected",
        "question:how-is-the-cargo-secured",
    ):
        materializations = by_id.get(question_id, {}).get("profileMaterializations", {})
        validation.check(set(materializations) == PROFILES, f"Question profile materializations are incomplete: {question_id}")
        for profile, overlay in materializations.items():
            validation.check(all(isinstance(overlay.get(field), str) and bool(overlay[field]) for field in ("promptDisplay", "promptSpoken", "answerDisplay", "answerSpoken")) and isinstance(overlay.get("slots"), list), f"Question atomic profile fields are incomplete: {question_id} {profile}")
    q12_open = by_id.get("question:what-are-you-hauling", {}).get("profileMaterializations", {}).get("hotshot-open", {})
    q12_open_slot = q12_open.get("slots", [{}])[0]
    validation.check(
        q12_open_slot.get("display") == "vehicles"
        and q12_open_slot.get("category") == "transported-vehicles"
        and q12_open_slot.get("countRequired") is False
        and {"cars", "vehicles"} <= set(q12_open_slot.get("accepted", []))
        and q12_open_slot.get("rejectedCategories") == ["packaged-food"],
        "Hotshot open q12 still requires an exact vehicle count or accepts the tractor cargo category",
    )
    q12_open_rubric = q12_open.get("responseRubric", {})
    q12_open_groups = q12_open_rubric.get("requiredGroups", [])
    validation.check(
        q12_open.get("answerDisplay") == "I am hauling vehicles."
        and "two" not in q12_open.get("answerDisplay", "").casefold()
        and q12_open_rubric.get("cargoCategory") == "transported-vehicles"
        and q12_open_rubric.get("countRequired") is False
        and q12_open_rubric.get("rejectCargoCategories") == ["packaged-food"]
        and q12_open_rubric.get("taskRelation") == "cargo-from-expected"
        and q12_open_rubric.get("requiredRatio") == 1
        and any({"hauling", "carrying"} <= set(group) for group in q12_open_groups)
        and any({"vehicles", "cars"} <= set(group) for group in q12_open_groups),
        "Hotshot open q12 cargo-category rubric differs",
    )
    diagnostic_cargo = data.get("diagnosticProfileCargoMaterializations", {})
    diagnostic_profiles = diagnostic_cargo.get("profiles", {})
    validation.check(
        diagnostic_cargo.get("responseTarget") == "commodity-only"
        and diagnostic_cargo.get("visibleTrailerTypeIsContextOnly") is True
        and diagnostic_cargo.get("trailerTypeResponseRequired") is False
        and set(diagnostic_profiles) == {"tractor", "hotshot-open", "hotshot-enclosed"},
        "Diagnostic profile cargo policy is incomplete",
    )
    for profile, payload in diagnostic_profiles.items():
        groups = payload.get("rubric", {}).get("requiredGroups", [])
        group_text = " ".join(value for group in groups for value in group).casefold()
        validation.check(
            payload.get("model")
            and len(payload.get("slots", [])) == 1
            and payload.get("slots", [{}])[0].get("name") == "commodity"
            and payload.get("rubric", {}).get("trailerTypeResponseRequired") is False
            and not any(value in group_text for value in ("trailer", "open", "enclosed")),
            f"Diagnostic cargo response incorrectly requires trailer context: {profile}",
        )
    q16_profiles = by_id.get("question:what-is-your-truck-and-trailer-number", {}).get("profileMaterializations", {})
    for profile in ("hotshot-open", "hotshot-enclosed"):
        payload = json.dumps(q16_profiles.get(profile, {}), ensure_ascii=False)
        validation.check("T-204" not in payload and "tractor" not in payload.casefold() and "P-204" in payload, f"Tractor unit number leaked into Hotshot question 16: {profile}")
    q29_profiles = by_id.get("question:when-was-the-tractor-last-inspected", {}).get("profileMaterializations", {})
    for profile in ("hotshot-open", "hotshot-enclosed"):
        overlay = q29_profiles.get(profile, {})
        validation.check(overlay.get("answerDisplay") == "They were inspected on August 1, 2026." and overlay.get("answerSpoken") == "They were inspected on August first, twenty twenty-six.", f"Question 29 display and spoken date differ: {profile}")


def check_signs(validation, data):
    signs = data["signs"]
    expected_legacy = {f"sign-{index:02d}" for index in range(1, 81)}
    validation.check({item.get("legacyId") for item in signs} == expected_legacy, "Sign legacy id coverage changed")
    provenance = Counter(item.get("provenance") for item in signs)
    validation.check(provenance == Counter({"fhwa-mutcd-shs": 49, "variable-local": 15, "training-dms": 16}), f"Sign provenance counts changed: {dict(provenance)}")
    english_bearing = [item for item in signs if item.get("englishBearing") is True]
    familiarization = [item for item in signs if item.get("englishBearing") is False]
    validation.check(len(english_bearing) == 47 and sum(item.get("isOfficialSvg") is True for item in english_bearing) == 31, "English-bearing Step 2 inventory must contain 31 official SVG and 16 DMS stimuli")
    validation.check(len(familiarization) == 33 and sum(item.get("isOfficialSvg") is True for item in familiarization) == 18, "Symbol and variable familiarization inventory changed")
    validation.check(data.get("elpStepTwoEnglishBearingIds") == [item["id"] for item in english_bearing], "Step 2 readiness ids differ from reviewed English-bearing signs")
    validation.check(data.get("elpStepTwoFamiliarizationOnlyIds") == [item["id"] for item in familiarization], "Step 2 familiarization ids differ")
    blueprint = data.get("elpStepTwoCompletionBlueprint", {})
    validation.check(blueprint.get("requiredScoredAttempts") == 12 and blueprint.get("audioBeforeResultMakesAttemptIneligible") is True and blueprint.get("modelRevealBeforeResultMakesAttemptIneligible") is True, "Step 2 completion blueprint is incomplete")
    official_paths = []
    for item in signs:
        item_id = item["id"]
        display = item.get("display", "")
        validation.check(bool(display) and bool(item.get("assetAlt")), f"Incomplete sign text: {item_id}")
        validation.check(item.get("readinessCredit") == ("elp-step-2-reading" if item.get("englishBearing") else "familiarization-only"), f"Sign readiness label mismatch: {item_id}")
        if item.get("provenance") == "fhwa-mutcd-shs":
            code = item.get("assetCode")
            path_value = item.get("assetPath")
            expected_alt = f"Official MUTCD {code}: {display}"
            validation.check(item.get("isOfficialSvg") is True, f"Official flag missing: {item_id}")
            validation.check(item.get("assetAlt") == expected_alt, f"Official sign alt mismatch: {item_id}")
            validation.check(item.get("sourceUrl") == "https://mutcd.fhwa.dot.gov/kno-shs_2024-release-status/index.htm", f"Official sign source mismatch: {item_id}")
            validation.check(isinstance(path_value, str) and path_value.endswith(".svg"), f"Official sign asset path missing: {item_id}")
            if isinstance(path_value, str):
                path = APP / path_value
                official_paths.append(path_value)
                validation.check(path.is_file() and path.stat().st_size > 1024, f"Official SVG missing or invalid: {path_value}")
                if path.is_file():
                    head = path.read_text(encoding="utf-8", errors="replace")[:512]
                    validation.check("<svg" in head and "<script" not in head.casefold(), f"Unsafe or invalid SVG: {path_value}")
        else:
            validation.check(item.get("isOfficialSvg") is False, f"Training sign marked official: {item_id}")
            validation.check(not item.get("assetPath"), f"Training sign has official-looking asset: {item_id}")
            if item.get("provenance") == "training-dms":
                validation.check(item.get("assetAlt") == f"TRAINING DMS: {display}", f"DMS label mismatch: {item_id}")
            else:
                validation.check(item.get("assetAlt") == f"Training sign card: {display}", f"Variable sign label mismatch: {item_id}")
    validation.check(len(official_paths) == len(set(official_paths)) == 49, "Official SVG paths must be 49 unique files")

    provenance_manifest = load_json(DATA_DIR / "fhwa-sign-provenance.json")
    rows = provenance_manifest.get("files", [])
    validation.check(provenance_manifest.get("fileCount") == len(rows) == 49, "FHWA per-file provenance manifest is incomplete")
    validation.check({row.get("assetPath") for row in rows} == set(official_paths), "FHWA provenance paths differ from the official sign inventory")
    for row in rows:
        path = APP / row.get("assetPath", "")
        validation.check(bool(row.get("release")) and bool(row.get("releaseDate")) and bool(row.get("archiveFile")) and bool(row.get("archiveUrl")) and bool(row.get("archiveEntry")), f"FHWA archive provenance incomplete: {row.get('assetPath')}")
        if path.is_file():
            digest = file_sha256(path)
            validation.check(row.get("upstreamSha256") == row.get("localSha256") == digest and row.get("verified") is True, f"FHWA upstream/local SHA mismatch: {row.get('assetPath')}")

    sign_by_id = {item["id"]: item for item in signs}
    sign_action_units = [item for item in data["truck"] if item.get("kind") == "sign-action"]
    validation.check(len(sign_action_units) == 42, "Expected 42 sign-action units")
    for unit in sign_action_units:
        sign = sign_by_id.get(unit.get("signId"), {})
        validation.check(unit.get("translationRu") == sign.get("actionTranslationRu"), f"Sign action uses the wrong Russian translation: {unit['id']}")
        validation.check(unit.get("translationRu") != sign.get("meaningRu"), f"Sign legend meaning reused as driver action translation: {unit['id']}")

    by_legacy = records_by_legacy(signs)
    for legacy_id, (code, display, asset_path) in FIXED_SIGN_LEGENDS.items():
        item = by_legacy.get(legacy_id, {})
        validation.check((item.get("assetCode"), item.get("display"), item.get("assetPath")) == (code, display, asset_path), f"Fixed sign mismatch: {legacy_id}")
        validation.check(item.get("assetAlt") == f"Official MUTCD {code}: {display}", f"Fixed sign alt mismatch: {legacy_id}")
        validation.check(item.get("audioSourceId") is None, f"Stale studio audio still enabled: {legacy_id}")
        validation.check(item.get("audioFallback") == "browser-speech-exact-text", f"Exact-text audio fallback missing: {legacy_id}")

    signs_readme = (APP / "assets" / "signs" / "README.md").read_text(encoding="utf-8")
    validation.check("These 49 SVG files are unmodified FHWA" in signs_readme, "SVG provenance README is stale")
    validation.check("15 local" in signs_readme and "16 changeable-message" in signs_readme, "Training sign provenance README is incomplete")


def check_situations(validation, data):
    situations = data["situations"]
    validation.check(len(situations) == 40, "Situation practice must contain 40 scenarios")
    audio_lookup = load_window_json(DATA_DIR / "audio-data.js", "window.TRUCK_AUDIO_DATA = ").get("lookup", {})
    critical_prompt_audio_total = 0
    critical_prompt_audio_eligible = 0
    critical_prompt_audio_excluded = 0
    correct_positions = []
    choice_rows = []
    distractor_pairs = set()
    branching = 0
    outcome_stop_words = {
        "a", "an", "and", "are", "at", "be", "been", "both", "by", "each", "every",
        "for", "from", "here", "i", "in", "is", "it", "its", "my", "of", "on", "or",
        "that", "the", "this", "to", "was", "were", "will", "with", "you",
        "complete", "completed", "completion", "confirm", "confirmed", "documented",
        "outcome", "result", "task", "workplace",
    }
    code_switch = re.compile(r"\b(?:pickup|delivery|dock|check-in|mile\s+marker|shipper|roadside\s+service|truck\s+space|tandems)\b", re.IGNORECASE)
    for item in situations:
        item_id = item["id"]
        contract = item.get("practiceContract", {})
        variants = contract.get("variants", [])
        validation.check(len(variants) == 2 and {row.get("id") for row in variants} == {"primary", "transfer"}, f"Situation variants incomplete: {item_id}")
        if len(variants) == 2:
            validation.check(variants[0].get("prompt") != variants[1].get("prompt") or variants[0].get("modelAnswer") != variants[1].get("modelAnswer"), f"Situation transfer variant is unchanged: {item_id}")
            for variant in variants:
                slots = variant.get("slotValues", [])
                expected_slot_count = 2 if item_id in {"situation:elp-interview", "situation:roadside-breakdown"} else 1
                validation.check(len(slots) == expected_slot_count and all(slot.get("name") and slot.get("type") and slot.get("display") and slot.get("spoken") and slot.get("displayRu") and isinstance(slot.get("turnIds"), list) for slot in slots), f"Situation variable value is incomplete: {item_id}")
                for slot in slots:
                    validation.check(slot["display"].casefold() in variant.get("modelAnswer", "").casefold(), f"Situation answer omits the information-gap value: {item_id} {slot.get('name')}")
                validation.check(not re.search(r"\bthe each\b", variant.get("modelAnswer", ""), re.IGNORECASE), f"Malformed transfer grammar remains: {item_id}")
                validation.check(len(variant.get("dialogue", [])) == len(item.get("dialogue", [])), f"Situation variant lacks the full visible dialogue: {item_id}")
                for turn in variant.get("criticalTurns", []):
                    critical_prompt_audio_total += 1
                    prompt_role = turn.get("promptRole")
                    expected_sources = audio_lookup.get(f"{prompt_role}\0{turn.get('prompt', '')}", {})
                    prompt_audio = turn.get("promptAudio", {})
                    validation.check(prompt_audio.get("qualificationPolicy") == "exact-local-file-only", f"Situation prompt audio policy is not local-only: {item_id} {variant.get('id')} {turn.get('id')}")
                    validation.check(prompt_audio.get("sources") == expected_sources, f"Situation prompt audio lookup differs from the exact local manifest: {item_id} {variant.get('id')} {turn.get('id')}")
                    if expected_sources:
                        critical_prompt_audio_eligible += 1
                        validation.check(prompt_audio.get("eligible") is True and prompt_audio.get("exclusionReason") is None, f"File-backed situation prompt was excluded: {item_id} {variant.get('id')} {turn.get('id')}")
                        paths = [APP / value for value in expected_sources.values() if isinstance(value, str)]
                        validation.check(bool(paths) and all(path.is_file() and path.stat().st_size > 1024 for path in paths), f"Situation prompt audio is not file-backed: {item_id} {variant.get('id')} {turn.get('id')}")
                    else:
                        critical_prompt_audio_excluded += 1
                        validation.check(prompt_audio.get("eligible") is False and prompt_audio.get("sources") == {} and prompt_audio.get("exclusionReason") == "no-exact-local-file", f"Unsupported situation prompt lacks an explicit exclusion: {item_id} {variant.get('id')} {turn.get('id')}")
            transfer_text = json.dumps(variants[1].get("dialogue", []), ensure_ascii=False).casefold()
            for primary_slot, transfer_slot in zip(variants[0]["slotValues"], variants[1]["slotValues"]):
                primary_value = primary_slot["display"].casefold()
                transfer_value = transfer_slot["display"].casefold()
                primary_value_ru = primary_slot["displayRu"].casefold()
                transfer_value_ru = transfer_slot["displayRu"].casefold()
                validation.check(primary_slot["name"] == transfer_slot["name"] and primary_value not in transfer_text and transfer_value in transfer_text, f"Situation transfer values collide: {item_id} {primary_slot['name']}")
                validation.check(primary_value_ru not in transfer_text and transfer_value_ru in transfer_text, f"Situation bilingual transfer values collide: {item_id} {primary_slot['name']}")
        typed = contract.get("typedDriverTurn", {})
        rubric = typed.get("semanticRubric", {})
        validation.check(typed.get("required") is True and typed.get("preRevealRequired") is True, f"Situation lacks typed pre-reveal turn: {item_id}")
        validation.check(bool(rubric.get("requiredConceptGroups")) and bool(rubric.get("requiredVariantSlot")), f"Situation semantic success rubric missing: {item_id}")
        validation.check(rubric.get("rejectPromptEcho") is True and rubric.get("rejectAffirmationOnly") is True, f"Situation semantic rejection rules missing: {item_id}")
        validation.check(bool(contract.get("observableSuccessConditionRu")), f"Situation observable success condition missing: {item_id}")
        critical_turns = contract.get("criticalTurns", [])
        validation.check(len(critical_turns) == 2 and all(turn.get("required") is True and turn.get("typedOutcomeRequired") is True for turn in critical_turns), f"Situation must assess both critical driver turns: {item_id}")
        validation.check(all(turn.get("requiredAssertions") and turn.get("semanticRubric", {}).get("rejectContradiction") is True and turn.get("semanticRubric", {}).get("rejectRefusal") is True for turn in critical_turns), f"Situation critical-turn assertion model is incomplete: {item_id}")
        validation.check(all(set(turn.get("variantTurns", {})) == {"primary", "transfer"} for turn in critical_turns), f"Situation critical turns lack variant-specific models: {item_id}")
        semantic_corpus = contract.get("semanticCorpus", [])
        expected_corpus_ids = {f"{variant_id}:turn-{turn_index}" for variant_id in ("primary", "transfer") for turn_index in (1, 2)}
        validation.check(len(semantic_corpus) == 4 and {row.get("id") for row in semantic_corpus} == expected_corpus_ids, f"Situation semantic corpus is incomplete: {item_id}")
        for row in semantic_corpus:
            validation.check(bool(row.get("expected")) and bool(row.get("informationGap")) and row.get("responseRubric", {}).get("requiredRatio") == 1, f"Situation semantic corpus row is incomplete: {item_id} {row.get('id')}")
            validation.check(all(slot.get("turnIds") == [row.get("turnId")] for slot in row.get("typedSlots", [])), f"Situation semantic corpus includes a slot owned by another turn: {item_id} {row.get('id')}")
        completion = contract.get("completionBlueprint", {})
        validation.check(completion.get("requiredCriticalTurnIds") == [turn.get("id") for turn in critical_turns] and completion.get("requireSafeChoice") is True and completion.get("requireTypedWorkplaceOutcome") is True and completion.get("failIfAnyCriticalTurnMissing") is True, f"Situation completion blueprint is incomplete: {item_id}")
        validation.check(set(completion.get("requiredSemanticCorpusIds", [])) == expected_corpus_ids, f"Situation completion corpus ids differ: {item_id}")
        workplace_outcome = contract.get("workplaceOutcome", {})
        outcome_by_variant = workplace_outcome.get("expectedByVariant", {})
        validation.check(workplace_outcome.get("allCriticalTurnsRequired") is True and workplace_outcome.get("required") is True and workplace_outcome.get("typed") is True, f"Situation workplace outcome is incomplete: {item_id}")
        validation.check(bool(workplace_outcome.get("promptEn")) and bool(re.search(r"[А-Яа-яЁё]", workplace_outcome.get("promptRu", ""))) and set(outcome_by_variant) == {"primary", "transfer"}, f"Situation workplace outcome prompt or variant key is incomplete: {item_id}")
        validation.check(workplace_outcome.get("semanticRubric", {}).get("rejectExactCriticalTurnReplay") is True and workplace_outcome.get("semanticRubric", {}).get("rejectContradiction") is True and workplace_outcome.get("semanticRubric", {}).get("rejectRefusal") is True, f"Situation workplace outcome rejection model is incomplete: {item_id}")
        for variant in variants:
            outcome = outcome_by_variant.get(variant.get("id"), {})
            outcome_model = outcome.get("modelAnswer", "")
            outcome_slots = outcome.get("slotValues", [])
            turn_models = [turn.get("modelAnswer", "").strip().casefold() for turn in variant.get("criticalTurns", [])]
            validation.check(bool(outcome_model) and outcome_model.strip().casefold() not in turn_models, f"Situation workplace outcome repeats a critical turn: {item_id} {variant.get('id')}")
            validation.check(outcome.get("canonicalNaturalAnswer") == outcome_model and "this confirms the completed workplace result" not in outcome_model.casefold(), f"Situation workplace outcome contains artificial completion boilerplate: {item_id} {variant.get('id')}")
            validation.check([slot.get("name") for slot in outcome_slots] == [slot.get("name") for slot in variant.get("slotValues", [])] and all(slot.get("requiredInOutcome") is True and str(slot.get("display", "")).casefold() in outcome_model.casefold() for slot in outcome_slots), f"Situation workplace outcome slots differ from the selected variant: {item_id} {variant.get('id')}")
            outcome_rubric = outcome.get("responseRubric", {})
            validation.check(outcome_rubric.get("requiredRatio") == 1 and outcome_rubric.get("rejectExactCriticalTurnReplay") is True and bool(outcome_rubric.get("requiredGroups")) and outcome_rubric.get("requiredSlotNames") == [slot.get("name") for slot in variant.get("slotValues", [])], f"Situation workplace outcome rubric is incomplete: {item_id} {variant.get('id')}")
            semantic_content = outcome.get("semanticContent", [])
            expected_content_tokens = []
            for token in re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)?", outcome.get("baseFactualOutcome", "").casefold()):
                if token not in outcome_stop_words and len(token) >= 2 and token not in expected_content_tokens:
                    expected_content_tokens.append(token)
            validation.check(
                [row.get("canonical") for row in semantic_content] == expected_content_tokens
                and [row.get("accepted") for row in semantic_content] == outcome_rubric.get("requiredGroups"),
                f"Situation workplace outcome rubric does not cover every factual concept: {item_id} {variant.get('id')}",
            )
            validation.check(all(
                bool(row.get("accepted"))
                and (row.get("contextRequired") is True or row.get("accepted", [None])[0] == row.get("canonical"))
                and len(set(row.get("accepted", []))) == len(row.get("accepted", []))
                for row in semantic_content
            ), f"Situation workplace outcome natural-equivalent group is malformed: {item_id} {variant.get('id')}")
            contextual_groups = {row.get("canonical"): row.get("accepted") for row in semantic_content if row.get("contextRequired") is True}
            if item_id == "situation:roadside-stop":
                validation.check(contextual_groups == {"stopped": ["vehicle stopped", "truck pulled over", "unit stationary"]}, f"Roadside stop state is not context-bound: {variant.get('id')}")
            if item_id == "situation:hours-and-eld-inspection":
                validation.check(contextual_groups == {"current": ["current duty status", "current records", "today's duty status"]}, f"Current duty state is not context-bound: {variant.get('id')}")
            banned_outcome_tokens = {"with", "complete", "completed", "completion", "workplace", "result", "outcome"}
            validation.check(not any(banned_outcome_tokens & {str(value).casefold() for value in group} for group in outcome_rubric.get("requiredGroups", [])), f"Situation workplace outcome rubric requires generic filler: {item_id} {variant.get('id')}")
        validation.check(workplace_outcome.get("modelAnswer") == outcome_by_variant.get("primary", {}).get("modelAnswer"), f"Situation primary workplace outcome key differs: {item_id}")
        listening = contract.get("listeningBlueprint", {})
        all_turn_refs = {
            f"{variant.get('id')}:{turn.get('id')}"
            for variant in variants for turn in variant.get("criticalTurns", [])
        }
        eligible_refs = {
            f"{variant.get('id')}:{turn.get('id')}"
            for variant in variants for turn in variant.get("criticalTurns", [])
            if turn.get("promptAudio", {}).get("eligible") is True
        }
        excluded_refs = all_turn_refs - eligible_refs
        validation.check(listening.get("qualificationAudioPolicy") == "exact-local-file-only" and listening.get("webSpeechQualifying") is False and listening.get("excludeUnsupportedFromSelector") is True, f"Situation listening qualification policy is unsafe: {item_id}")
        validation.check(set(listening.get("eligibleTurnRefs", [])) == eligible_refs and set(listening.get("excludedTurnRefs", [])) == excluded_refs and not (eligible_refs & excluded_refs), f"Situation listening selector eligibility differs from the audio manifest: {item_id}")
        validation.check(contract.get("failureBranch", {}).get("result") == "retry-required", f"Situation failure branch missing: {item_id}")
        validation.check(contract.get("transferVariant", {}).get("availableAfter") == "corrected-retrieval", f"Situation transfer gate missing: {item_id}")
        choice = contract.get("choiceCheck", {})
        options = choice.get("options", [])
        option_ids = [option.get("id") for option in options]
        correct_id = choice.get("correctOptionId")
        validation.check(len(options) == 3 and correct_id in option_ids, f"Situation choice contract incomplete: {item_id}")
        validation.check(choice.get("shufflePolicy") == "seeded-per-attempt", f"Situation option randomization policy missing: {item_id}")
        if correct_id in option_ids:
            correct_positions.append(option_ids.index(correct_id))
            correct = options[option_ids.index(correct_id)]
            model_lines = [variant.get("modelAnswer", "").casefold() for variant in variants]
            validation.check(correct.get("result") == "success" and bool(re.search(r"[А-Яа-яЁё]", correct.get("text", ""))) and all(model not in correct.get("text", "").casefold() and correct.get("text", "").casefold() not in model for model in model_lines), f"Situation safety option reveals a driver model: {item_id}")
            wrong = [option for option in options if option.get("id") != correct_id]
            pair = tuple(sorted(option.get("text", "").casefold() for option in wrong))
            distractor_pairs.add(pair)
            validation.check({option.get("distractorType") for option in wrong} == {"unsafe-action", "critical-step-omission"}, f"Situation distractors are not keyed unsafe and near-miss decisions: {item_id}")
            validation.check(all(bool(re.search(r"[А-Яа-яЁё]", option.get("text", ""))) and len(option.get("text", "")) >= 45 for option in wrong), f"Situation distractor is generic or underspecified: {item_id}")
            lengths = [len(option.get("text", "")) for option in options]
            validation.check(min(lengths) > 0 and max(lengths) / min(lengths) <= 2, f"Situation choice lengths are not comparable: {item_id}")
            choice_rows.append((correct_id, options))
        validation.check({option.get("result") for option in options} == {"success", "unsafe-failure", "irrelevant"}, f"Situation distractor meanings incomplete: {item_id}")
        safety = contract.get("safetyDecision", {})
        validation.check(safety.get("randomizeOptions") is True and safety.get("unsafeResult") == "attempt-failed" and safety.get("missingSafetyStepResult") == "attempt-failed" and safety.get("nearMissOptionId") in option_ids, f"Situation unsafe branch is incomplete: {item_id}")
        branching += contract.get("branchingPractice") is True
        goal = item.get("goal", "")
        validation.check(bool(re.search(r"[А-Яа-яЁё]", goal)), f"Situation goal is not edited Russian: {item_id}")
        validation.check(bool(re.search(r"[А-Яа-яЁё]", item.get("titleRu", ""))), f"Situation Russian title missing: {item_id}")
        for line in item.get("dialogue", []):
            validation.check(not code_switch.search(line.get("translation", "")), f"Situation translation contains an operational code switch: {item_id}")
            validation.check(bool(line.get("semanticRole")) and bool(line.get("voicePreset")) and bool(line.get("voiceId")) and bool(line.get("roleLabelRu")), f"Situation semantic role and voice preset are not separated: {item_id}")
    validation.check(set(correct_positions) == {0, 1, 2}, "Situation correct options remain positionally predictable")
    validation.check(len(distractor_pairs) == 40, "Situation distractor pairs are reused")
    distractor_texts = [
        option.get("text", "").casefold()
        for correct_id, options in choice_rows for option in options if option.get("id") != correct_id
    ]
    validation.check(len(distractor_texts) == len(set(distractor_texts)) == 80, "Situation distractor text is reused")
    longest_successes = sum(
        next(option for option in options if option.get("id") == correct_id).get("text")
        == max((option.get("text", "") for option in options), key=len)
        for correct_id, options in choice_rows
    )
    validation.check(longest_successes <= 13, f"Longest-option heuristic beats chance: {longest_successes}/40")
    option_token_sets = [
        {
            token for token in re.findall(r"[а-яё]+", option.get("text", "").casefold())
            if len(token) >= 5
        }
        for _, options in choice_rows for option in options
    ]
    token_frequency = {}
    for token_set in option_token_sets:
        for token in token_set:
            token_frequency[token] = token_frequency.get(token, 0) + 1
    specificity_successes = 0
    for correct_id, options in choice_rows:
        scores = []
        for option in options:
            tokens = {
                token for token in re.findall(r"[а-яё]+", option.get("text", "").casefold())
                if len(token) >= 5
            }
            scores.append((sum(1 / token_frequency[token] for token in tokens), option.get("id")))
        winning_id = max(scores)[1]
        specificity_successes += winning_id == correct_id
    validation.check(specificity_successes <= 13, f"Non-generic-option heuristic beats chance: {specificity_successes}/40")
    validation.check(branching == 40, f"Expected 40 branching situations, got {branching}")
    validation.check(critical_prompt_audio_total == 160, f"Expected 160 situation critical-turn prompt variants, got {critical_prompt_audio_total}")
    validation.check(critical_prompt_audio_eligible + critical_prompt_audio_excluded == 160, "Situation prompt audio eligibility inventory is not exhaustive")

    by_legacy = records_by_legacy(situations)
    elp = next((item for item in situations if item.get("id") == "situation:elp-interview"), {})
    profile_materializations = elp.get("profileMaterializations", {})
    validation.check(set(profile_materializations) == PROFILES, "ELP situation profile materializations are incomplete")
    expected_cargo = {
        "tractor": ({"22 pallets of packaged food", "20 pallets of bottled water"}, "packaged food"),
        "hotshot-open": ({"two vehicles", "three vehicles"}, "vehicles"),
        "hotshot-enclosed": ({"one passenger vehicle", "one SUV"}, "vehicle"),
    }
    for profile, (cargo_values, required_text) in expected_cargo.items():
        materialized = profile_materializations.get(profile, {})
        profile_contract = materialized.get("practiceContract", {})
        profile_variants = profile_contract.get("variants", [])
        cargo_slots = [slot for variant in profile_variants for slot in variant.get("slotValues", []) if slot.get("name") == "commodity"]
        profile_text = json.dumps(materialized, ensure_ascii=False).casefold()
        validation.check(len(profile_variants) == 2 and {slot.get("display") for slot in cargo_slots} == cargo_values and all(slot.get("turnIds") == ["turn-2"] for slot in cargo_slots), f"ELP situation cargo variants differ: {profile}")
        validation.check(required_text.casefold() in profile_text, f"ELP situation cargo dialogue is not profile-specific: {profile}")
        if profile != "tractor":
            validation.check("packaged food" not in profile_text and "pallet" not in profile_text, f"Tractor cargo leaked into Hotshot ELP situation: {profile}")

    breakdown_profile_materializations = by_legacy.get("situation-16", {}).get("profileMaterializations", {})
    validation.check(set(breakdown_profile_materializations) == PROFILES, "Breakdown situation profile materializations are incomplete")
    for profile in ("hotshot-open", "hotshot-enclosed"):
        payload = json.dumps(breakdown_profile_materializations.get(profile, {}), ensure_ascii=False)
        validation.check("T-204" not in payload and "T-318" not in payload and "P-204" in payload and "P-318" in payload, f"Tractor unit number leaked into Hotshot breakdown: {profile}")

    content_text = json.dumps(situations, ensure_ascii=False)
    malformed = (
        "Прицеп готов к погрузки",
        "Yes. I have tanker.",
        "a.m..",
        "Ваш погрузки",
        "погрузки number",
        "погрузочной площадки door",
        "Please print the each axle weight separately.",
    )
    for value in malformed:
        validation.check(value not in content_text, f"Malformed RU or EN situation text remains: {value}")
    validation.check(not re.search(r"\b(?:a|p)\.m\.\.", json.dumps(data, ensure_ascii=False)), "Double time punctuation remains in generated course data")

    validation.check(by_legacy.get("situation-14", {}).get("profiles") == ["tractor"], "Tandem weigh-station situation leaked outside Tractor")
    for legacy_id in ("hotshot-situation-04", "hotshot-situation-08"):
        validation.check("cargo-securement" in by_legacy.get(legacy_id, {}).get("conditions", []), f"Hotshot securement situation condition missing: {legacy_id}")
    validation.check("cargo-securement" not in by_legacy.get("hotshot-situation-07", {}).get("conditions", []), "Enclosed loading situation was over-tagged as cargo securement")
    level_one_transfer = by_legacy.get("situation-08", {}).get("practiceContract", {}).get("variants", [None, {}])[1]
    validation.check(not ("released brakes" in json.dumps(level_one_transfer, ensure_ascii=False).casefold() and "parking brakes" in json.dumps(level_one_transfer, ensure_ascii=False).casefold()), "Situation 8 transfer model contains conflicting brake states")
    delivery_transfer = by_legacy.get("situation-26", {}).get("practiceContract", {}).get("variants", [None, {}])[1]
    delivery_text = json.dumps(delivery_transfer, ensure_ascii=False).casefold()
    validation.check(not ("door 12" in delivery_text and "door 27" in delivery_text), "Situation 26 transfer model contains two dock doors")
    breakdown = by_legacy.get("situation-16", {}).get("practiceContract", {})
    breakdown_assertions = " ".join(value for turn in breakdown.get("criticalTurns", []) for value in turn.get("requiredAssertions", [])).casefold()
    validation.check("hazard warning flashers" in breakdown_assertions and "ten minutes" in breakdown_assertions, "Breakdown scene omits the 392.22 sequence")
    breakdown_variants = {variant.get("id"): json.dumps(variant, ensure_ascii=False).casefold() for variant in breakdown.get("variants", [])}
    validation.check(all(value in breakdown_variants.get("primary", "") for value in ("10", "100", "200", "divided road")), "Breakdown divided-road variant omits the 10, 100 and 200 foot placement")
    validation.check(all(value in breakdown_variants.get("transfer", "") for value in ("100", "500", "blind curve")), "Breakdown hill-or-curve variant omits the 100 to 500 foot placement")
    placement_task = breakdown.get("breakdownPlacementTask", {})
    validation.check(placement_task.get("required") is True and placement_task.get("randomizeScenario") is True and placement_task.get("qualificationRequired") is True and placement_task.get("missingSequenceOrPlacementFails") is True, "Breakdown placement task is not qualification-bearing")
    validation.check({row.get("id") for row in placement_task.get("scenarioVariants", [])} == {"ordinary-road", "divided-or-one-way", "hill-or-curve"} and placement_task.get("currentScenarioByPracticeVariant") == {"primary": "divided-or-one-way", "transfer": "hill-or-curve"}, "Breakdown placement scenarios are incomplete")
    breakdown_turn_rows = {
        row.get("variantId"): row
        for row in breakdown.get("semanticCorpus", [])
        if row.get("turnId") == "turn-2"
    }
    expected_breakdown_branches = {
        "primary": ("divided-or-one-way", [10, 100, 200], "exact-set"),
        "transfer": ("hill-or-curve", [100, 500], "range-endpoints"),
    }
    for variant_id, (branch_id, distances, distance_mode) in expected_breakdown_branches.items():
        row = breakdown_turn_rows.get(variant_id, {})
        rubric = row.get("responseRubric", {})
        branch_policy = rubric.get("branchConflictPolicy", {})
        validation.check(rubric.get("safetyCritical") is True and rubric.get("missingPlacementFails") is True and rubric.get("requiredRatio") == 1, f"Breakdown safety turn rubric is incomplete: {variant_id}")
        validation.check(branch_policy.get("exclusiveBranchId") == branch_id and branch_policy.get("requiredDistanceValuesFeet") == distances and branch_policy.get("distanceMode") == distance_mode and branch_policy.get("rejectUnexpectedDistanceValues") is True and branch_policy.get("requiredBranchCues") and branch_policy.get("forbiddenBranchCues"), f"Breakdown placement branch conflict policy is incomplete: {variant_id}")
        validation.check({slot.get("name") for slot in row.get("typedSlots", [])} == {"warning-deadline", "warning-placement", "road-branch"}, f"Breakdown safety turn slots are incomplete: {variant_id}")

    lessons = records_by_legacy(data["lessons"])
    validation.check("cargo-securement" in lessons.get("hotshot-lesson-03", {}).get("conditions", []), "Hotshot securement lesson condition missing")
    validation.check("cargo-securement" not in lessons.get("hotshot-lesson-05", {}).get("conditions", []), "General enclosed lesson was over-tagged as cargo securement")
    for item in data["lessons"]:
        item_id = item["id"]
        phrases = item.get("phrases", [])
        meanings = item.get("phraseMeaningsRu", [])
        validation.check(bool(re.search(r"[А-Яа-яЁё]", item.get("titleRu", ""))) and len(phrases) == len(meanings) and len(phrases) >= 3, f"Lesson Russian title or phrase meanings missing: {item_id}")
        validation.check(all(bool(re.search(r"[А-Яа-яЁё]", value)) for value in meanings), f"Lesson phrase meaning is not Russian: {item_id}")
        blueprint = item.get("assessmentBlueprint", {})
        phrase_ids = [f"phrase-{index}" for index in range(1, len(phrases) + 1)]
        reception = blueprint.get("reception", {})
        production = blueprint.get("production", {})
        interaction = blueprint.get("interaction", {})
        validation.check(reception.get("requiredPhraseIds") == phrase_ids and reception.get("localAudioExposureRequired") is True and reception.get("answerHiddenDuringAudio") is True and reception.get("meaningKeyByPhraseId") == dict(zip(phrase_ids, meanings)), f"Lesson reception blueprint is incomplete: {item_id}")
        validation.check(production.get("requiredPhraseIds") == phrase_ids and production.get("allPhrasesAssessed") is True and interaction.get("typedWorkplaceOutcomeRequired") is True, f"Lesson production or interaction blueprint is incomplete: {item_id}")
        interaction_ids = interaction.get("requiredResponsePhraseIds", [])
        interaction_rubric = interaction.get("semanticRubric", {})
        validation.check(bool(interaction.get("promptEn")) and bool(re.search(r"[А-Яа-яЁё]", interaction.get("promptRu", ""))) and bool(interaction_ids) and set(interaction_ids) <= set(phrase_ids), f"Lesson interaction prompt or response key is incomplete: {item_id}")
        validation.check(interaction.get("responseKeySource") == "materialized-lesson-phrases" and interaction_rubric.get("goalRu") == item.get("goal") and interaction_rubric.get("evaluateAgainst") == "materialized-required-response-phrases" and interaction_rubric.get("requiredResponseCoverage") == 1 and interaction_rubric.get("rejectContradiction") is True and interaction_rubric.get("rejectRefusal") is True, f"Lesson interaction rubric is not grounded to the stated goal: {item_id}")
        completion = blueprint.get("completion", {})
        construct_contracts = completion.get("constructVariantContracts", {})
        reception_contract = construct_contracts.get("reception-only", {})
        production_contract = construct_contracts.get("production-interaction", {})
        validation.check(completion.get("requiredSpacedConstructVariants") == ["reception-only", "production-interaction"] and completion.get("minimumHoursBetweenConstructs") == 24, f"Lesson spaced construct sequence is incomplete: {item_id}")
        validation.check(completion.get("sameAttemptMayQualifyBothConstructVariants") is False and completion.get("requirementsApplyAcrossSpacedConstructVariants") is True, f"Lesson completion incorrectly permits one-attempt qualification: {item_id}")
        validation.check(reception_contract.get("requiredSubcontracts") == ["reception"] and reception_contract.get("mustBeFirst") is True and reception_contract.get("localAudioRequired") is True and reception_contract.get("priorRussianProductionCueAllowed") is False and reception_contract.get("productionOrInteractionRequired") is False, f"Lesson reception-only contract is incomplete: {item_id}")
        validation.check(production_contract.get("requiredSubcontracts") == ["production", "interaction"] and production_contract.get("requiresPriorVariant") == "reception-only" and production_contract.get("localAudioAllowed") is False and production_contract.get("minimumHoursAfterPriorVariant") == 24, f"Lesson production-interaction contract is incomplete: {item_id}")
        validation.check(completion.get("modelRevealMakesAttemptIneligible") is True, f"Lesson reveal eligibility rule is missing: {item_id}")
        if item.get("profilePhrases"):
            profile_meanings = item.get("profilePhraseMeaningsRu", {})
            validation.check(set(profile_meanings) == set(item["profilePhrases"]), f"Lesson profile meaning keys differ: {item_id}")
            for profile, profile_phrases in item["profilePhrases"].items():
                validation.check(len(profile_phrases) == len(profile_meanings.get(profile, [])), f"Lesson profile phrase meaning count differs: {item_id} {profile}")


def check_documents_and_compliance(validation, data):
    documents = data["documents"]
    validation.check(data.get("version") == 3, "Generated course data contract version must be 3")
    elp_step_one = data.get("elpStepOneIds", [])
    expected_step_one = [
        "question:pull-into-the-inspection-lane",
        "question:what-is-your-truck-and-trailer-number",
        "question:where-are-you-coming-from",
        "question:where-are-you-going",
        "question:what-are-you-hauling",
        "question:who-do-you-drive-for",
        "question:what-is-your-current-duty-status",
    ]
    validation.check(elp_step_one == expected_step_one, "ELP Step 1 must contain the seven reviewed functions in stable order")
    validation.check(set(elp_step_one) <= {item.get("id") for item in data["inspectionQuestions"]}, "ELP Step 1 ids do not resolve")
    step_one_blueprint = data.get("elpStepOneBlueprint", {})
    validation.check(
        step_one_blueprint.get("version") == "seven-functions-v1"
        and step_one_blueprint.get("requiredResponses") == 7
        and [item.get("questionId") for item in step_one_blueprint.get("functions", [])] == expected_step_one
        and step_one_blueprint.get("profileMaterializationRequired") is True
        and step_one_blueprint.get("officialAssessment") is False,
        "ELP Step 1 seven-function completion blueprint is incomplete",
    )

    diagnostic_inventory = data.get("diagnosticItemInventory", [])
    diagnostic_targets = data.get("diagnosticRecoveryTargets", [])
    diagnostic_aliases = data.get("diagnosticRecoveryAliases", {})
    validation.check(data.get("diagnosticFormVersion") == "cycle3-12x4-v1", "Diagnostic form version is missing")
    validation.check(data.get("diagnosticRecoveryContractVersion") == "form-independent-v1", "Diagnostic recovery contract version is missing")
    validation.check(len(diagnostic_inventory) == 40 and len({item.get("id") for item in diagnostic_inventory}) == 40, "Diagnostic inventory must contain 40 unique stimuli")
    diagnostic_counts = Counter((item.get("form"), item.get("category")) for item in diagnostic_inventory)
    for form in ("A", "B"):
        for category in ("vocabulary", "listening", "elp", "inspection"):
            validation.check(diagnostic_counts[(form, category)] == 5, f"Diagnostic inventory must contain five {category} stimuli in form {form}")
    target_categories = {item.get("id"): item.get("category") for item in diagnostic_targets}
    validation.check(len(diagnostic_targets) == len(target_categories) == 31, "Diagnostic recovery contract must contain 31 semantic targets")
    for item in diagnostic_inventory:
        item_id = item.get("id")
        target_id = item.get("recoveryTargetId")
        validation.check(
            bool(re.fullmatch(r"[ab]-[a-z0-9-]+", item_id or ""))
            and item.get("form") == (item_id or "")[:1].upper()
            and bool(re.fullmatch(r"[a-z0-9-]+-v[0-9]+", item.get("stimulusVersion", "")))
            and target_categories.get(target_id) == item.get("category")
            and diagnostic_aliases.get(item_id) == target_id
            and diagnostic_aliases.get(target_id) == target_id,
            f"Diagnostic semantic contract is invalid: {item_id}",
        )
    target_form_pairs = [(item.get("recoveryTargetId"), item.get("form")) for item in diagnostic_inventory]
    validation.check(len(target_form_pairs) == len(set(target_form_pairs)), "Diagnostic recovery target repeats within one form")
    wallet_additions = {item.get("id"): item for item in data.get("documentWalletAdditions", [])}
    pickup_registration = wallet_additions.get("wallet:pickup-registration", {})
    validation.check(pickup_registration.get("profiles") == ["hotshot-open", "hotshot-enclosed"], "Hotshot pickup registration wallet profiles are incomplete")
    validation.check(pickup_registration.get("status") == "carry-or-trip", "Hotshot pickup registration is missing from the ready wallet")
    validation.check(pickup_registration.get("conditions") == ["registration-required"], "Hotshot pickup registration condition is missing")
    samples = sorted((EDITION / "document-samples").glob("[0-9][0-9]_*.md"))
    validation.check(len(samples) == 24, f"Expected 24 document samples, got {len(samples)}")
    for path in samples:
        validation.check("TRAINING SAMPLE, NOT VALID" in path.read_text(encoding="utf-8"), f"Unmarked document sample: {path.name}")
    for item in documents:
        validation.check((EDITION / "document-samples" / item.get("file", "")).is_file(), f"Document sample missing: {item.get('id')}")
        validation.check(item.get("status") in {"carry-or-trip", "trip-specific", "conditional", "training"}, f"Bad document status: {item.get('id')}")
        if item.get("status") == "conditional":
            validation.check(bool(item.get("conditions")), f"Conditional document lacks a condition: {item.get('id')}")
        instances = item.get("trainingInstances", [])
        assessment = item.get("assessmentBlueprint", {})
        validation.check(len(instances) >= 2 and len({row.get("id") for row in instances}) == len(instances), f"Fresh document instances missing: {item.get('id')}")
        validation.check(len({row.get("answerKey") for row in instances}) == len(instances), f"Document assessment keys collide across instances: {item.get('id')}")
        validation.check(all(row.get("watermark") == "TRAINING SAMPLE, NOT VALID" and row.get("visibleStimulus", {}).get("fields") and len(row.get("distractors", [])) >= 3 for row in instances), f"Document instance is not a visible keyed training sample: {item.get('id')}")
        validation.check(assessment.get("construct") == "visible-document-reading" and assessment.get("visibleFullStimulusRequired") is True and assessment.get("differentInstanceForMasteryConfirmation") is True and assessment.get("minimumDistinctInstances") == 2, f"Document reading assessment blueprint is incomplete: {item.get('id')}")
        validation.check(assessment.get("answerKeyByInstanceId") == {row["id"]: row["answerKey"] for row in instances}, f"Document answer keys are not keyed by instance: {item.get('id')}")

    by_legacy = records_by_legacy(documents)
    trailer_registration = by_legacy.get("doc-05", {})
    validation.check(
        trailer_registration.get("profiles") == ["tractor"]
        and set(trailer_registration.get("equipment", [])) == {"tractor-trailer", "dry-van"}
        and trailer_registration.get("conditions") == ["registration-required"],
        "Dry-van trailer registration leaked outside the Tractor profile",
    )
    hazmat = by_legacy.get("doc-17", {})
    hazmat_sample_text = (EDITION / "document-samples" / "17_hazmat_shipping_paper.md").read_text(encoding="utf-8")
    fields = {field.get("label"): field.get("value") for field in hazmat.get("fields", [])}
    validation.check(bool(fields.get("Total quantity")), "Hazmat sample lacks total quantity")
    validation.check(bool(fields.get("Number and type of packages")), "Hazmat sample lacks number and type of packages")
    validation.check(hazmat.get("conditions") == ["hazmat"], "Hazmat applicability is not isolated")
    validation.check(hazmat.get("complianceReviewedOn") == "2026-08-21", "Hazmat compliance review date missing")
    validation.check("https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/subpart-C/section-172.202" in hazmat.get("sourceRefs", []), "Hazmat eCFR source missing")
    validation.check("https://www.phmsa.dot.gov/regulations/title49/interp/21-0037" in hazmat.get("sourceRefs", []), "Hazmat PHMSA source missing")
    validation.check("was reviewed on 2026-08-21" in hazmat_sample_text, "Hazmat training review statement missing")
    validation.check("must receive separate hazmat compliance review" not in hazmat_sample_text, "Hazmat sample still claims review is pending")
    validation.check("not a valid shipping paper" in hazmat_sample_text, "Hazmat sample validity limitation missing")

    eld_transfer_text = (EDITION / "document-samples" / "10_eld_transfer_instructions.md").read_text(encoding="utf-8")
    for phrase in ("Web Services and Email", "USB 2.0 and Bluetooth", "specific registered device"):
        validation.check(phrase in eld_transfer_text, f"ELD method-set text missing: {phrase}")
    eld_transfer = by_legacy.get("doc-10", {})
    eld_instances = {row.get("id", "").rsplit(":", 1)[-1]: row for row in eld_transfer.get("trainingInstances", [])}
    method_sets = {
        "sample-a": {"Web Services", "Email"},
        "sample-b": {"USB 2.0", "Bluetooth"},
    }
    all_methods = set().union(*method_sets.values())
    for instance_id, supported in method_sets.items():
        visible_text = json.dumps(eld_instances.get(instance_id, {}).get("visibleStimulus", {}), ensure_ascii=False)
        named = {method for method in all_methods if method in visible_text}
        validation.check(named == supported, f"ELD transfer instance instructs a method outside its supported pair: {instance_id} {sorted(named)}")
    sample_b_text = json.dumps(eld_instances.get("sample-b", {}).get("visibleStimulus", {}), ensure_ascii=False)
    validation.check("Web Services" not in sample_b_text and "Email" not in sample_b_text, "ELD local-transfer sample still instructs Web Services or Email")
    eld_malfunction = by_legacy.get("doc-11", {})
    validation.check(set(eld_malfunction.get("conditions", [])) == {"eld-required", "eld-malfunction"}, "ELD malfunction conditions are incomplete")
    validation.check("https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.34" in eld_malfunction.get("sourceRefs", []), "ELD malfunction source missing")
    eld_malfunction_text = (EDITION / "document-samples" / "11_eld_malfunction_instructions.md").read_text(encoding="utf-8")
    for phrase in ("within 24 hours", "current 24-hour period", "previous seven consecutive days", "manual paper RODS", "within eight days"):
        validation.check(phrase in eld_malfunction_text, f"ELD malfunction instruction missing: {phrase}")
    generated_instructions = " ".join(row.get("text", "") for row in eld_malfunction.get("instructions", []))
    for phrase in ("within 24 hours", "current 24-hour period", "previous seven consecutive days", "manual paper RODS", "within eight days"):
        validation.check(phrase in generated_instructions, f"Generated ELD malfunction instruction missing: {phrase}")

    eld_manual = by_legacy.get("doc-09", {})
    validation.check(eld_manual.get("status") == "training" and eld_manual.get("conditions") == ["eld-required"], "Optional ELD device help must stay out of non-ELD automatic queues")
    validation.check(eld_manual.get("federallyRequiredOnboard") is False and eld_manual.get("optionalDeviceHelp") is True, "ELD manual is not clearly optional device help")
    validation.check(eld_manual.get("effectiveFrom") == "2026-07-22", "ELD manual federal change date is missing")
    validation.check("not a federally required onboard item" in " ".join(eld_manual.get("notes", [])), "ELD manual currentness note is missing")
    validation.check(any("section-395.22" in source for source in eld_manual.get("sourceRefs", [])), "ELD manual current eCFR source is missing")
    validation.check(any("2026-12448" in source for source in eld_manual.get("sourceRefs", [])), "ELD manual Federal Register source is missing")
    eld_packet = data.get("eldInformationPacket", {})
    validation.check(eld_packet.get("effectiveFrom") == "2026-07-22", "ELD packet currentness date is missing")
    validation.check(eld_packet.get("requiredDocumentIds") == [
        "document:eld-transfer-instructions",
        "document:eld-malfunction-instructions",
        "document:blank-paper-rods",
    ], "ELD federally required packet is incorrect")
    validation.check(eld_packet.get("minimumBlankGraphGridDays") == 8, "ELD packet does not require at least eight blank graph-grid days")
    validation.check(eld_packet.get("optionalDeviceHelpDocumentIds") == ["document:eld-user-manual-locator"], "ELD optional device-help mapping is incorrect")
    validation.check(set(eld_packet.get("sourceRefs", [])) == set(eld_manual.get("sourceRefs", [])), "ELD packet source references are incomplete")
    blank_rods = by_legacy.get("doc-12", {})
    validation.check(blank_rods.get("minimumBlankDays") == 8 and blank_rods.get("federallyRequiredOnboard") is True, "Blank paper RODS packet requirement is incomplete")
    roadside_screen = by_legacy.get("doc-13", {})
    validation.check(roadside_screen.get("recordWindow") == "current 24-hour period plus previous 7 consecutive days", "ELD roadside record window is incomplete")
    required_eld_ids = {item.get("id") for item in documents if item.get("federallyRequiredOnboard") is True and "eld-required" in item.get("conditions", [])}
    validation.check(required_eld_ids == set(eld_packet.get("requiredDocumentIds", [])), "ELD user manual leaked into federally required onboard documents")

    medical = by_legacy.get("doc-02", {})
    validation.check(medical.get("effectiveFrom") == "2026-04-11", "MEC temporary context start date changed")
    validation.check(medical.get("effectiveThrough") == "2026-10-11", "MEC temporary context end date changed")
    validation.check("fmcsa-issues-temporary-exemption-support-nrii-transition" in " ".join(medical.get("sourceRefs", [])), "MEC temporary source missing")
    validation.check("up to 60 days" in medical.get("effectiveDateContext", "") and "not a permanent" in medical.get("effectiveDateContext", ""), "MEC effective-date context is incomplete")

    compliance_ids = {"doc-02", "doc-07", "doc-09", "doc-10", "doc-11", "doc-12", "doc-13", "doc-17", "doc-19"}
    for legacy_id in compliance_ids:
        item = by_legacy.get(legacy_id, {})
        for field in ("applicabilityRu", "dateContextRu", "safeActionRu"):
            validation.check(bool(re.search(r"[А-Яа-яЁё]", item.get(field, ""))), f"Russian compliance narrative missing: {legacy_id} {field}")
        for instruction in item.get("instructions", []):
            validation.check(bool(re.search(r"[А-Яа-яЁё]", instruction.get("textRu", ""))), f"Russian compliance instruction missing: {legacy_id}")

    for item in documents:
        if item.get("sourceRefs"):
            validation.check(item.get("verifiedOn") == "2026-08-21", f"Document source verification date missing: {item['id']}")
            validation.check(all(source.startswith("https://") for source in item.get("sourceRefs", [])), f"Document source reference is not an HTTPS URL: {item['id']}")

    hotshot_h4 = [item for item in data["hotshot"] if item.get("theme", "").startswith("H4.")]
    validation.check(len(hotshot_h4) == 15, f"Expected 15 Hotshot H4 units, got {len(hotshot_h4)}")
    for item in hotshot_h4:
        validation.check(item.get("securementBranchIds") == ["vehicle-at-most-10000-lb", "vehicle-over-10000-lb"], f"Hotshot securement branches missing: {item['id']}")
        validation.check(all(any(section in source for source in item.get("sourceRefs", [])) for section in ("393.128", "393.130")), f"Hotshot dual securement sources missing: {item['id']}")
    hotshot_h6 = [item for item in data["hotshot"] if item.get("theme", "").startswith("H6.")]
    validation.check(len(hotshot_h6) == 14, f"Expected 14 Hotshot H6 units, got {len(hotshot_h6)}")
    for item in hotshot_h6:
        validation.check(item.get("profiles") == ["hotshot-enclosed"], f"Enclosed unit profile leak: {item['id']}")
        validation.check("enclosed-trailer" in item.get("equipment", []) and "enclosed-trailer" not in item.get("conditions", []), f"Enclosed trailer equipment metadata missing: {item['id']}")
        validation.check(any("enclosed-cargo-areas" in source for source in item.get("sourceRefs", [])), f"Enclosed cargo source missing: {item['id']}")
    module = load_json(EDITION / "data" / "hotshot-module.json")
    validation.check("10,000 pounds or less" in module.get("scope", "") and "393.130" in module.get("scope", ""), "Hotshot heavy-vehicle branch is not documented")
    programs = {item.get("id"): item for item in data.get("cargoSecurementPrograms", [])}
    validation.check(set(programs) == {"vehicle-at-most-10000-lb", "vehicle-over-10000-lb"}, "Both vehicle securement programs are required")
    light = programs.get("vehicle-at-most-10000-lb", {})
    validation.check(light.get("regulation") == "49 CFR 393.128" and light.get("assessmentBlueprint", {}).get("minimumTiedowns") == 2 and light.get("assessmentBlueprint", {}).get("frontAndRearRestraintRequired") is True, "393.128 securement task is incomplete")
    validation.check("minimum of two tiedowns total" in " ".join(light.get("requirementsEn", [])) and "at least two tiedowns at the front" not in " ".join(light.get("requirementsEn", [])), "393.128 still overstates the two-tiedown minimum")
    heavy = programs.get("vehicle-over-10000-lb", {})
    validation.check(heavy.get("regulation") == "49 CFR 393.130" and heavy.get("assessmentBlueprint", {}).get("minimumTiedowns") == 4 and heavy.get("assessmentBlueprint", {}).get("accessoryAndArticulationChecksRequired") is True, "393.130 heavy-vehicle branch is incomplete")
    securement_question = next((item for item in data.get("inspectionQuestions", []) if item.get("id") == "question:how-is-the-cargo-secured"), {})
    question_branches = securement_question.get("conditionMaterializations", {})
    expected_conditions = {
        "transported-automobile-or-light-truck-at-most-10000-lb": ("393.128", 2, "393.130", 4),
        "transported-automobile-or-light-truck-over-10000-lb": ("393.130", 4, "393.128", 2),
    }
    validation.check(set(question_branches) == set(expected_conditions), "Securement question condition materializations are incomplete")
    for condition_id, (regulation, minimum, forbidden_regulation, forbidden_minimum) in expected_conditions.items():
        branch = question_branches.get(condition_id, {})
        policy = branch.get("responseRubric", {}).get("branchConflictPolicy", {})
        validation.check(branch.get("conditionId") == condition_id and condition_id in branch.get("conditions", []) and branch.get("visibleStimulus", {}).get("individualVehicleWeightLb") and branch.get("promptDisplay") == branch.get("promptSpoken") and branch.get("answerDisplay") == branch.get("answerSpoken"), f"Securement question branch is not atomic: {condition_id}")
        validation.check(policy.get("requiredRegulation") == regulation and policy.get("requiredMinimumTiedowns") == minimum and policy.get("forbiddenRegulation") == forbidden_regulation and policy.get("forbiddenMinimumTiedowns") == forbidden_minimum and policy.get("minimumAnswerStrict") is True and policy.get("rejectOtherBranch") is True, f"Securement question cross-branch policy is incomplete: {condition_id}")
        validation.check({slot.get("name") for slot in branch.get("slots", [])} == {"vehicle-weight", "minimum-tiedowns", "regulation-branch"}, f"Securement question branch slots are incomplete: {condition_id}")
    securement_lesson = next((item for item in data.get("lessons", []) if item.get("id") == "lesson:securing-transported-vehicles"), {})
    lesson_branches = securement_lesson.get("conditionMaterializations", {})
    validation.check(set(lesson_branches) == set(expected_conditions) and securement_lesson.get("assessmentBlueprint", {}).get("conditionSpecificInteraction", {}).get("crossBranchResponseFails") is True, "Securement lesson condition materializations are incomplete")
    for condition_id, (_, minimum, _, _) in expected_conditions.items():
        lesson_branch = lesson_branches.get(condition_id, {})
        interaction = lesson_branch.get("interaction", {})
        policy = interaction.get("semanticRubric", {}).get("branchConflictPolicy", {})
        validation.check(lesson_branch.get("assessmentBlueprint", {}).get("localAudioDoesNotQualifyBranchKnowledge") is True and lesson_branch.get("visibleStimulus", {}).get("individualVehicleWeightLb") and interaction.get("promptEn") and interaction.get("modelResponse") and len(interaction.get("responseSlots", [])) == 3 and policy.get("requiredMinimumTiedowns") == minimum, f"Securement lesson branch assessment is incomplete: {condition_id}")
    reinspection = data.get("cargoReinspectionProgram", {})
    validation.check(reinspection.get("firstInspection", {}).get("deadlineMiles") == 50 and {row.get("id") for row in reinspection.get("subsequentEvents", [])} == {"duty-status-change", "three-hours", "one-hundred-fifty-miles"}, "392.9 cargo reinspection timing is incomplete")
    validation.check({row.get("id") for row in reinspection.get("exceptions", [])} == {"sealed-cmv", "impracticable-to-inspect"} and reinspection.get("assessmentBlueprint", {}).get("calculateNextDueEvent") is True, "392.9 exceptions or next-due task is incomplete")
    reinspection_tasks = {item.get("id"): item for item in reinspection.get("scoredTasks", [])}
    required_reinspection_ids = {
        "first-50-miles", "next-due-duty-status-change", "next-due-three-hours", "next-due-150-miles",
        "exception-sealed-and-ordered-not-to-open", "exception-inspection-impracticable", "seal-alone-is-not-universal-exception",
    }
    validation.check(set(reinspection_tasks) == required_reinspection_ids and set(reinspection.get("assessmentBlueprint", {}).get("requiredTaskIds", [])) == required_reinspection_ids, "392.9 scored task inventory is incomplete")
    validation.check(all(task.get("visibleStimulus") and task.get("promptEn") and task.get("promptRu") and task.get("modelAnswer") and task.get("slots") and task.get("responseRubric", {}).get("requiredRatio") == 1 for task in reinspection_tasks.values()), "392.9 scored task lacks visible keyed evidence")
    first_task = reinspection_tasks.get("first-50-miles", {})
    validation.check(first_task.get("responseRubric", {}).get("computationPolicy") == {"operation": "trip-start-plus-deadline", "deadlineMiles": 50, "expectedOdometerMiles": 120050, "genericRuleStatementFails": True}, "392.9 first-50-mile computation is not keyed")
    next_due_tasks = [task for task in reinspection_tasks.values() if task.get("construct") == "next-reinspection-earliest-event"]
    validation.check(len(next_due_tasks) == 3 and {task.get("responseRubric", {}).get("earliestEventPolicy", {}).get("expectedEventId") for task in next_due_tasks} == {"duty-status-change", "three-hours", "one-hundred-fifty-miles"}, "392.9 earliest-event forms are incomplete")
    validation.check(all(task.get("responseRubric", {}).get("earliestEventPolicy", {}).get("mustChooseExactlyOne") is True and task.get("responseRubric", {}).get("earliestEventPolicy", {}).get("rejectAndAsDeadlineLogic") is True for task in next_due_tasks), "392.9 earliest-event rejection policy is incomplete")
    exception_tasks = [task for task in reinspection_tasks.values() if task.get("construct") == "paragraph-b4-exception-decision"]
    validation.check(len(exception_tasks) == 3 and {task.get("responseRubric", {}).get("exceptionDecisionPolicy", {}).get("expectedDecision") for task in exception_tasks} == {"exception-applies", "exception-does-not-apply"}, "392.9 exception scored forms are incomplete")
    validation.check(all(task.get("responseRubric", {}).get("exceptionDecisionPolicy", {}).get("sealedRequiresOrderedNotToOpen") is True and task.get("responseRubric", {}).get("exceptionDecisionPolicy", {}).get("rejectUniversalSealedException") is True for task in exception_tasks), "392.9 sealed-load rejection policy is incomplete")
    reinspection_blueprint = reinspection.get("assessmentBlueprint", {})
    validation.check(reinspection_blueprint.get("genericRuleStatementFails") is True and reinspection_blueprint.get("andInsteadOfEarliestFails") is True and reinspection_blueprint.get("universalSealedExceptionFails") is True and reinspection_blueprint.get("modelRevealMakesAttemptIneligible") is True, "392.9 scored failure policies are incomplete")
    scored_questions = data.get("regulatoryScoredQuestions", [])
    embedded_questions = reinspection.get("scoredQuestions", [])
    required_question_ids = {f"question:cargo-reinspection:{task_id}" for task_id in required_reinspection_ids}
    validation.check(len(scored_questions) == len(embedded_questions) == 7 and scored_questions == embedded_questions, "392.9 embedded and top-level scored questions differ")
    validation.check({item.get("id") for item in scored_questions} == required_question_ids and set(reinspection.get("scoredQuestionIds", [])) == required_question_ids and reinspection_blueprint.get("scoredQuestionIdsField") == "scoredQuestionIds", "392.9 scored question ids are incomplete")
    for question in scored_questions:
        task = reinspection_tasks.get(question.get("scoredTaskId"), {})
        validation.check(question.get("sourceTask") == task, f"392.9 scored question no longer byte-semantically matches its source task: {question.get('id')}")
        validation.check(question.get("regulatoryProgramId") == reinspection.get("id") and question.get("category") in {"G. Vehicle, equipment and visible defects", "H. Result, violation and completion"}, f"392.9 scored question routing is incomplete: {question.get('id')}")
        validation.check(question.get("profiles") == ["tractor", "hotshot-open", "hotshot-enclosed"] and question.get("equipment") == [] and question.get("conditions") == ["cargo-securement"], f"392.9 scored question applicability differs: {question.get('id')}")
        validation.check(
            question.get("visibleStimulus") == task.get("visibleStimulus")
            and question.get("prompt") == question.get("promptDisplay") == question.get("promptSpoken") == task.get("promptEn")
            and question.get("answer") == question.get("answerDisplay") == question.get("answerSpoken") == task.get("modelAnswer")
            and question.get("promptRu") == task.get("promptRu")
            and question.get("answerRu") == task.get("modelAnswerRu")
            and question.get("slots") == task.get("slots")
            and question.get("responseRubric") == task.get("responseRubric"),
            f"392.9 scored question projection differs from the source task: {question.get('id')}",
        )
        assessment = question.get("assessmentBlueprint", {})
        validation.check(assessment.get("visibleStimulusRequired") is True and assessment.get("preRevealTypedResponseRequired") is True and assessment.get("selfScoreAllowed") is False and assessment.get("modelRevealMakesAttemptIneligible") is True, f"392.9 scored question assessment is not readiness-safe: {question.get('id')}")
    breakdown = data.get("breakdownWarningProgram", {})
    validation.check(breakdown.get("regulation") == "49 CFR 392.22" and [row.get("deadline") for row in breakdown.get("sequence", [])] == ["immediately", None], "392.22 breakdown sequence is incomplete")
    validation.check(breakdown.get("sequence", [{}, {}])[1].get("deadlineMinutes") == 10 and {row.get("id") for row in breakdown.get("placementVariants", [])} == {"ordinary-road", "divided-or-one-way", "hill-or-curve"}, "392.22 warning-device placement variants are incomplete")


def check_visuals(validation, data, migrations):
    visual_file = load_json(DATA_DIR / "visual-assets.json")
    visual_assets = data.get("visualAssets", [])
    validation.check(visual_assets == visual_file.get("assets"), "Embedded visual assets differ from visual-assets.json")
    validation.check(len(visual_assets) == 16, "Expected 16 visual assets")
    known_ids = {item["id"] for collection in COLLECTIONS for item in data[collection]}
    legacy_ids = set(migrations)
    ids = []
    for item in visual_assets:
        ids.append(item.get("id"))
        path = APP / item.get("path", "")
        validation.check(path.is_file() and path.suffix.casefold() == ".webp", f"Visual asset missing: {item.get('id')}")
        validation.check(bool(item.get("alt")) and bool(item.get("contentRefs")), f"Visual metadata incomplete: {item.get('id')}")
        for content_ref in item.get("contentRefs", []):
            validation.check(content_ref in known_ids or content_ref in legacy_ids, f"Unresolvable visual contentRef: {content_ref}")
    validation.check(len(ids) == len(set(ids)), "Duplicate visual asset ids")


def check_audio(validation, data):
    manifest = load_json(DATA_DIR / "audio-manifest.json")
    masters = manifest.get("synthesisMasters", [])
    deliverables = manifest.get("deliverables", [])
    validation.check(len(masters) == 1450, f"Audio masters: expected 1450, got {len(masters)}")
    validation.check(sum(item.get("characters", 0) for item in masters) == 52661, "Audio catalog character contract changed")
    validation.check(len(deliverables) == 1466, f"Audio deliverables: expected 1466, got {len(deliverables)}")
    validation.check(manifest.get("contentVersion") == data.get("contentVersion"), "Audio contentVersion mismatch")
    validation.check(manifest.get("catalogSeed") == "production/audio-catalog-seed.json", "Immutable audio catalog seed is not declared")
    validation.check(manifest.get("masterSeedReport") == "production/audio-master-seeds.json", "Immutable audio master seed report is not declared")
    speaker_metadata = manifest.get("speakerMetadata", {})
    expected_speaker_metadata = {
        "911": ("emergency-dispatcher", "state-trooper"),
        "Cashier": ("fuel-cashier", "gate-clerk"),
        "Scale Clerk": ("scale-clerk", "gate-clerk"),
        "Loader": ("loader", "receiver"),
    }
    for speaker, (semantic_role, voice_preset) in expected_speaker_metadata.items():
        row = speaker_metadata.get(speaker, {})
        validation.check(row.get("semanticRole") == semantic_role and row.get("voicePreset") == voice_preset and bool(row.get("voiceId")), f"Audio semantic role and voice preset differ: {speaker}")
    catalog_seed = load_json(EDITION / "production" / "audio-catalog-seed.json")
    catalog_rows = catalog_seed.get("synthesisMasters", []) + catalog_seed.get("deliverables", [])
    validation.check(all(item.get("text") != "Yes. I have tanker." for item in catalog_rows), "Malformed tanker answer remains in immutable audio catalog")
    validation.check(all(not re.search(r"\b(?:a|p)\.m\.\.", str(item.get("text", "")), re.IGNORECASE) for item in catalog_rows), "Double time punctuation remains in immutable audio catalog")
    validation.check(sum(item.get("text") == "Yes. I have a tanker endorsement." for item in catalog_seed.get("synthesisMasters", [])) == 2, "Corrected tanker master identities are incomplete")
    validation.check({item.get("synthesisKey") for item in catalog_seed.get("synthesisMasters", [])} == {item.get("synthesisKey") for item in masters}, "Runtime audio masters differ from catalog seed")
    validation.check({item.get("renderKey") for item in catalog_seed.get("deliverables", [])} == {item.get("renderKey") for item in deliverables}, "Runtime audio deliverables differ from catalog seed")
    master_seed_report = load_json(EDITION / "production" / "audio-master-seeds.json")
    master_seed_rows = master_seed_report.get("masters", [])
    validation.check(master_seed_report.get("masterCount") == len(master_seed_rows) == 1450, "Immutable master hash inventory is incomplete")
    validation.check({item.get("synthesisKey") for item in master_seed_rows} == {item.get("synthesisKey") for item in masters}, "Immutable master hash keys differ from manifest")
    master_bytes = 0
    for item in master_seed_rows:
        path = EDITION / item.get("path", "")
        validation.check(path.is_file() and path.stat().st_size == item.get("bytes"), f"Immutable master size mismatch: {item.get('synthesisKey')}")
        if path.is_file():
            validation.check(file_sha256(path) == item.get("sha256"), f"Immutable master hash mismatch: {item.get('synthesisKey')}")
            master_bytes += path.stat().st_size
    validation.check(master_bytes == master_seed_report.get("totalBytes"), "Immutable master byte total changed")
    for item in deliverables:
        path = APP / item.get("path", "")
        validation.check(path.is_file() and path.stat().st_size > 1024, f"Missing or invalid audio deliverable: {item.get('path')}")
        for source in item.get("sources", []):
            if source.get("sourceType") == "inspection-question" and source.get("field") == "prompt":
                validation.check(item.get("role") == "inspector", f"Question prompt has wrong voice role: {source.get('sourceId')}")
            if source.get("sourceType") == "inspection-question" and source.get("field") == "answer":
                validation.check(item.get("role") == "driver", f"Question answer has wrong voice role: {source.get('sourceId')}")

    audio_data = load_window_json(DATA_DIR / "audio-data.js", "window.TRUCK_AUDIO_DATA = ")
    validation.check(bool(audio_data.get("lookup")) and bool(audio_data.get("bySource")), "Audio lookup maps are incomplete")
    validation.check(audio_data.get("audioProfilesAvailable") == ["clean", "phone", "roadside"], "Runtime audio profile list is incomplete")
    lookup = audio_data.get("lookup", {})
    voice_lab_audio = lookup.get("driver\0Could you repeat that more slowly, please?", {}).get("clean")
    validation.check(bool(voice_lab_audio) and (APP / voice_lab_audio).is_file(), "Voice Lab model lacks exact generated local audio")
    app_source = (APP / "app.js").read_text(encoding="utf-8")
    validation.check("speechSynthesis" not in app_source and "SpeechSynthesisUtterance" not in app_source, "Browser speech fallback remains in the release runtime")
    for lesson in data.get("lessons", []):
        phrase_sets = lesson.get("profilePhrases") or {profile: lesson.get("phrases", []) for profile in lesson.get("profiles", [])}
        for profile, phrases in phrase_sets.items():
            for phrase in phrases:
                source = lookup.get(f"driver\0{phrase}")
                validation.check(isinstance(source, dict) and bool(source), f"Lesson profile phrase lacks exact local audio lookup: {lesson.get('id')} {profile} {phrase}")
                if isinstance(source, dict) and source:
                    paths = [APP / value for value in source.values() if isinstance(value, str)]
                    validation.check(bool(paths) and all(path.is_file() and path.stat().st_size > 1024 for path in paths), f"Lesson profile phrase audio is not file-backed: {lesson.get('id')} {profile} {phrase}")
    production = load_json(DATA_DIR / "audio-production-report.json")
    validation.check(production.get("model") == "eleven_flash_v2_5", "Audio production model changed")
    validation.check(len(production.get("deliverableSha256", {})) == 1466, "Audio production hashes are incomplete")
    expected_deliverable_hashes = production.get("deliverableSha256", {})
    validation.check(set(expected_deliverable_hashes) == {item.get("renderKey") for item in deliverables}, "Deliverable hash keys differ from manifest")
    for item in deliverables:
        path = APP / item.get("path", "")
        if path.is_file():
            validation.check(file_sha256(path) == expected_deliverable_hashes.get(item.get("renderKey")), f"Audio deliverable hash mismatch: {item.get('renderKey')}")
    audio_qa = load_json(DATA_DIR / "audio-qa-report.json")
    validation.check(audio_qa.get("status") == "passed" and audio_qa.get("issues") == [], "Cycle 3 generated audio technical QA failed")
    validation.check(audio_qa.get("mastersChecked") == 189 and audio_qa.get("deliverablesChecked") == 192, "Cycle 3 generated audio QA scope is incomplete")
    requirements = manifest.get("currentRequirements", [])
    validation.check(bool(requirements), "Current audio requirements are missing")
    validation.check(all(item.get("available") and item.get("path") and not item.get("fallback") for item in requirements), "Every current audio requirement must use an exact generated local MP3")

    listening = load_json(DATA_DIR / "listening-data.json")
    listening_js = load_window_json(DATA_DIR / "listening-data.js", "window.TRUCK_LISTENING_DATA = ")
    validation.check(listening == listening_js, "Listening JSON and JavaScript wrapper differ")
    profiles = listening.get("profiles", {})
    if profiles:
        question_ids = {item["id"] for item in data["inspectionQuestions"]}
        validation.check(set(profiles) == question_ids and len(profiles) == 75, "Listening matrix must cover all 75 prompts")
        validation.check(listening.get("contentVersion") == data.get("contentVersion"), "Listening contentVersion mismatch")
        validation.check(listening.get("paidApiCalls") == 0, "Listening profile build used a paid API")
        validation.check(listening.get("audioProfilesAvailable") == ["clean", "phone", "roadside"], "Listening audio profile list is incomplete")
        validation.check(bool(listening.get("limitations")), "Listening limitation text is missing")
        question_by_id = {item["id"]: item for item in data["inspectionQuestions"]}
        required_driver_ids = {item["id"] for item in data["inspectionQuestions"] if item.get("legacyId") in DRIVER_ANSWER_LISTENING_LEGACY_IDS}
        validation.check(set(listening.get("driverAnswerQuestionIds", [])) == required_driver_ids, "Mandatory driver-answer listening ids are incomplete")
        required_slot_types = {
            "question-15": {"time", "date"},
            "question-37": {"weight-cardinal"},
            "question-42": {"duration-hours", "duration-minutes"},
            "question-64": {"pressure"},
            "question-71": {"oos-condition"},
        }
        for question_id, row in profiles.items():
            paths = [APP / row.get(profile, "") for profile in ("clean", "phone", "roadside")]
            validation.check(all(path.is_file() and path.stat().st_size > 1024 for path in paths), f"Listening assets incomplete: {question_id}")
            if all(path.is_file() for path in paths):
                validation.check(len({file_sha256(path) for path in paths}) == 3, f"Listening profiles are not distinct: {question_id}")
            question = question_by_id.get(question_id, {})
            spoken = materialize(question.get("promptTemplate", ""), question.get("slots", []), spoken=True)
            validation.check(row.get("spokenText") == spoken, f"Listening spoken text mismatch: {question_id}")
            validation.check(not re.search(r"\[[^]]+\]", row.get("spokenText", "")), f"Listening text has unresolved slot: {question_id}")
            prompt = row.get("prompt", {})
            validation.check(prompt.get("role") == "inspector" and prompt.get("spokenText") == spoken, f"Listening prompt schema mismatch: {question_id}")
            validation.check(all(prompt.get(profile) == row.get(profile) for profile in ("clean", "phone", "roadside")), f"Listening prompt path aliases differ: {question_id}")
            prompt_qa = prompt.get("qa", {})
            check_signal_qa(validation, prompt_qa, question_id)
            for profile, path in zip(("clean", "phone", "roadside"), paths):
                if path.is_file():
                    validation.check(prompt_qa.get("sha256", {}).get(profile) == file_sha256(path), f"Listening prompt QA hash mismatch: {question_id} {profile}")
                    validation.check(prompt_qa.get("bytes", {}).get(profile) == path.stat().st_size, f"Listening prompt QA size mismatch: {question_id} {profile}")
                    validation.check(prompt_qa.get("durationMs", {}).get(profile, 0) > 0, f"Listening prompt duration missing: {question_id} {profile}")
            legacy_id = question.get("legacyId")
            answer = row.get("driverAnswer")
            if question_id in required_driver_ids:
                validation.check(isinstance(answer, dict), f"Mandatory driver-answer profile missing: {legacy_id}")
                if isinstance(answer, dict):
                    answer_paths = [APP / answer.get(profile, "") for profile in ("clean", "phone", "roadside")]
                    validation.check(all(path.is_file() and path.stat().st_size > 1024 for path in answer_paths), f"Driver-answer assets incomplete: {legacy_id}")
                    if all(path.is_file() for path in answer_paths):
                        validation.check(len({file_sha256(path) for path in answer_paths}) == 3, f"Driver-answer profiles are not distinct: {legacy_id}")
                    validation.check(answer.get("spokenText") == question.get("answer") and answer.get("role") == "driver", f"Driver-answer spoken mapping mismatch: {legacy_id}")
                    answer_slots = answer.get("semanticExpectedSlots", [])
                    validation.check({slot.get("type") for slot in answer_slots} == required_slot_types[legacy_id], f"Driver-answer typed slot coverage mismatch: {legacy_id}")
                    expected_names = {slot.get("name") for slot in answer_slots}
                    rubric = answer.get("semanticRubric", {})
                    validation.check(set(rubric.get("requiredSlotNames", [])) == expected_names, f"Driver-answer semantic rubric names mismatch: {legacy_id}")
                    validation.check(rubric.get("rejectPromptEcho") is True and rubric.get("rejectAffirmationOnly") is True, f"Driver-answer rejection rules missing: {legacy_id}")
                    validation.check(set(answer.get("slotFeedbackRu", {})) == expected_names and bool(answer.get("feedbackRu")), f"Driver-answer task-specific feedback missing: {legacy_id}")
                    answer_qa = answer.get("qa", {})
                    check_signal_qa(validation, answer_qa, legacy_id)
                    for profile, path in zip(("clean", "phone", "roadside"), answer_paths):
                        if path.is_file():
                            validation.check(answer_qa.get("sha256", {}).get(profile) == file_sha256(path), f"Driver-answer QA hash mismatch: {legacy_id} {profile}")
                            validation.check(answer_qa.get("bytes", {}).get(profile) == path.stat().st_size, f"Driver-answer QA size mismatch: {legacy_id} {profile}")
                            validation.check(answer_qa.get("durationMs", {}).get(profile, 0) > 0, f"Driver-answer duration missing: {legacy_id} {profile}")
            else:
                validation.check(answer is None, f"Unexpected driver-answer listening profile: {legacy_id}")

    answer_seeds = load_json(EDITION / "production" / "listening-answer-seeds.json")
    validation.check(set(answer_seeds.get("seeds", {})) == set(listening.get("driverAnswerQuestionIds", [])), "Driver-answer seed inventory differs from listening data")
    for question_id, seed in answer_seeds.get("seeds", {}).items():
        path = EDITION / seed.get("path", "")
        validation.check(path.is_file() and path.stat().st_size > 1024, f"Driver-answer seed missing: {question_id}")
        if path.is_file():
            validation.check(file_sha256(path) == seed.get("sha256"), f"Driver-answer seed hash mismatch: {question_id}")
        validation.check(seed.get("spokenText") == profiles.get(question_id, {}).get("driverAnswer", {}).get("spokenText"), f"Driver-answer seed text mismatch: {question_id}")


def check_runtime(validation, data):
    index_source = (APP / "index.html").read_text(encoding="utf-8")
    app_source = (APP / "app.js").read_text(encoding="utf-8")
    core_source = (APP / "app-core.js").read_text(encoding="utf-8")
    state_source = (APP / "state-store.js").read_text(encoding="utf-8")
    evaluator_source = (APP / "learning-evaluator.js").read_text(encoding="utf-8")
    server_source = (APP / "server.py").read_text(encoding="utf-8")
    sw_source = (APP / "sw.js").read_text(encoding="utf-8")

    validation.check("Это не официальная оценка CEFR или ACTFL" in index_source, "Diagnostic validity limitation is missing")
    diagnostic_match = re.search(r"const DIAGNOSTIC_ITEMS = \[(.*?)\n  \];", app_source, re.DOTALL)
    diagnostic_block = diagnostic_match.group(1) if diagnostic_match else ""
    validation.check(bool(diagnostic_match), "Diagnostic blueprint not found")
    diagnostic_rows = re.findall(r'\{ form: "([AB])", id: "[^"]+", category: "(vocabulary|listening|elp|inspection)"', diagnostic_block)
    diagnostic_counts = Counter(diagnostic_rows)
    validation.check(len(diagnostic_rows) >= 24, "Diagnostic bank must contain at least 24 items")
    for form in ("A", "B"):
        validation.check(sum(count for (row_form, _), count in diagnostic_counts.items() if row_form == form) >= 12, f"Diagnostic form {form} must contain at least 12 items")
        for category in ("vocabulary", "listening", "elp", "inspection"):
            validation.check(diagnostic_counts[(form, category)] >= 3, f"Diagnostic form {form} must contain at least 3 {category} items")
    validation.check(len(re.findall(r"kind: \"productive\"", diagnostic_block)) >= 8, "Diagnostic bank lacks keyed productive tasks")
    validation.check("self-score" not in diagnostic_block.casefold() and "selfscore" not in diagnostic_block.casefold(), "Diagnostic still contains self scoring")
    validation.check("item.options = shuffled(options" in core_source, "Diagnostic option positions are not randomized")
    validation.check("diagnosticRecommendation" in core_source and "answered >= 2" in core_source, "Diagnostic recommendation logic is incomplete")
    validation.check("Eval.scoreDiagnosticAnswer" in app_source and "scoreDiagnosticAnswer(item, answer" in evaluator_source, "Diagnostic does not use the keyed local evaluator")
    validation.check("diagnosticStimulusExposure" in app_source and "item?.audio && !options.stimulusExposed" in evaluator_source, "Diagnostic listening stimulus exposure is not mandatory")
    validation.check("evaluateSemanticResponse" in evaluator_source and 'evaluator: "choice-key"' in evaluator_source, "Diagnostic constructs are not blindly scored")
    validation.check("buildDiagnosticContract" in app_source and "DIAGNOSTIC_CONTRACT_BY_ID" in app_source and "recoveryTargetId" in app_source, "Diagnostic runtime does not enforce the generated semantic contract")
    validation.check("rollbackDiagnosticItemMutation" in app_source and "journalMutationOk" in app_source, "Diagnostic journal mutation does not have an atomic rollback guard")

    validation.check("disabled>Этап 2 заблокирован" in index_source, "ELP Step 2 is not initially gated")
    validation.check("elpStepOneContractValid" in app_source and "items.length !== ELP_STEP_ONE_REQUIRED" in app_source, "ELP Step 1 seven-function gate is not enforced")
    validation.check('task?.key === "elp" ? ELP_STEP_ONE_REQUIRED : 5' in app_source, "ELP Step 1 atomic Today route is truncated")
    validation.check("gate.results[id] = {" in app_source and "typed: true" in app_source and "preReveal: true" in app_source and "blind: true" in app_source and "productive: true" in app_source, "ELP Step 1 typed pre-reveal evidence is incomplete")
    validation.check("Eval.deriveGateStatus(gate.results, gate.sessionIds)" in app_source, "ELP Step 1 status is not locally derived")
    validation.check("normalizeTypedGateEvidence" in state_source and "normalizeGateResult" in state_source and "const derivedStatus = completeEvidence" in state_source, "ELP imported status is not derived from structured evidence")
    validation.check("state.elpGate?.status !== \"passed\"" in app_source, "ELP Step 2 pass guard missing")
    validation.check("elpStepTwoEnglishBearingIds" in state_source and "elpStepTwoRequiredAttempts" in state_source, "ELP Step 2 state contract does not use the reviewed English-bearing pool and blueprint")

    validation.check("const MASTERY_GAP_MS = 24 * 60 * 60 * 1000" in state_source, "Mastery spacing is not 24 hours")
    validation.check("deriveMasteryProof" in state_source and "qualifyingSuccesses" in state_source and "createDemonstratedEvidence" in state_source, "Mastery evidence derivation missing")
    validation.check("StateApi.isMastered" in app_source and "StateApi.masteryStatus" in app_source and "stateStore.recordAttempt" in app_source, "Runtime mastery does not use StateApi evidence")
    validation.check("isQualifyingEvidence" in state_source and 'support: "none"' in state_source and "preReveal: true" in state_source, "Mastery does not require blind unsupported pre-reveal evidence")
    validation.check("America/New_York" in core_source, "Today date is not pinned to America/New_York")
    validation.check("roundRobinDueItems" in core_source and "errors.forEach(add);" in core_source and "due.forEach(add);" in core_source and "professional.forEach(add);" in core_source, "Today route does not prioritize errors, round-robin due work and professional progression")
    validation.check("Core.dailyTaskCompleted" in app_source and "Core.selectTodayTasks" in app_source, "Today does not use the shared completion and fixed workload contracts")
    validation.check("routeKeys" in app_source and "dueCursor" in app_source and "selectTodayTasks" in core_source, "Today route snapshot does not persist bounded selection and due cursor")
    validation.check("mergeLiveDue" in app_source and "scheduleDueInvalidation" in app_source and "nextFutureDueAt" in app_source, "Today does not merge items that become due during the day")
    for due_field in ("dueQuestionIds", "dueSignIds", "dueSituationIds", "dueDocumentIds", "dueLessonIds"):
        validation.check(due_field in app_source and due_field in state_source, f"Today does not persist {due_field}")

    for item in data["situations"]:
        validation.check(item.get("audioProfile") in {"clean", "phone", "roadside"}, f"Situation audioProfile missing: {item['id']}")
    for item in data["lessons"]:
        validation.check(item.get("audioProfile") in {"clean", "phone"}, f"Lesson audioProfile missing: {item['id']}")

    for header in ("Content-Security-Policy", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options"):
        validation.check(header in server_source, f"Server security header missing: {header}")
    validation.check("microphone=(self)" in server_source and "camera=()" in server_source, "Permissions-Policy is not locally scoped")
    validation.check("RANGE_RE" in server_source and "Content-Range" in server_source and "Accept-Ranges" in server_source, "Local server Range support missing")
    validation.check("segment.startswith(\".\")" in server_source, "Local server hidden-path guard missing")

    cache_match = re.search(r'CACHE_VERSION = "v(\d+)"', sw_source)
    validation.check(bool(cache_match) and int(cache_match.group(1)) >= 20, "Service worker cache version is stale")
    validation.check("MEDIA_CACHE" in sw_source and "caches.delete" in sw_source, "Versioned media cache cleanup missing")
    validation.check("await cache.put" in sw_source, "Service worker cache writes are not awaited")
    validation.check("parseRangeHeader" in sw_source and "status: 206" in sw_source and "status: 416" in sw_source, "Service worker Range behavior incomplete")
    for item in data["signs"]:
        if item.get("provenance") == "fhwa-mutcd-shs":
            validation.check(f'"./{item["assetPath"]}"' in sw_source, f"Official SVG absent from shell cache: {item['assetPath']}")
    validation.check(not any(path.is_dir() and path.name == ".staging" for path in APP.rglob(".staging")), "Runtime .staging directory exists")
    for path in DATA_DIR.glob("*.json"):
        validation.check("/.staging/" not in path.read_text(encoding="utf-8"), f"Runtime data references .staging: {path.name}")


def check_docs_and_dashes(validation):
    texts = {}
    for relative in OWNED_DOCS:
        path = EDITION / relative
        if path.is_file():
            texts[relative] = path.read_text(encoding="utf-8")
    current_text = "\n".join(texts.get(path, "") for path in ("00_START_HERE.md", "USER_GUIDE_RU.md", "app/README.md", "17_CYCLE_1_REMEDIATION.md"))
    validation.check(not re.search(r"75\s+(official|официаль)", current_text, re.IGNORECASE), "Current docs call the 75-prompt bank official")
    validation.check("representative training prompts" in current_text.casefold() or "репрезентативн" in current_text.casefold(), "Current docs omit representative training naming")
    validation.check("CEFR" in current_text and "ACTFL" in current_text, "Current docs omit diagnostic validity limitation")
    all_markdown = "\n".join(path.read_text(encoding="utf-8") for path in EDITION.rglob("*.md"))
    stale_prompt_labels = (
        r"75\s+(official|официаль)",
        r"official questions?",
        r"official practice",
        r"official situations?",
        r"официальн(?:ые|ых|ое)\s+задан",
    )
    for pattern in stale_prompt_labels:
        validation.check(not re.search(pattern, all_markdown, re.IGNORECASE), f"Stale prompt naming remains in Markdown: {pattern}")
    for historical in ("14_BATCH_2_PRODUCT_SYSTEM.md", "15_BATCH_3_MODERNIZATION.md", "16_BATCH_4_FINAL_PRODUCT.md"):
        validation.check("SUPERSEDED" in texts.get(historical, "")[:1000], f"Historical batch doc is not marked SUPERSEDED: {historical}")
    required_urls = (
        "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-B/section-391.11",
        "https://www.fmcsa.dot.gov/regulations/enforcement/fmcsa-elp-guidance-roadside-policy-mc-see-2026-0002",
        "https://mutcd.fhwa.dot.gov/kno-shs_2024-release-status/index.htm",
        "https://cvsa.org/inspections/all-inspection-levels/",
        "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/subpart-C/section-172.202",
        "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.34",
        "https://www.w3.org/TR/WCAG22/",
        "https://www.w3.org/WAI/ARIA/apg/patterns/tabs/",
    )
    remediation = texts.get("17_CYCLE_1_REMEDIATION.md", "")
    for url in required_urls:
        validation.check(url in remediation, f"Primary source missing from remediation doc: {url}")

    text_suffixes = {".md", ".py", ".js", ".json", ".html", ".css", ".svg", ".webmanifest", ".command"}
    for path in EDITION.rglob("*"):
        if not path.is_file() or path.suffix.casefold() not in text_suffixes:
            continue
        if any(part in {"audio", "__pycache__"} for part in path.parts):
            continue
        source = path.read_text(encoding="utf-8", errors="replace")
        validation.check("\u2013" not in source and "\u2014" not in source, f"Forbidden Unicode dash: {path.relative_to(EDITION)}")


def main():
    validation = Validation()
    check_required_files(validation)
    validation.finish()

    data = load_json(DATA_DIR / "course-data.json")
    data_js = load_window_json(DATA_DIR / "course-data.js", "window.COURSE_DATA = ")
    validation.check(data == data_js, "Course JSON and JavaScript wrapper differ")
    check_course_contract(validation, data)
    check_units(validation, data)
    check_migrations(validation, data)
    check_questions(validation, data)
    check_signs(validation, data)
    check_situations(validation, data)
    check_documents_and_compliance(validation, data)
    check_visuals(validation, data, data.get("idMigrations", {}).get("migrations", {}))
    check_audio(validation, data)
    check_runtime(validation, data)
    check_docs_and_dashes(validation)
    validation.finish()

    print("validation ok")
    print(json.dumps(data["stats"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
