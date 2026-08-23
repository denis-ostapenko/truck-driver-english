import hashlib
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path


EDITION = Path(__file__).resolve().parents[1]
APP = EDITION / "app"
RELEASE = EDITION / "release"
SITE = RELEASE / "cloudflare-pages"
ARCHIVE = RELEASE / "truck-driver-english-public-2026-08-23.zip"
MANIFEST = RELEASE / "release-manifest.json"
ROOT_FILES = {
    "_headers",
    "_worker.js",
    "LICENSE",
    "NOTICE",
    "USER_GUIDE_BE.md",
    "USER_GUIDE_RU.md",
    "USER_GUIDE_UK.md",
    "guide.html",
    "index.html",
    "styles.css",
    "app.js",
    "app-core.js",
    "learning-evaluator.js",
    "state-store.js",
    "recorder-controller.js",
    "manifest.webmanifest",
    "robots.txt",
    "sitemap.xml",
    "sw.js",
}
DATA_FILES = {
    "data/course-data.js",
    "data/listening-data.js",
    "data/audio-data.js",
}
MEDIA_EXTENSIONS = {
    "audio": {".mp3"},
    "images": {".webp"},
    "assets": {".svg"},
}


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def selected_files():
    paths = [APP / name for name in sorted(ROOT_FILES | DATA_FILES)]
    for directory, extensions in MEDIA_EXTENSIONS.items():
        paths.extend(
            path for path in sorted((APP / directory).rglob("*"))
            if path.is_file() and path.suffix.casefold() in extensions
        )
    missing = [path.relative_to(APP).as_posix() for path in paths if not path.is_file()]
    if missing:
        raise ValueError(f"Missing release files: {missing}")
    return paths


def main():
    if SITE.exists() or ARCHIVE.exists() or MANIFEST.exists():
        raise SystemExit("Release outputs already exist. Move the reviewed release aside before rebuilding.")
    SITE.mkdir(parents=True)
    rows = []
    for source in selected_files():
        relative = source.relative_to(APP)
        target = SITE / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        rows.append({
            "path": relative.as_posix(),
            "bytes": target.stat().st_size,
            "sha256": file_sha256(target),
        })

    largest = max(rows, key=lambda item: item["bytes"])
    if len(rows) > 20000:
        raise ValueError("Cloudflare Pages Wrangler file limit exceeded")
    if largest["bytes"] > 25 * 1024 * 1024:
        raise ValueError(f"Cloudflare Pages per-file limit exceeded: {largest['path']}")

    fixed_time = datetime(2026, 8, 23, 12, 0, 0).timetuple()[:6]
    with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for row in rows:
            path = SITE / row["path"]
            info = zipfile.ZipInfo(row["path"], fixed_time)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())

    report = {
        "version": 1,
        "builtOn": "2026-08-23",
        "source": "truck-driver-edition/app allowlisted runtime files only",
        "siteDirectory": SITE.relative_to(EDITION).as_posix(),
        "archive": ARCHIVE.relative_to(EDITION).as_posix(),
        "archiveBytes": ARCHIVE.stat().st_size,
        "archiveSha256": file_sha256(ARCHIVE),
        "fileCount": len(rows),
        "totalBytes": sum(item["bytes"] for item in rows),
        "largestFile": largest,
        "cloudflarePagesLimits": {"wranglerFiles": 20000, "maximumFileBytes": 25 * 1024 * 1024},
        "excludedFromRelease": [
            "app/server.py",
            "app/README.md",
            "app/data/*.json",
            "all production masters, generators, tests, and internal documentation",
        ],
        "files": rows,
    }
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("fileCount", "totalBytes", "largestFile", "archiveBytes", "archiveSha256")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
