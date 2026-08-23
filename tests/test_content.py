import json
import re
import unittest
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
DATA_PATH = EDITION / "app" / "data" / "course-data.json"
MIGRATION_PATH = EDITION / "app" / "data" / "content-id-migrations.json"
LESSON_TITLE_SNAPSHOT_PATH = EDITION / "tests" / "lesson-title-ru.snapshot.json"


class ContentRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        cls.migrations = json.loads(MIGRATION_PATH.read_text(encoding="utf-8"))
        cls.lesson_title_snapshot = json.loads(LESSON_TITLE_SNAPSHOT_PATH.read_text(encoding="utf-8"))

    def test_exact_course_counts(self):
        self.assertEqual(self.data["contentVersion"], self.migrations["targetContentVersion"])
        expected = {
            "core": 700,
            "truck": 400,
            "hotshot": 100,
            "inspectionQuestions": 75,
            "situations": 40,
            "signs": 80,
            "documents": 24,
            "lessons": 21,
        }
        for key, count in expected.items():
            self.assertEqual(len(self.data[key]), count, key)
        self.assertEqual(len(self.data["regulatoryScoredQuestions"]), 7)

    def test_all_content_has_applicability(self):
        profiles = {"tractor", "hotshot-open", "hotshot-enclosed"}
        for key in ("core", "truck", "hotshot", "inspectionQuestions", "regulatoryScoredQuestions", "situations", "signs", "documents", "lessons"):
            for item in self.data[key]:
                self.assertTrue(item["profiles"], item["id"])
                self.assertLessEqual(set(item["profiles"]), profiles, item["id"])
                self.assertIsInstance(item["conditions"], list, item["id"])

    def test_semantic_ids_and_complete_legacy_migration(self):
        positional = re.compile(r"^(question|situation|sign|doc|lesson)-\d+$")
        current = {
            item["id"]
            for key in ("core", "truck", "hotshot", "inspectionQuestions", "situations", "signs", "documents", "lessons")
            for item in self.data[key]
        }
        self.assertEqual(self.migrations["count"], 640)
        self.assertEqual(len(self.migrations["migrations"]), 640)
        for key in ("truck", "inspectionQuestions", "situations", "signs", "documents", "lessons"):
            for item in self.data[key]:
                self.assertFalse(positional.match(item["id"]), item["id"])
        for old_id, migration in self.migrations["migrations"].items():
            self.assertIn(migration["sourceCollection"], {"words", "questions", "situations", "signs", "documents", "lessons"}, old_id)
            self.assertIn(migration["targetCollection"], {"words", "questions", "situations", "signs", "documents", "lessons"}, old_id)
            self.assertIn(migration["id"], current, old_id)
        self.assertEqual(self.data["idMigrations"], self.migrations)

    def test_explicit_professional_selection(self):
        expected = {
            "terminology": 120,
            "required-phrase": 30,
            "representative-inspection-bank": 144,
            "document-pack": 20,
            "extra-phrase": 44,
            "sign-bank": 42,
        }
        actual = {source: sum(item["source"] == source for item in self.data["truck"]) for source in expected}
        self.assertEqual(actual, expected)
        for theme in ("dispatch", "dock", "cargo", "scale", "emergency", "delivery"):
            self.assertEqual(sum(item["theme"] == theme for item in self.data["truck"]), 4, theme)

    def test_sign_provenance_legends_and_fallbacks(self):
        counts = {
            provenance: sum(item["provenance"] == provenance for item in self.data["signs"])
            for provenance in ("fhwa-mutcd-shs", "variable-local", "training-dms")
        }
        self.assertEqual(counts, {"fhwa-mutcd-shs": 49, "variable-local": 15, "training-dms": 16})
        expected = {
            "sign-23": "AXLE WEIGHT LIMIT 5 TONS",
            "sign-27": "TRUCKS USE LOWER GEAR",
            "sign-30": "TRUCK CROSSING",
            "sign-34": "GUSTY WINDS AREA",
            "sign-35": "FALLEN ROCKS",
            "sign-52": "FINES DOUBLE",
            "sign-54": "RIGHT SHOULDER CLOSED AHEAD",
            "sign-55": "WEIGH STATION AHEAD",
            "sign-62": "NO PARKING ANY TIME",
            "sign-63": "REST AREA 2 MILES",
            "sign-64": "NEXT SERVICES 23 MILES",
        }
        by_legacy = {item["legacyId"]: item for item in self.data["signs"]}
        for legacy_id, legend in expected.items():
            item = by_legacy[legacy_id]
            self.assertEqual(item["display"], legend)
            self.assertIn(legend, item["assetAlt"])
            self.assertIsNone(item["audioSourceId"])
            self.assertEqual(item["audioFallback"], "browser-speech-exact-text")
        for item in self.data["signs"]:
            if item["provenance"] == "fhwa-mutcd-shs":
                self.assertTrue((EDITION / "app" / item["assetPath"]).is_file(), item["id"])

    def test_typed_slots_and_question_71(self):
        allowed = {
            "location", "cargo-description", "organization", "time", "date", "equipment-identifier",
            "credential-endorsement", "credential-code", "identifier-digits", "document-identifier",
            "weight-cardinal", "duration-hours", "duration-minutes", "statement", "pressure",
            "defect-description", "securement-method", "oos-condition", "duty-status",
        }
        for item in self.data["inspectionQuestions"]:
            self.assertNotRegex(item["prompt"] + item["answer"], r"\[[^]]+\]", item["legacyId"])
            names = {slot["name"] for slot in item["slots"]}
            self.assertEqual(len(names), len(item["slots"]), item["legacyId"])
            for slot in item["slots"]:
                self.assertIn(slot["type"], allowed, item["legacyId"])
                self.assertTrue(slot["display"] and slot["spoken"], item["legacyId"])
        question_71 = next(item for item in self.data["inspectionQuestions"] if item["legacyId"] == "question-71")
        self.assertEqual(question_71["prompt"], "The driver is out of service until the required rest period is complete.")
        by_legacy = {item["legacyId"]: item for item in self.data["inspectionQuestions"]}
        self.assertIn("thirty-eight thousand two hundred", by_legacy["question-37"]["answer"])
        self.assertIn("four hours and eighteen minutes", by_legacy["question-42"]["answer"])
        self.assertIn("T two zero four", by_legacy["question-16"]["answer"])
        self.assertIn("T R five one eight", by_legacy["question-16"]["answer"])
        self.assertNotIn("four five eight two hours", by_legacy["question-42"]["answer"])

    def test_pronunciations_translations_and_roles(self):
        for key in ("truck", "hotshot"):
            for item in self.data[key]:
                self.assertTrue(item["pronRu"].strip(), item["id"])
                self.assertTrue(item["translationRu"].strip(), item["id"])
                self.assertNotIn("Официальный вопрос или команда", item["translationRu"], item["id"])
                self.assertNotIn("Модель ответа водителя", item["translationRu"], item["id"])
        for item in self.data["truck"]:
            if item["kind"] == "training-prompt":
                self.assertEqual((item["wordRole"], item["exampleRole"]), ("inspector", "driver"))
            if item["kind"] == "training-answer":
                self.assertEqual((item["wordRole"], item["exampleRole"]), ("driver", "inspector"))

    def test_professional_units_and_duplicate_policy(self):
        units = self.data["truck"] + self.data["hotshot"]
        self.assertEqual(len(units), 500)
        self.assertEqual(self.data["stats"]["professionalUnits"], 500)
        metadata = self.data["professionalUnits"]
        self.assertEqual(metadata["label"], "500 professional units")
        self.assertIn("not necessarily a unique surface term", metadata["unitPolicy"])
        normalized = [re.sub(r"[^a-z0-9]+", " ", item["word"].casefold()).strip() for item in units]
        self.assertEqual(len(normalized), len(set(normalized)))
        resolved = {item["specializedId"]: item["specializedForm"] for item in metadata["resolvedConceptPairs"]}
        self.assertEqual(resolved["h:trailer-axle"], "Hotshot trailer axle")
        self.assertEqual(resolved["h:axle-weight"], "individual axle weight")

    def test_profile_separation_and_audio_metadata(self):
        situations = {item["legacyId"]: item for item in self.data["situations"]}
        self.assertEqual(situations["situation-14"]["profiles"], ["tractor"])
        self.assertEqual(situations["hotshot-situation-04"]["profiles"], ["hotshot-open"])
        self.assertEqual(situations["hotshot-situation-07"]["profiles"], ["hotshot-enclosed"])
        self.assertEqual(situations["hotshot-situation-08"]["profiles"], ["hotshot-enclosed"])
        hotshot = {item["id"]: item for item in self.data["hotshot"]}
        self.assertEqual(hotshot["h:enclosed-car-trailer"]["profiles"], ["hotshot-enclosed"])
        lessons = {item["legacyId"]: item for item in self.data["lessons"]}
        self.assertEqual(lessons["hotshot-lesson-03"]["profiles"], ["hotshot-open"])
        self.assertEqual(lessons["hotshot-lesson-05"]["profiles"], ["hotshot-enclosed"])
        self.assertEqual(lessons["lesson-02"]["audioProfile"], "phone")
        for item in self.data["situations"]:
            self.assertIn(item["audioProfile"], {"clean", "phone", "roadside"}, item["id"])

    def test_fixed_elp_gate_and_hotshot_wallet_registration(self):
        self.assertEqual(self.data["elpStepOneIds"], [
            "question:pull-into-the-inspection-lane",
            "question:what-is-your-truck-and-trailer-number",
            "question:where-are-you-coming-from",
            "question:where-are-you-going",
            "question:what-are-you-hauling",
            "question:who-do-you-drive-for",
            "question:what-is-your-current-duty-status",
        ])
        blueprint = self.data["elpStepOneBlueprint"]
        self.assertEqual(blueprint["version"], "seven-functions-v1")
        self.assertEqual(blueprint["requiredResponses"], 7)
        self.assertFalse(blueprint["officialAssessment"])
        self.assertEqual(
            [item["questionId"] for item in blueprint["functions"]],
            self.data["elpStepOneIds"],
        )
        question_ids = {item["id"] for item in self.data["inspectionQuestions"]}
        self.assertLessEqual(set(self.data["elpStepOneIds"]), question_ids)
        questions = {item["id"]: item for item in self.data["inspectionQuestions"]}
        duty_status = questions["question:what-is-your-current-duty-status"]
        self.assertEqual(duty_status["profiles"], ["tractor", "hotshot-open", "hotshot-enclosed"])
        self.assertEqual(duty_status["conditions"], [])
        q12_open = questions["question:what-are-you-hauling"]["profileMaterializations"]["hotshot-open"]
        q12_slot = q12_open["slots"][0]
        self.assertEqual(q12_slot["display"], "vehicles")
        self.assertFalse(q12_slot["countRequired"])
        self.assertEqual(q12_slot["category"], "transported-vehicles")
        self.assertIn("cars", q12_slot["accepted"])
        self.assertEqual(q12_slot["rejectedCategories"], ["packaged-food"])
        self.assertEqual(q12_open["answerDisplay"], "I am hauling vehicles.")
        self.assertNotIn("two", q12_open["answerDisplay"].casefold())
        self.assertFalse(q12_open["responseRubric"]["countRequired"])
        self.assertEqual(q12_open["responseRubric"]["requiredRatio"], 1)
        wallet = {item["id"]: item for item in self.data["documentWalletAdditions"]}
        pickup = wallet["wallet:pickup-registration"]
        self.assertEqual(pickup["profiles"], ["hotshot-open", "hotshot-enclosed"])
        self.assertEqual(pickup["status"], "carry-or-trip")
        self.assertEqual(pickup["conditions"], ["registration-required"])
        trailer_registration = next(item for item in self.data["documents"] if item["id"] == "document:trailer-registration")
        self.assertEqual(trailer_registration["profiles"], ["tractor"])
        self.assertEqual(set(trailer_registration["equipment"]), {"tractor-trailer", "dry-van"})
        self.assertEqual(trailer_registration["conditions"], ["registration-required"])
        inventory = self.data["applicabilityInventory"]["documents"][trailer_registration["id"]]
        self.assertEqual(inventory, {
            "profiles": ["tractor"],
            "equipment": trailer_registration["equipment"],
            "conditions": ["registration-required"],
        })

    def test_all_lesson_titles_match_the_reviewed_semantic_snapshot(self):
        fields = ("id", "legacyId", "title", "titleRu", "goal", "phrases")
        actual = [{field: item[field] for field in fields} for item in self.data["lessons"]]
        self.assertEqual(len(actual), 21)
        self.assertEqual(actual, self.lesson_title_snapshot)
        self.assertEqual(len({item["id"] for item in actual}), 21)
        by_id = {item["id"]: item["titleRu"] for item in actual}
        self.assertEqual(by_id["lesson:loading-a-vehicle"], "Погрузка автомобиля")
        self.assertEqual(by_id["lesson:pickup-and-delivery-condition"], "Прием и доставка: состояние автомобиля")
        self.assertEqual(by_id["lesson:enclosed-car-trailer"], "Закрытый автовоз: погрузка, обзор и двери")
        source = (EDITION / "scripts" / "build_app.py").read_text(encoding="utf-8")
        self.assertIn("LESSON_TITLES_RU_BY_ID[lesson_id]", source)
        self.assertNotRegex(source, r"LESSON_TITLES_RU\s*\[")

    def test_diagnostic_profile_cargo_contract_scores_only_the_visible_commodity(self):
        contract = self.data["diagnosticProfileCargoMaterializations"]
        self.assertEqual(contract["version"], "cycle3-profile-cargo-v2")
        self.assertEqual(contract["responseTarget"], "commodity-only")
        self.assertTrue(contract["visibleTrailerTypeIsContextOnly"])
        self.assertFalse(contract["trailerTypeResponseRequired"])
        profiles = contract["profiles"]
        self.assertEqual(set(profiles), {"tractor", "hotshot-open", "hotshot-enclosed"})
        for profile, item in profiles.items():
            self.assertTrue(item["visibleContextEn"], profile)
            self.assertRegex(item["visibleContextRu"], r"[А-Яа-яЁё]", profile)
            self.assertTrue(item["trailerType"], profile)
            self.assertEqual(len(item["slots"]), 1, profile)
            self.assertEqual(item["slots"][0]["name"], "commodity", profile)
            self.assertFalse(item["rubric"]["trailerTypeResponseRequired"], profile)
            flattened_groups = " ".join(value for group in item["rubric"]["requiredGroups"] for value in group)
            self.assertNotIn("trailer", flattened_groups.casefold(), profile)
            self.assertNotIn("open", flattened_groups.casefold(), profile)
            self.assertNotIn("enclosed", flattened_groups.casefold(), profile)
        self.assertFalse(profiles["hotshot-open"]["slots"][0]["countRequired"])
        self.assertNotIn("two", profiles["hotshot-open"]["model"].casefold())

    def test_cargo_securement_condition_is_targeted(self):
        truck = {item["id"]: item for item in self.data["truck"]}
        questions = {item["id"]: item for item in self.data["inspectionQuestions"]}
        hotshot = {item["id"]: item for item in self.data["hotshot"]}
        situations = {item["legacyId"]: item for item in self.data["situations"]}
        lessons = {item["legacyId"]: item for item in self.data["lessons"]}

        for item_id in (
            "t:term:cargo-securement",
            "t:term:tie-down-strap",
            "t:question:how-is-the-cargo-secured:prompt",
            "t:question:how-is-the-cargo-secured:answer",
            "t:professional:the-cargo-is-secured-and-the-seal-is-intact",
        ):
            self.assertIn("cargo-securement", truck[item_id]["conditions"], item_id)
        self.assertEqual(questions["question:how-is-the-cargo-secured"]["conditions"], ["cargo-securement"])
        self.assertNotIn("cargo-securement", questions["question:what-are-you-hauling"]["conditions"])
        self.assertNotIn("cargo-securement", truck["t:term:cargo-weight"]["conditions"])
        self.assertNotIn("cargo-securement", truck["t:term:load-bar"]["conditions"])

        h4 = [item for item in hotshot.values() if item["theme"].startswith("H4.")]
        self.assertTrue(h4)
        self.assertTrue(all("cargo-securement" in item["conditions"] for item in h4))
        for item_id in ("h:e-track", "h:soft-loop", "h:wheel-chock"):
            self.assertIn("cargo-securement", hotshot[item_id]["conditions"], item_id)
        self.assertNotIn("cargo-securement", hotshot["h:rear-ramp-door"]["conditions"])
        for legacy_id in ("hotshot-situation-04", "hotshot-situation-08"):
            self.assertIn("cargo-securement", situations[legacy_id]["conditions"], legacy_id)
        self.assertNotIn("cargo-securement", situations["hotshot-situation-07"]["conditions"])
        self.assertIn("cargo-securement", lessons["hotshot-lesson-03"]["conditions"])
        self.assertNotIn("cargo-securement", lessons["hotshot-lesson-05"]["conditions"])

    def test_compliance_metadata_and_samples(self):
        documents = {item["legacyId"]: item for item in self.data["documents"]}
        mec = documents["doc-02"]
        self.assertEqual((mec["effectiveFrom"], mec["effectiveThrough"]), ("2026-04-11", "2026-10-11"))
        hazmat = documents["doc-17"]
        fields = {field["label"]: field["value"] for field in hazmat["fields"]}
        self.assertIn("Total quantity", fields)
        self.assertIn("Number and type of packages", fields)
        self.assertEqual(hazmat["complianceReviewedOn"], "2026-08-21")
        h4 = [item for item in self.data["hotshot"] if item["theme"].startswith("H4.")]
        self.assertTrue(h4)
        self.assertTrue(all(item["securementBranchIds"] == ["vehicle-at-most-10000-lb", "vehicle-over-10000-lb"] for item in h4))
        self.assertTrue(all(any("393.128" in source for source in item["sourceRefs"]) and any("393.130" in source for source in item["sourceRefs"]) for item in h4))
        enclosed = [item for item in self.data["hotshot"] if item["theme"].startswith("H6.")]
        self.assertTrue(all("enclosed-trailer" in item["equipment"] and "enclosed-trailer" not in item["conditions"] for item in enclosed))

    def test_securement_weight_branches_have_distinct_scored_question_and_lesson_keys(self):
        programs = {item["id"]: item for item in self.data["cargoSecurementPrograms"]}
        self.assertEqual(programs["vehicle-at-most-10000-lb"]["assessmentBlueprint"]["minimumTiedowns"], 2)
        self.assertEqual(programs["vehicle-over-10000-lb"]["assessmentBlueprint"]["minimumTiedowns"], 4)
        self.assertTrue(programs["vehicle-over-10000-lb"]["assessmentBlueprint"]["accessoryAndArticulationChecksRequired"])
        question = next(item for item in self.data["inspectionQuestions"] if item["id"] == "question:how-is-the-cargo-secured")
        lesson = next(item for item in self.data["lessons"] if item["id"] == "lesson:securing-transported-vehicles")
        condition_ids = {
            "transported-automobile-or-light-truck-at-most-10000-lb",
            "transported-automobile-or-light-truck-over-10000-lb",
        }
        self.assertEqual(set(question["conditionMaterializations"]), condition_ids)
        self.assertEqual(set(lesson["conditionMaterializations"]), condition_ids)
        expected = {
            "transported-automobile-or-light-truck-at-most-10000-lb": ("393.128", 2, "393.130", 4),
            "transported-automobile-or-light-truck-over-10000-lb": ("393.130", 4, "393.128", 2),
        }
        answers = set()
        for condition_id, values in expected.items():
            branch = question["conditionMaterializations"][condition_id]
            policy = branch["responseRubric"]["branchConflictPolicy"]
            self.assertEqual(
                (policy["requiredRegulation"], policy["requiredMinimumTiedowns"], policy["forbiddenRegulation"], policy["forbiddenMinimumTiedowns"]),
                values,
            )
            self.assertTrue(policy["rejectOtherBranch"] and policy["minimumAnswerStrict"])
            self.assertTrue(branch["visibleStimulus"]["individualVehicleWeightLb"])
            answers.add(branch["answerDisplay"])
            lesson_branch = lesson["conditionMaterializations"][condition_id]
            self.assertEqual(lesson_branch["interaction"]["semanticRubric"]["branchConflictPolicy"], policy)
            self.assertTrue(lesson_branch["assessmentBlueprint"]["crossBranchResponseFails"])
            self.assertTrue(lesson_branch["assessmentBlueprint"]["localAudioDoesNotQualifyBranchKnowledge"])
        self.assertEqual(len(answers), 2)

    def test_cargo_reinspection_has_visible_scored_timing_and_exception_forms(self):
        program = self.data["cargoReinspectionProgram"]
        tasks = {item["id"]: item for item in program["scoredTasks"]}
        expected_ids = {
            "first-50-miles", "next-due-duty-status-change", "next-due-three-hours", "next-due-150-miles",
            "exception-sealed-and-ordered-not-to-open", "exception-inspection-impracticable", "seal-alone-is-not-universal-exception",
        }
        self.assertEqual(set(tasks), expected_ids)
        self.assertEqual(set(program["assessmentBlueprint"]["requiredTaskIds"]), expected_ids)
        self.assertTrue(all(task["visibleStimulus"] and task["modelAnswer"] and task["slots"] for task in tasks.values()))
        self.assertEqual(
            tasks["first-50-miles"]["responseRubric"]["computationPolicy"]["expectedOdometerMiles"],
            120050,
        )
        next_due = [task for task in tasks.values() if task["construct"] == "next-reinspection-earliest-event"]
        self.assertEqual(
            {task["responseRubric"]["earliestEventPolicy"]["expectedEventId"] for task in next_due},
            {"duty-status-change", "three-hours", "one-hundred-fifty-miles"},
        )
        self.assertTrue(all(task["responseRubric"]["earliestEventPolicy"]["mustChooseExactlyOne"] for task in next_due))
        self.assertTrue(all(task["responseRubric"]["earliestEventPolicy"]["rejectAndAsDeadlineLogic"] for task in next_due))
        exceptions = [task for task in tasks.values() if task["construct"] == "paragraph-b4-exception-decision"]
        self.assertEqual({task["responseRubric"]["exceptionDecisionPolicy"]["expectedDecision"] for task in exceptions}, {"exception-applies", "exception-does-not-apply"})
        self.assertTrue(all(task["responseRubric"]["exceptionDecisionPolicy"]["rejectUniversalSealedException"] for task in exceptions))
        self.assertTrue(program["assessmentBlueprint"]["genericRuleStatementFails"])
        self.assertTrue(program["assessmentBlueprint"]["andInsteadOfEarliestFails"])
        self.assertTrue(program["assessmentBlueprint"]["universalSealedExceptionFails"])
        questions = self.data["regulatoryScoredQuestions"]
        self.assertEqual(questions, program["scoredQuestions"])
        self.assertEqual(
            {question["id"] for question in questions},
            {f"question:cargo-reinspection:{task_id}" for task_id in expected_ids},
        )
        self.assertEqual(set(program["scoredQuestionIds"]), {question["id"] for question in questions})
        for question in questions:
            task = tasks[question["scoredTaskId"]]
            self.assertEqual(question["sourceTask"], task)
            self.assertEqual(question["visibleStimulus"], task["visibleStimulus"])
            self.assertEqual(question["promptDisplay"], task["promptEn"])
            self.assertEqual(question["promptSpoken"], task["promptEn"])
            self.assertEqual(question["answerDisplay"], task["modelAnswer"])
            self.assertEqual(question["answerSpoken"], task["modelAnswer"])
            self.assertEqual(question["slots"], task["slots"])
            self.assertEqual(question["responseRubric"], task["responseRubric"])
            self.assertIn(question["category"][0], {"G", "H"})
            self.assertEqual(question["conditions"], ["cargo-securement"])
            self.assertTrue(question["assessmentBlueprint"]["preRevealTypedResponseRequired"])
            self.assertFalse(question["assessmentBlueprint"]["selfScoreAllowed"])

    def test_cargo_reinspection_questions_have_distinct_keyed_typed_transfer_variants(self):
        program = self.data["cargoReinspectionProgram"]
        self.assertEqual(program["assessmentBlueprint"]["requiredPracticeVariantIds"], ["primary", "transfer"])
        self.assertTrue(program["assessmentBlueprint"]["requireDifferentPracticeVariantForConfirmation"])
        tasks = {item["id"]: item for item in program["scoredTasks"]}
        for question in self.data["regulatoryScoredQuestions"]:
            contract = question["practiceContract"]
            self.assertEqual(contract["schemaVersion"], "cycle3-regulatory-typed-v1")
            self.assertEqual(contract["variantsField"], "practiceVariants")
            self.assertEqual(contract["variantIds"], ["primary", "transfer"])
            self.assertEqual(contract["responseMode"], "typed-pre-reveal")
            self.assertTrue(contract["requireDifferentVariantForConfirmation"])
            variants = question["practiceVariants"]
            self.assertEqual(set(variants), {"primary", "transfer"})
            primary = variants["primary"]
            transfer = variants["transfer"]
            for variant_id, variant in variants.items():
                self.assertEqual(variant["id"], variant_id)
                self.assertEqual(variant["variantId"], variant_id)
                self.assertEqual(variant["sourceTaskVariantId"], variant_id)
                self.assertEqual(variant["responseMode"], "typed-pre-reveal")
                self.assertTrue(variant["visibleStimulus"]["trainingSample"])
                self.assertTrue(variant["promptDisplay"])
                self.assertTrue(variant["answerDisplay"])
                self.assertTrue(variant["slots"])
                self.assertTrue(variant["responseRubric"])
            for field in ("visibleStimulus", "promptDisplay", "promptRu", "answerDisplay", "answerRu", "slots", "responseRubric", "semanticFingerprint"):
                self.assertNotEqual(primary[field], transfer[field], f"{question['id']}:{field}")
            self.assertEqual(question["promptDisplay"], primary["promptDisplay"])
            self.assertEqual(question["answerDisplay"], primary["answerDisplay"])
            self.assertEqual(question["visibleStimulus"], primary["visibleStimulus"])
            self.assertEqual(question["slots"], primary["slots"])
            self.assertEqual(question["responseRubric"], primary["responseRubric"])
            source_task = tasks[question["scoredTaskId"]]
            self.assertEqual(question["sourceTask"], source_task)
            self.assertEqual(set(source_task["practiceVariants"]), {"primary", "transfer"})
            self.assertEqual(
                {key: row["semanticFingerprint"] for key, row in source_task["practiceVariants"].items()},
                {key: row["semanticFingerprint"] for key, row in variants.items()},
            )
            construct = question["construct"]
            for variant in variants.values():
                if construct == "initial-reinspection-deadline":
                    expected = variant["responseRubric"]["computationPolicy"]["expectedOdometerMiles"]
                    due_slot = next(slot for slot in variant["slots"] if slot["name"] == "due-odometer")
                    self.assertEqual(int(due_slot["display"].replace(",", "")), expected)
                    self.assertEqual(
                        variant["visibleStimulus"]["tripStartOdometerMiles"]
                        + variant["responseRubric"]["computationPolicy"]["deadlineMiles"],
                        expected,
                    )
                elif construct == "next-reinspection-earliest-event":
                    policy = variant["responseRubric"]["earliestEventPolicy"]
                    event_slot = next(slot for slot in variant["slots"] if slot["name"] == "next-due-event")
                    time_slot = next(slot for slot in variant["slots"] if slot["name"] == "next-due-time")
                    self.assertEqual(event_slot["display"], policy["expectedEventId"])
                    self.assertIn(time_slot["display"], variant["answerDisplay"])
                else:
                    policy = variant["responseRubric"]["exceptionDecisionPolicy"]
                    decision_slot = next(slot for slot in variant["slots"] if slot["name"] == "exception-decision")
                    self.assertEqual(decision_slot["display"], policy["expectedDecision"])

    def test_every_document_requires_reading_two_distinct_visible_instances(self):
        for document in self.data["documents"]:
            instances = document["trainingInstances"]
            self.assertGreaterEqual(len(instances), 2, document["id"])
            self.assertEqual(len({row["answerKey"] for row in instances}), len(instances), document["id"])
            self.assertTrue(all(row["visibleStimulus"]["fields"] for row in instances), document["id"])
            expected = {row["id"]: row["answerKey"] for row in instances}
            self.assertEqual(document["assessmentBlueprint"]["answerKeyByInstanceId"], expected)

    def test_current_eld_packet_and_generated_instructions(self):
        documents = {item["legacyId"]: item for item in self.data["documents"]}
        manual = documents["doc-09"]
        self.assertEqual(manual["status"], "training")
        self.assertEqual(manual["conditions"], ["eld-required"])
        self.assertFalse(manual["federallyRequiredOnboard"])
        self.assertTrue(manual["optionalDeviceHelp"])
        self.assertEqual(manual["effectiveFrom"], "2026-07-22")
        self.assertTrue(any("section-395.22" in source for source in manual["sourceRefs"]))
        self.assertTrue(any("2026-12448" in source for source in manual["sourceRefs"]))

        packet = self.data["eldInformationPacket"]
        self.assertEqual(packet["requiredDocumentIds"], [
            "document:eld-transfer-instructions",
            "document:eld-malfunction-instructions",
            "document:blank-paper-rods",
        ])
        self.assertEqual(packet["minimumBlankGraphGridDays"], 8)
        self.assertEqual(packet["optionalDeviceHelpDocumentIds"], [manual["id"]])
        self.assertEqual(documents["doc-12"]["minimumBlankDays"], 8)
        instructions = " ".join(item["text"] for item in documents["doc-11"]["instructions"])
        for phrase in ("within 24 hours", "current 24-hour period", "previous seven consecutive days", "manual paper RODS", "within eight days"):
            self.assertIn(phrase, instructions)
        self.assertEqual(documents["doc-13"]["recordWindow"], "current 24-hour period plus previous 7 consecutive days")

        transfer_instances = {
            row["id"].rsplit(":", 1)[-1]: row
            for row in documents["doc-10"]["trainingInstances"]
        }
        method_sets = {
            "sample-a": {"Web Services", "Email"},
            "sample-b": {"USB 2.0", "Bluetooth"},
        }
        all_methods = set().union(*method_sets.values())
        for instance_id, supported in method_sets.items():
            visible = json.dumps(transfer_instances[instance_id]["visibleStimulus"], ensure_ascii=False)
            self.assertEqual({method for method in all_methods if method in visible}, supported)
        sample_b = json.dumps(transfer_instances["sample-b"]["visibleStimulus"], ensure_ascii=False)
        self.assertNotIn("Web Services", sample_b)
        self.assertNotIn("Email", sample_b)

    def test_cdl_and_optional_eld_help_have_explicit_applicability(self):
        documents = {item["id"]: item for item in self.data["documents"]}
        cdl = documents["document:commercial-drivers-license"]
        manual = documents["document:eld-user-manual-locator"]
        self.assertEqual(cdl["conditions"], ["cdl-required"])
        self.assertEqual(manual["conditions"], ["eld-required"])
        self.assertFalse(manual["federallyRequiredOnboard"])
        self.assertTrue(manual["optionalDeviceHelp"])

    def test_all_situations_have_information_gap_and_semantic_branches(self):
        positions = set()
        distractor_texts = []
        distractor_pairs = set()
        correct_longest = 0
        branching = 0
        for item in self.data["situations"]:
            contract = item["practiceContract"]
            self.assertEqual({variant["id"] for variant in contract["variants"]}, {"primary", "transfer"})
            self.assertNotEqual(
                (contract["variants"][0]["prompt"], contract["variants"][0]["modelAnswer"]),
                (contract["variants"][1]["prompt"], contract["variants"][1]["modelAnswer"]),
            )
            for variant in contract["variants"]:
                expected_slots = 2 if item["id"] in {"situation:elp-interview", "situation:roadside-breakdown"} else 1
                self.assertEqual(len(variant["slotValues"]), expected_slots)
                for slot in variant["slotValues"]:
                    self.assertIn(slot["display"].casefold(), variant["modelAnswer"].casefold())
                    self.assertIsInstance(slot["turnIds"], list)
                self.assertNotRegex(variant["modelAnswer"].casefold(), r"\bthe each\b")
            if item["id"] == "situation:scale-and-axle-weights":
                self.assertEqual({variant["slotValues"][0]["type"] for variant in contract["variants"]}, {"lexical-request"})
            if item["id"] == "situation:highway-and-dynamic-signs":
                transfer = next(variant for variant in contract["variants"] if variant["id"] == "transfer")
                self.assertIn("left lane is closed", transfer["modelAnswer"].casefold())
                self.assertNotIn("right lane is closed", transfer["modelAnswer"].casefold())
            typed = contract["typedDriverTurn"]
            self.assertTrue(typed["required"] and typed["preRevealRequired"])
            self.assertTrue(typed["semanticRubric"]["requiredConceptGroups"])
            self.assertTrue(typed["semanticRubric"]["requiredVariantSlot"])
            self.assertEqual(contract["failureBranch"]["result"], "retry-required")
            self.assertEqual(contract["transferVariant"]["availableAfter"], "corrected-retrieval")
            choice = contract["choiceCheck"]
            option_ids = [option["id"] for option in choice["options"]]
            positions.add(option_ids.index(choice["correctOptionId"]))
            correct = next(option for option in choice["options"] if option["id"] == choice["correctOptionId"])
            self.assertEqual(correct["result"], "success")
            self.assertRegex(correct["text"], r"[А-Яа-яЁё]")
            self.assertNotEqual(correct["text"], typed["modelAnswer"])
            wrong = [option for option in choice["options"] if option["id"] != choice["correctOptionId"]]
            self.assertEqual({option["distractorType"] for option in wrong}, {"unsafe-action", "critical-step-omission"})
            self.assertTrue(all(len(option["text"]) >= 45 for option in wrong))
            self.assertLessEqual(max(map(lambda option: len(option["text"]), choice["options"])) / min(map(lambda option: len(option["text"]), choice["options"])), 2)
            distractor_texts.extend(option["text"].casefold() for option in wrong)
            distractor_pairs.add(tuple(sorted(option["text"].casefold() for option in wrong)))
            correct_longest += len(correct["text"]) == max(len(option["text"]) for option in choice["options"])
            self.assertEqual({option["result"] for option in choice["options"]}, {"success", "unsafe-failure", "irrelevant"})
            self.assertEqual(len(contract["criticalTurns"]), 2)
            self.assertEqual(len(contract["semanticCorpus"]), 4)
            self.assertTrue(contract["completionBlueprint"]["failIfAnyCriticalTurnMissing"])
            self.assertTrue(contract["safetyDecision"]["randomizeOptions"])
            branching += contract["branchingPractice"]
        self.assertEqual(positions, {0, 1, 2})
        self.assertEqual(len(distractor_texts), len(set(distractor_texts)), 80)
        self.assertEqual(len(distractor_pairs), 40)
        self.assertLessEqual(correct_longest, 13)
        self.assertEqual(branching, 40)

    def test_situation_outcomes_and_prompt_audio_are_exhaustive(self):
        source = (EDITION / "app" / "data" / "audio-data.js").read_text(encoding="utf-8").strip()
        prefix = "window.TRUCK_AUDIO_DATA = "
        self.assertTrue(source.startswith(prefix) and source.endswith(";"))
        lookup = json.loads(source[len(prefix):-1])["lookup"]
        prompt_turns = 0
        outcomes = 0
        for item in self.data["situations"]:
            contract = item["practiceContract"]
            listening = contract["listeningBlueprint"]
            eligible = set()
            excluded = set()
            for variant in contract["variants"]:
                outcome = contract["workplaceOutcome"]["expectedByVariant"][variant["id"]]
                self.assertNotIn(outcome["modelAnswer"].strip().casefold(), {
                    turn["modelAnswer"].strip().casefold() for turn in variant["criticalTurns"]
                }, f"{item['id']}:{variant['id']}")
                self.assertEqual(outcome["canonicalNaturalAnswer"], outcome["modelAnswer"])
                self.assertNotIn("this confirms the completed workplace result", outcome["modelAnswer"].casefold())
                rubric_tokens = {
                    value.casefold()
                    for group in outcome["responseRubric"]["requiredGroups"]
                    for value in group
                }
                self.assertFalse(rubric_tokens & {"with", "complete", "completed", "completion", "workplace", "result", "outcome"})
                semantic_content = outcome["semanticContent"]
                self.assertEqual(
                    [row["accepted"] for row in semantic_content],
                    outcome["responseRubric"]["requiredGroups"],
                )
                self.assertTrue(all(
                    row["accepted"] and (row.get("contextRequired") or row["accepted"][0] == row["canonical"])
                    for row in semantic_content
                ))
                contextual = {
                    row["canonical"]: row["accepted"]
                    for row in semantic_content if row.get("contextRequired")
                }
                if item["id"] == "situation:roadside-stop":
                    self.assertEqual(contextual, {"stopped": ["vehicle stopped", "truck pulled over", "unit stationary"]})
                if item["id"] == "situation:hours-and-eld-inspection":
                    self.assertEqual(contextual, {"current": ["current duty status", "current records", "today's duty status"]})
                self.assertTrue(outcome["responseRubric"]["rejectExactCriticalTurnReplay"])
                self.assertEqual(
                    [slot["name"] for slot in outcome["slotValues"]],
                    [slot["name"] for slot in variant["slotValues"]],
                )
                self.assertTrue(all(slot["requiredInOutcome"] for slot in outcome["slotValues"]))
                outcomes += 1
                for turn in variant["criticalTurns"]:
                    prompt_turns += 1
                    ref = f"{variant['id']}:{turn['id']}"
                    expected_sources = lookup.get(f"{turn['promptRole']}\0{turn['prompt']}", {})
                    self.assertEqual(turn["promptAudio"]["sources"], expected_sources, f"{item['id']}:{ref}")
                    if expected_sources:
                        self.assertTrue(turn["promptAudio"]["eligible"], f"{item['id']}:{ref}")
                        self.assertTrue(all((EDITION / "app" / path).is_file() for path in expected_sources.values()))
                        eligible.add(ref)
                    else:
                        self.assertFalse(turn["promptAudio"]["eligible"], f"{item['id']}:{ref}")
                        self.assertEqual(turn["promptAudio"]["exclusionReason"], "no-exact-local-file")
                        excluded.add(ref)
            self.assertEqual(set(listening["eligibleTurnRefs"]), eligible)
            self.assertEqual(set(listening["excludedTurnRefs"]), excluded)
            self.assertFalse(listening["webSpeechQualifying"])
            self.assertTrue(listening["excludeUnsupportedFromSelector"])
        self.assertEqual(prompt_turns, 160)
        self.assertEqual(outcomes, 80)

    def test_breakdown_has_branch_specific_scored_placement_contracts(self):
        situation = next(item for item in self.data["situations"] if item["id"] == "situation:roadside-breakdown")
        contract = situation["practiceContract"]
        task = contract["breakdownPlacementTask"]
        self.assertEqual({row["id"] for row in task["scenarioVariants"]}, {"ordinary-road", "divided-or-one-way", "hill-or-curve"})
        self.assertTrue(task["missingSequenceOrPlacementFails"])
        rows = {
            row["variantId"]: row
            for row in contract["semanticCorpus"]
            if row["turnId"] == "turn-2"
        }
        expected = {
            "primary": ("divided-or-one-way", [10, 100, 200], "exact-set"),
            "transfer": ("hill-or-curve", [100, 500], "range-endpoints"),
        }
        for variant_id, values in expected.items():
            policy = rows[variant_id]["responseRubric"]["branchConflictPolicy"]
            self.assertEqual((policy["exclusiveBranchId"], policy["requiredDistanceValuesFeet"], policy["distanceMode"]), values)
            self.assertTrue(policy["rejectUnexpectedDistanceValues"])
            self.assertTrue(policy["requiredBranchCues"])
            self.assertTrue(policy["forbiddenBranchCues"])
            self.assertEqual({slot["name"] for slot in rows[variant_id]["typedSlots"]}, {"warning-deadline", "warning-placement", "road-branch"})

    def test_elp_situation_has_profile_specific_cargo_and_turn_ownership(self):
        situation = next(item for item in self.data["situations"] if item["id"] == "situation:elp-interview")
        materializations = situation["profileMaterializations"]
        self.assertEqual(set(materializations), {"tractor", "hotshot-open", "hotshot-enclosed"})
        expected = {
            "tractor": {"22 pallets of packaged food", "20 pallets of bottled water"},
            "hotshot-open": {"two vehicles", "three vehicles"},
            "hotshot-enclosed": {"one passenger vehicle", "one SUV"},
        }
        for profile, values in expected.items():
            variants = materializations[profile]["practiceContract"]["variants"]
            slots = [slot for variant in variants for slot in variant["slotValues"] if slot["name"] == "commodity"]
            self.assertEqual({slot["display"] for slot in slots}, values)
            self.assertTrue(all(slot["turnIds"] == ["turn-2"] for slot in slots))
            if profile != "tractor":
                text = json.dumps(materializations[profile]).casefold()
                self.assertNotIn("packaged food", text)
                self.assertNotIn("pallet", text)

    def test_all_lessons_have_goal_grounded_interaction_prompts_and_keys(self):
        for lesson in self.data["lessons"]:
            blueprint = lesson["assessmentBlueprint"]
            interaction = blueprint["interaction"]
            phrase_ids = {f"phrase-{index}" for index in range(1, len(lesson["phrases"]) + 1)}
            self.assertTrue(interaction["promptEn"], lesson["id"])
            self.assertRegex(interaction["promptRu"], r"[А-Яа-яЁё]", lesson["id"])
            self.assertTrue(set(interaction["requiredResponsePhraseIds"]) <= phrase_ids, lesson["id"])
            self.assertEqual(interaction["responseKeySource"], "materialized-lesson-phrases")
            self.assertEqual(interaction["semanticRubric"]["goalRu"], lesson["goal"])
            self.assertEqual(interaction["semanticRubric"]["requiredResponseCoverage"], 1)
            completion = blueprint["completion"]
            self.assertEqual(completion["requiredSpacedConstructVariants"], ["reception-only", "production-interaction"], lesson["id"])
            self.assertEqual(completion["minimumHoursBetweenConstructs"], 24, lesson["id"])
            self.assertFalse(completion["sameAttemptMayQualifyBothConstructVariants"], lesson["id"])
            self.assertEqual(completion["constructVariantContracts"]["reception-only"], {
                "requiredSubcontracts": ["reception"],
                "mustBeFirst": True,
                "localAudioRequired": True,
                "priorRussianProductionCueAllowed": False,
                "productionOrInteractionRequired": False,
            }, lesson["id"])
            self.assertEqual(completion["constructVariantContracts"]["production-interaction"], {
                "requiredSubcontracts": ["production", "interaction"],
                "requiresPriorVariant": "reception-only",
                "localAudioAllowed": False,
                "minimumHoursAfterPriorVariant": 24,
            }, lesson["id"])

        documents_lesson = next(item for item in self.data["lessons"] if item["legacyId"] == "lesson-12")
        for profile in ("hotshot-open", "hotshot-enclosed"):
            text = " ".join(documents_lesson["profilePhrases"][profile]).casefold()
            self.assertNotIn("tractor", text)
            self.assertIn("trailer registration", text)

    def test_known_malformed_strings_are_absent(self):
        content = json.dumps(self.data, ensure_ascii=False)
        for value in (
            "Прицеп готов к погрузки",
            "Yes. I have tanker.",
            "a.m..",
            "Ваш погрузки",
            "погрузки number",
            "погрузочной площадки door",
            "Please print the each axle weight separately.",
        ):
            self.assertNotIn(value, content)
        self.assertNotRegex(content, r"\b(?:a|p)\.m\.\.")
        code_switch = re.compile(
            r"\b(?:pickup|delivery|dock|check-in|mile\s+marker|shipper|roadside\s+service|truck\s+space|tandems)\b",
            re.IGNORECASE,
        )
        for item in self.data["situations"]:
            for line in item["dialogue"]:
                self.assertNotRegex(line["translation"], code_switch, item["id"])


if __name__ == "__main__":
    unittest.main()
