import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"


class AudioCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.course = json.loads((APP / "data" / "course-data.json").read_text(encoding="utf-8"))
        cls.manifest = json.loads((APP / "data" / "audio-manifest.json").read_text(encoding="utf-8"))
        cls.catalog_seed = json.loads((ROOT / "production" / "audio-catalog-seed.json").read_text(encoding="utf-8"))
        cls.master_seeds = json.loads((ROOT / "production" / "audio-master-seeds.json").read_text(encoding="utf-8"))
        cls.production = json.loads((APP / "data" / "audio-production-report.json").read_text(encoding="utf-8"))

    def test_requirements_use_materialized_text_and_current_ids(self):
        requirements = self.manifest["currentRequirements"]
        self.assertTrue(requirements)
        self.assertFalse(any("[" in item["text"] or "]" in item["text"] for item in requirements))
        question_ids = {item["id"] for item in self.course["inspectionQuestions"]}
        prompt_ids = {item["sourceId"] for item in requirements if item["sourceType"] == "inspection-question" and item["field"] == "prompt"}
        self.assertEqual(prompt_ids, question_ids)

    def test_question_71_materialization_and_roles(self):
        question = self.course["inspectionQuestions"][70]
        requirements = [item for item in self.manifest["currentRequirements"] if item["sourceId"] == question["id"]]
        prompt = next(item for item in requirements if item["field"] == "prompt")
        answer = next(item for item in requirements if item["field"] == "answer")
        self.assertIn("required rest period", prompt["text"])
        self.assertEqual(prompt["role"], "inspector")
        self.assertEqual(answer["role"], "driver")

    def test_corrected_signs_use_new_exact_audio(self):
        corrected = {item["id"] for item in self.course["signs"] if item.get("audioSourceId") is None}
        requirements = [item for item in self.manifest["currentRequirements"] if item["sourceType"] == "sign" and item["sourceId"] in corrected]
        self.assertEqual(len(corrected), 11)
        self.assertTrue(requirements)
        self.assertTrue(all(item["available"] and item["path"] and not item["fallback"] for item in requirements))

    def test_no_runtime_staging_path(self):
        self.assertFalse(any("audio/.staging" in item["stagingPath"] for item in self.manifest["synthesisMasters"]))

    def test_immutable_catalog_and_master_hashes_are_complete(self):
        self.assertEqual(len(self.catalog_seed["synthesisMasters"]), 1450)
        self.assertEqual(len(self.catalog_seed["deliverables"]), 1466)
        self.assertEqual(sum(item["characters"] for item in self.catalog_seed["synthesisMasters"]), 52661)
        catalog_rows = self.catalog_seed["synthesisMasters"] + self.catalog_seed["deliverables"]
        self.assertFalse(any(item["text"] == "Yes. I have tanker." for item in catalog_rows))
        self.assertFalse(any("a.m.." in item["text"].casefold() or "p.m.." in item["text"].casefold() for item in catalog_rows))
        self.assertEqual(sum(item["text"] == "Yes. I have a tanker endorsement." for item in self.catalog_seed["synthesisMasters"]), 2)
        self.assertEqual(self.master_seeds["masterCount"], 1450)
        self.assertEqual(len(self.master_seeds["masters"]), 1450)
        manifest_keys = {item["synthesisKey"] for item in self.manifest["synthesisMasters"]}
        self.assertEqual({item["synthesisKey"] for item in self.master_seeds["masters"]}, manifest_keys)
        total = 0
        for item in self.master_seeds["masters"]:
            path = ROOT / item["path"]
            self.assertEqual(path.stat().st_size, item["bytes"])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), item["sha256"])
            total += path.stat().st_size
        self.assertEqual(total, self.master_seeds["totalBytes"])

    def test_all_runtime_deliverables_match_production_hashes(self):
        expected = self.production["deliverableSha256"]
        self.assertEqual(set(expected), {item["renderKey"] for item in self.manifest["deliverables"]})
        for item in self.manifest["deliverables"]:
            path = APP / item["path"]
            self.assertTrue(path.is_file() and path.stat().st_size > 1024)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected[item["renderKey"]])

    def test_runtime_declares_all_three_profiles_without_paid_calls(self):
        source = (APP / "data" / "audio-data.js").read_text(encoding="utf-8")
        payload = json.loads(source[len("window.TRUCK_AUDIO_DATA = "):-2])
        self.assertEqual(payload["audioProfilesAvailable"], ["clean", "phone", "roadside"])
        report = json.loads((APP / "data" / "audio-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["paidApiCalls"], 0)
        self.assertEqual(report["browserSpeechFallbackRequirements"], 0)
        self.assertIn("driver\0Could you repeat that more slowly, please?", payload["lookup"])
        app_source = (APP / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("speechSynthesis", app_source)


if __name__ == "__main__":
    unittest.main()
