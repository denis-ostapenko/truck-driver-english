#!/usr/bin/env python3
"""Real Google Chrome QA for the scene remediation and release parity."""

import argparse
import asyncio
import json
import subprocess
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright


ROOT = Path(__file__).resolve().parents[1]
COURSE_DATA = json.loads((ROOT / "app" / "data" / "course-data.json").read_text(encoding="utf-8"))
SCENES = COURSE_DATA["situations"]

FULL_EQUIPMENT = ["dryVan", "airBrakes"]
FULL_CONDITIONS = [
    "tripSpecific",
    "eld",
    "eldMalfunction",
    "oversizePermit",
    "cargo",
    "vehicleTransport",
    "transportedVehicleAtMost10000Lb",
    "cargoSecurement",
    "scaleTicket",
    "delivery",
]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def keychain_password(service):
    result = subprocess.run(
        ["security", "find-generic-password", "-w", "-s", service],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.rstrip("\n")


async def finish_onboarding(page):
    dialog = page.locator("#onboarding-dialog")
    if await dialog.is_visible():
        await page.locator('[data-profile="both"]').click()
        await page.locator("#onboarding-conditions-next").click()
        await page.locator('[data-onboarding-time="10"]').click()
        await dialog.wait_for(state="hidden")


async def open_view(page, base_url, view):
    await page.goto(f"{base_url}#{view}", wait_until="domcontentloaded")
    await finish_onboarding(page)
    await page.locator(f"#view-{view}.active").wait_for()


async def clear_applicability(page):
    for _ in range(40):
        checked = page.locator('#conditions-settings input[type="checkbox"]:checked')
        if await checked.count() == 0:
            return
        await checked.first.click()
    raise AssertionError("Could not clear applicability controls")


async def set_context(page, base_url, profile, equipment=(), conditions=()):
    await open_view(page, base_url, "progress")
    profile_button = page.locator(f'[data-change-profile="{profile}"]')
    if "active" not in (await profile_button.get_attribute("class") or ""):
        await profile_button.click()
    settings = page.locator("details.conditions-card")
    if not await settings.evaluate("node => node.open"):
        await settings.locator("summary").click()
    await clear_applicability(page)
    for group, keys in (("equipment", equipment), ("conditions", conditions)):
        for key in keys:
            control = page.locator(
                f'#conditions-settings [data-applicability-group="{group}"][data-applicability-key="{key}"]'
            )
            require(await control.count() == 1, f"Missing setting {group}:{key}")
            if not await control.is_checked():
                await control.click()


async def scene_inventory(page):
    return await page.evaluate(
        """() => ({
          all: document.querySelectorAll('#situation-list button').length,
          available: document.querySelectorAll('#situation-list [data-situation-index]').length,
          locked: document.querySelectorAll('#situation-list [data-situation-locked]').length,
          labels: [...document.querySelectorAll('#situation-list button')].map(node => node.textContent.trim()),
          summary: document.querySelector('#situation-availability')?.textContent,
          context: document.querySelector('#situation-filter-context')?.textContent,
        })"""
    )


async def assert_inventory(page, expected):
    result = await scene_inventory(page)
    require(result["all"] == 40, f"Inventory has {result['all']} cards")
    require(result["available"] == expected, f"Expected {expected} available, got {result['available']}")
    require(result["locked"] == 40 - expected, f"Expected {40 - expected} locked, got {result['locked']}")
    numbers = [label[:2] for label in result["labels"]]
    require(numbers == [f"{index:02d}" for index in range(1, 41)], "Canonical order changed")
    require(result["summary"] == f"Доступно {expected} из 40", result["summary"])
    return result


async def assert_document_width(page, expected):
    widths = await page.evaluate(
        "() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"
    )
    require(widths == {"client": expected, "scroll": expected}, f"Document width mismatch: {widths}")


async def set_mode(page, mode):
    await page.locator(f'[data-situation-mode="{mode}"]').click()
    await page.locator(f'[data-situation-mode="{mode}"].active').wait_for()


async def wait_for_audio_end(button, timeout_seconds=30):
    for _ in range(timeout_seconds * 10):
        if "speaking" not in (await button.get_attribute("class") or ""):
            return
        await asyncio.sleep(0.1)
    raise AssertionError("Audio did not finish before timeout")


async def assert_scene(page, scene_index, viewport_width, test_audio=True):
    source = SCENES[scene_index]
    button = page.locator(f'[data-situation-index="{scene_index}"]')
    require(await button.count() == 1, f"Scene {scene_index + 1} is not directly reachable")
    await button.click()
    await page.locator(f'[data-situation-index="{scene_index}"].active').wait_for()
    title = await page.locator("#situation-title").text_content()
    require(title == source["titleRu"], f"Scene {scene_index + 1} title mismatch: {title}")
    require(await page.locator("#situation-dialogue .dialogue-line").count() == 4, f"Scene {scene_index + 1} dialogue")
    require(await page.locator("#situation-dialogue .dialogue-audio").count() == 4, f"Scene {scene_index + 1} audio controls")
    image = page.locator("#situation-image")
    require(await image.is_visible(), f"Scene {scene_index + 1} visual is hidden")
    await page.wait_for_function(
        "node => node.complete && node.naturalWidth > 0",
        arg=await image.element_handle(),
        timeout=10000,
    )
    loaded = await image.evaluate("node => node.complete && node.naturalWidth > 0")
    require(loaded, f"Scene {scene_index + 1} visual failed")
    widths = await page.evaluate(
        "() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"
    )
    require(widths["client"] == viewport_width, f"Viewport client width {widths}")
    require(widths["scroll"] == viewport_width, f"Scene {scene_index + 1} overflow {widths}")
    if test_audio:
        audio = page.locator("#situation-dialogue .dialogue-audio").first
        await audio.click()
        await page.wait_for_timeout(180)
        require("speaking" in (await audio.get_attribute("class") or ""), f"Scene {scene_index + 1} audio did not start")


def scene_variant(scene, variant="primary"):
    return next(item for item in scene["practiceContract"]["variants"] if item["id"] == variant)


async def complete_scene(page, mode, scene_index):
    scene = SCENES[scene_index]
    await set_mode(page, mode)
    await page.locator(f'[data-situation-index="{scene_index}"]').click()
    label = await page.locator("#play-situation").text_content()
    require(label == "Прослушать текущую реплику", f"{mode} label: {label}")
    safe_id = scene["practiceContract"]["choiceCheck"]["correctOptionId"]
    await page.locator(f'[data-situation-choice="{safe_id}"]').click()
    variant = scene_variant(scene)
    for turn in variant["criticalTurns"]:
        if mode in {"listen", "phone", "elp"}:
            play = page.locator("#play-situation")
            require(await play.text_content() == "Прослушать текущую реплику", f"{mode} current prompt label")
            await play.click()
            await wait_for_audio_end(play)
        await page.locator("#situation-response").fill(turn["modelAnswer"])
        await page.locator("#check-situation-response").click()
    outcome = scene["practiceContract"]["workplaceOutcome"]["expectedByVariant"]["primary"]["modelAnswer"]
    require(await page.locator("#play-situation").text_content() == "Аудиоходы завершены", f"{mode} outcome label")
    await page.locator("#situation-response").fill(outcome)
    await page.locator("#check-situation-response").click()
    feedback = await page.locator("#situation-evaluation-feedback").text_content()
    require("Все 2 критических хода" in feedback, f"{mode} scene {scene_index + 1}: {feedback}")
    require(await page.locator("#play-situation").text_content() == "Прослушать всю сцену", f"{mode} evaluated label")


async def check_all_scenes(page, viewport_width, artifact_dir, prefix):
    await set_mode(page, "read")
    await assert_inventory(page, 40)
    for index in range(40):
        await assert_scene(page, index, viewport_width, test_audio=True)
    await page.locator('[data-situation-index="23"]').click()
    await page.screenshot(path=artifact_dir / f"{prefix}-scene-24.png", full_page=True)


async def run(args):
    artifact_dir = Path(args.output_dir).resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)
    password = keychain_password(args.auth_service) if args.auth_service else None
    http_credentials = {"username": args.username, "password": password} if password else None
    errors = []
    failed_requests = []
    report = {"baseUrl": args.base_url, "browser": "Google Chrome", "checks": []}

    with tempfile.TemporaryDirectory(prefix="truck-driver-qa-") as profile_dir:
        async with async_playwright() as playwright:
            context = await playwright.chromium.launch_persistent_context(
                profile_dir,
                channel="chrome",
                headless=False,
                viewport={"width": 1440, "height": 900},
                http_credentials=http_credentials,
                service_workers="allow",
            )
            page = context.pages[0]
            page.on("console", lambda message: errors.append(f"console:{message.type}:{message.text}") if message.type in {"error", "warning"} else None)
            page.on("pageerror", lambda error: errors.append(f"pageerror:{error}"))
            page.on("requestfailed", lambda request: failed_requests.append(f"{request.method} {request.url}: {request.failure}"))
            page.on("response", lambda response: failed_requests.append(f"HTTP {response.status} {response.url}") if response.status >= 400 else None)

            await open_view(page, args.base_url, "situations")
            user_agent = await page.evaluate("navigator.userAgent")
            require("Chrome/" in user_agent and "Edg/" not in user_agent, user_agent)

            contexts = [
                ("tractor", [], [], 16, "tractor-basic"),
                ("tractor", ["airBrakes"], [], 18, "tractor-air-brakes"),
                ("tractor", ["dryVan"], ["tripSpecific"], 23, "tractor-dryvan-trip"),
                ("hotshot-open", [], [], 15, "hotshot-open-basic"),
                ("hotshot-open", [], ["vehicleTransport"], 20, "hotshot-open-vehicle"),
                ("hotshot-open", [], ["vehicleTransport", "cargoSecurement"], 21, "hotshot-open-securement"),
                ("hotshot-enclosed", [], [], 15, "hotshot-enclosed-basic"),
                ("hotshot-enclosed", [], ["vehicleTransport"], 21, "hotshot-enclosed-vehicle"),
                ("hotshot-enclosed", [], ["vehicleTransport", "cargoSecurement"], 22, "hotshot-enclosed-securement"),
            ]
            for profile, equipment, conditions, expected, name in contexts:
                await set_context(page, args.base_url, profile, equipment, conditions)
                await open_view(page, args.base_url, "situations")
                result = await assert_inventory(page, expected)
                require(result["context"], f"Missing context for {name}")
                report["checks"].append({"context": name, "available": expected})

            await set_context(page, args.base_url, "both", FULL_EQUIPMENT, FULL_CONDITIONS)
            await open_view(page, args.base_url, "situations")
            await assert_inventory(page, 40)
            await page.screenshot(path=artifact_dir / "desktop-full-inventory.png", full_page=True)
            for mode, expected in (("read", 40), ("say", 40), ("listen", 40), ("phone", 7), ("elp", 18)):
                await set_mode(page, mode)
                await assert_inventory(page, expected)
                report["checks"].append({"mode": mode, "available": expected})
            await set_mode(page, "phone")
            await page.screenshot(path=artifact_dir / "desktop-phone-inventory.png", full_page=True)

            await set_mode(page, "read")
            await check_all_scenes(page, 1440, artifact_dir, "desktop")
            await complete_scene(page, "say", 0)
            await complete_scene(page, "listen", 1)
            await complete_scene(page, "phone", 15)
            await complete_scene(page, "elp", 32)
            await page.reload(wait_until="domcontentloaded")
            await finish_onboarding(page)
            await page.locator("#view-situations.active").wait_for()
            persisted_state = await page.evaluate("localStorage.getItem('truck-driver-english-state-v1') || ''")
            require(SCENES[0]["id"] in persisted_state and "situation-completion-blueprint" in persisted_state, "Progress did not persist")

            await page.set_viewport_size({"width": 390, "height": 844})
            for profile in ("tractor", "hotshot-open", "hotshot-enclosed", "both"):
                await set_context(page, args.base_url, profile, [], [])
                await open_view(page, args.base_url, "situations")
                await assert_inventory(page, 16 if profile in {"tractor", "both"} else 15)
                await assert_document_width(page, 390)
            await set_context(page, args.base_url, "both", FULL_EQUIPMENT, FULL_CONDITIONS)
            await open_view(page, args.base_url, "situations")
            for mode, expected in (("read", 40), ("say", 40), ("listen", 40), ("phone", 7), ("elp", 18)):
                await set_mode(page, mode)
                await assert_inventory(page, expected)
                await assert_document_width(page, 390)
            await check_all_scenes(page, 390, artifact_dir, "mobile")
            await page.locator('[data-situation-index="39"]').click()
            await set_context(page, args.base_url, "hotshot-open", [], [])
            await open_view(page, args.base_url, "situations")
            await assert_inventory(page, 15)
            active_visible = await page.evaluate(
                """() => {
                  const list = document.querySelector('#situation-list');
                  const active = list.querySelector('button.active');
                  const a = active.getBoundingClientRect();
                  const l = list.getBoundingClientRect();
                  return a.left >= l.left && a.right <= l.right && active.dataset.situationIndex === '0';
                }"""
            )
            require(active_visible, "Active mobile scene is outside the horizontal list")
            await page.screenshot(path=artifact_dir / "mobile-hotshot-basic-synced.png", full_page=True)

            await page.locator("#situation-tab-read").focus()
            await page.keyboard.press("ArrowRight")
            require(await page.locator("#situation-tab-say").get_attribute("aria-selected") == "true", "Keyboard tab navigation")
            await page.keyboard.press("ArrowLeft")
            await page.locator("#mobile-menu").click()
            require("open" in (await page.locator(".sidebar").get_attribute("class") or ""), "Mobile menu did not open")
            await page.screenshot(path=artifact_dir / "mobile-menu.png", full_page=True)
            await page.locator("#sidebar-close").click()

            await page.reload(wait_until="networkidle")
            worker = await page.evaluate("navigator.serviceWorker ? navigator.serviceWorker.controller !== null : false")
            caches = await page.evaluate("caches ? caches.keys() : []")
            report["serviceWorker"] = {"controlled": worker, "caches": caches}
            report["userAgent"] = user_agent
            report["consoleErrors"] = errors
            report["failedRequests"] = failed_requests
            require(not errors, "Console errors: " + " | ".join(errors))
            require(not failed_requests, "Failed requests: " + " | ".join(failed_requests))
            require(worker, "Service worker does not control the final page")
            await context.set_offline(True)
            await page.reload(wait_until="domcontentloaded")
            require(await page.locator("#view-title").count() == 1, "Offline service-worker reload failed")
            await context.set_offline(False)
            await context.close()

    (artifact_dir / "RESULT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "output": str(artifact_dir), "checks": len(report["checks"])}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--username", default="driver-beta")
    parser.add_argument("--auth-service")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
