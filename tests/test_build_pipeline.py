import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
SOURCE_CORE = next(
    candidate for candidate in (
        PROJECT / "data" / "learning_core_1000.json",
        ROOT / "data" / "learning_core_1000.json",
    ) if candidate.is_file()
)
SPEC = importlib.util.spec_from_file_location("truck_build_app", ROOT / "scripts" / "build_app.py")
BUILD_APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD_APP)


class BuildPipelineTests(unittest.TestCase):
    def test_unknown_pronunciation_token_fails_without_grapheme_fallback(self):
        with self.assertRaisesRegex(ValueError, "Unknown pronunciation token"):
            BUILD_APP._pronounce_word("definitelyunknownzz")

    def test_required_pronunciation_corrections(self):
        expected = {
            "but": "бат",
            "cut": "кат",
            "rub": "раб",
            "vehicle": "вИэкэл",
            "out-of-service": "аут-эв-сЁрвис",
            "overage": "Оувэридж",
            "heavy-duty": "хЭви-дьюти",
            "over-the-tire": "Оувэр-зэ-тАйэр",
            "driver-side": "дрАйвэр-сайд",
            "e-track": "И-трэк",
        }
        for token, value in expected.items():
            with self.subTest(token=token):
                self.assertEqual(BUILD_APP._pronounce_word(token), value)

    def test_clean_build_is_byte_deterministic_for_explicit_date_and_source_date_epoch(self):
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / "english-basic-app"
            edition = project / "truck-driver-edition"
            (project / "data").mkdir(parents=True)
            shutil.copy2(SOURCE_CORE, project / "data" / "learning_core_1000.json")
            (edition / "scripts").mkdir(parents=True)
            shutil.copy2(ROOT / "scripts" / "build_app.py", edition / "scripts" / "build_app.py")
            for name in ("03_SITUATION_MATRIX.md", "07_INSPECTIONS_AND_OFFICIAL_QUESTIONS.md", "09_TRUCK_TERMINOLOGY.md"):
                shutil.copy2(ROOT / name, edition / name)
            shutil.copytree(ROOT / "document-samples", edition / "document-samples")
            (edition / "data").mkdir()
            for name in ("hotshot-module.json", "pronunciation-lexicon.json", "fhwa-sign-provenance-source.json"):
                shutil.copy2(ROOT / "data" / name, edition / "data" / name)
            (edition / "app" / "data").mkdir(parents=True)
            for name in ("content-id-migrations.json", "visual-assets.json", "audio-data.js"):
                shutil.copy2(ROOT / "app" / "data" / name, edition / "app" / "data" / name)
            shutil.copytree(ROOT / "app" / "assets" / "signs", edition / "app" / "assets" / "signs")

            environment = os.environ.copy()
            environment["PYTHONDONTWRITEBYTECODE"] = "1"
            command = [sys.executable, "scripts/build_app.py", "--built-on", "2026-08-21"]
            subprocess.run(command, cwd=edition, env=environment, check=True, capture_output=True, text=True)
            names = ("course-data.json", "course-data.js", "build-report.json", "fhwa-sign-provenance.json")
            first = {name: (edition / "app" / "data" / name).read_bytes() for name in names}

            environment["SOURCE_DATE_EPOCH"] = str(int(datetime(2026, 8, 21, tzinfo=timezone.utc).timestamp()))
            subprocess.run([sys.executable, "scripts/build_app.py"], cwd=edition, env=environment, check=True, capture_output=True, text=True)
            second = {name: (edition / "app" / "data" / name).read_bytes() for name in names}
            self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
