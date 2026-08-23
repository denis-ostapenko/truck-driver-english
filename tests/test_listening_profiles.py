import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


class ListeningProfilesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.course = json.loads((APP / "data" / "course-data.json").read_text(encoding="utf-8"))
        cls.listening = json.loads((APP / "data" / "listening-data.json").read_text(encoding="utf-8"))

    def test_all_75_prompts_have_three_distinct_local_assets(self):
        self.assertEqual(self.listening["audioProfilesAvailable"], ["clean", "phone", "roadside"])
        self.assertEqual(len(self.listening["profiles"]), 75)
        self.assertEqual(set(self.listening["profiles"]), {item["id"] for item in self.course["inspectionQuestions"]})
        for item in self.listening["profiles"].values():
            paths = [APP / item[name] for name in ("clean", "phone", "roadside")]
            self.assertTrue(all(path.is_file() and path.stat().st_size > 1024 for path in paths))
            hashes = {hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
            self.assertEqual(len(hashes), 3)
            self.assertEqual(item["prompt"]["role"], "inspector")
            self.assertEqual(item["prompt"]["spokenText"], item["spokenText"])
            for name, path in zip(("clean", "phone", "roadside"), paths):
                self.assertEqual(item["prompt"]["qa"]["sha256"][name], hashlib.sha256(path.read_bytes()).hexdigest())
                self.assertEqual(item["prompt"]["qa"]["bytes"][name], path.stat().st_size)
                self.assertGreater(item["prompt"]["qa"]["durationMs"][name], 0)
            self.assert_acoustically_distinct(item["prompt"]["qa"])

    def test_question_71_has_materialized_spoken_mapping(self):
        question = self.course["inspectionQuestions"][70]
        profile = self.listening["profiles"][question["id"]]
        self.assertNotIn("[", profile["spokenText"])
        self.assertIn("required rest period", profile["spokenText"])

    def test_mandatory_driver_answers_have_typed_slots_and_distinct_profiles(self):
        expected = {
            "question-15": {"time", "date"},
            "question-37": {"weight-cardinal"},
            "question-42": {"duration-hours", "duration-minutes"},
            "question-64": {"pressure"},
            "question-71": {"oos-condition"},
        }
        questions = {item["legacyId"]: item for item in self.course["inspectionQuestions"]}
        expected_ids = {questions[legacy_id]["id"] for legacy_id in expected}
        self.assertEqual(set(self.listening["driverAnswerQuestionIds"]), expected_ids)
        for legacy_id, slot_types in expected.items():
            question = questions[legacy_id]
            answer = self.listening["profiles"][question["id"]]["driverAnswer"]
            self.assertEqual(answer["role"], "driver")
            self.assertEqual(answer["spokenText"], question["answer"])
            self.assertEqual({slot["type"] for slot in answer["semanticExpectedSlots"]}, slot_types)
            names = {slot["name"] for slot in answer["semanticExpectedSlots"]}
            self.assertEqual(set(answer["semanticRubric"]["requiredSlotNames"]), names)
            self.assertTrue(answer["semanticRubric"]["rejectPromptEcho"])
            self.assertTrue(answer["semanticRubric"]["rejectAffirmationOnly"])
            self.assertEqual(set(answer["slotFeedbackRu"]), names)
            paths = [APP / answer[name] for name in ("clean", "phone", "roadside")]
            self.assertTrue(all(path.is_file() and path.stat().st_size > 1024 for path in paths))
            self.assertEqual(len({hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}), 3)
            for name, path in zip(("clean", "phone", "roadside"), paths):
                self.assertEqual(answer["qa"]["sha256"][name], hashlib.sha256(path.read_bytes()).hexdigest())
                self.assertEqual(answer["qa"]["bytes"][name], path.stat().st_size)
                self.assertGreater(answer["qa"]["durationMs"][name], 0)
            self.assert_acoustically_distinct(answer["qa"])

        q71 = self.listening["profiles"][questions["question-71"]["id"]]["driverAnswer"]
        self.assertIn("required rest period is complete", q71["spokenText"])

    def test_no_paid_api_was_used(self):
        self.assertEqual(self.listening["paidApiCalls"], 0)

    def assert_acoustically_distinct(self, qa):
        signal = qa["signalQa"]
        self.assertEqual(signal["sampleRateHz"], 16000)
        self.assertEqual(set(signal["rmsDbfs"]), {"clean", "phone", "roadside"})
        self.assertTrue(all(-30 < level < -10 for level in signal["rmsDbfs"].values()))
        self.assertTrue(all(-20 < level <= 0 for level in signal["peakDbfs"].values()))
        self.assertEqual(set(signal["pairwiseCorrelation"]), {"cleanPhone", "cleanRoadside", "phoneRoadside"})
        self.assertEqual(set(signal["pairwiseDifferenceRmsDbfs"]), {"cleanPhone", "cleanRoadside", "phoneRoadside"})
        self.assertTrue(all(abs(value) < 0.997 for value in signal["pairwiseCorrelation"].values()))
        self.assertTrue(all(value > -45 for value in signal["pairwiseDifferenceRmsDbfs"].values()))


if __name__ == "__main__":
    unittest.main()
