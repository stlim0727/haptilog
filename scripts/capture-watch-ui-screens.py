#!/usr/bin/env python3
"""Capture the HaptiLog Wear OS watch UI screens showcase.

Mirrors the web portal flow (web/scripts/capture-all-ui-screens.mjs):
tiered capture (core/full/all), a --verify dry-run that writes only to a
temp dir, and catalog.json with bilingual metadata. Drives a running Wear
OS emulator via adb, using the uiautomator/ screencap recipe proven in
docs/validation/ux-phase1.

Run from the repository root against a DISPOSABLE, cloud-disabled debug
emulator (the script clears app data and toggles wifi/data/font/display):
    python3 scripts/capture-watch-ui-screens.py --tier core
    python3 scripts/capture-watch-ui-screens.py --tier all --verify

The emulator may be booted by the ui-screens-watch workflow or locally with
the `wearos_round` AVD (Wear OS 5 / API 34, 454x454, x86_64, KVM).
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ADB = shutil.which("adb") or "/opt/android-sdk/platform-tools/adb"
PKG = "com.haptilog.watch"
ACTIVITY = PKG + "/.presentation.MainActivity"
DEVICE_NAME = "wearos-round-454x454"

TIER_ORDER = {"core": 0, "full": 1, "all": 2}


def fail(message):
    print(f"[capture-watch-ui-screens] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


class Watch:
    def __init__(self, serial=None):
        self.base = [ADB] + (["-s", serial] if serial else [])

    def cmd(self, *args):
        return subprocess.check_output([*self.base, *args], text=True, timeout=30).strip()

    def sh(self, *args):
        return self.cmd("shell", *args)

    def wait_for_device(self, timeout=120):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.cmd("get-state") == "device":
                    return
            except subprocess.SubprocessError:
                pass
            time.sleep(2)
        fail(f"adb device not ready within {timeout}s")

    # --- hierarchy helpers (proven in docs/validation/ux-phase1) -----------
    def nodes(self):
        dump = f"/sdcard/ui-screens-{uuid.uuid4().hex[:8]}.xml"
        for attempt in range(3):
            try:
                self.sh("uiautomator", "dump", dump)
                break
            except subprocess.SubprocessError:
                if attempt == 2:
                    raise
                time.sleep(1.5)
        tree = ET.fromstring(self.cmd("exec-out", "cat", dump))
        self.sh("rm", dump)
        return tree

    @staticmethod
    def bounds(node):
        return list(map(int, re.findall(r"\d+", node.get("bounds", ""))))

    def swipe_up(self):
        w, h = self.screen_size()
        self.sh("input", "swipe", str(w // 2), str(int(h * 0.78)), str(w // 2), str(int(h * 0.25)), "500")
        time.sleep(0.4)

    def screen_size(self):
        nums = re.findall(r"(\d+)x(\d+)", self.sh("wm", "size"))
        return tuple(map(int, nums[-1]))

    def click(self, label, exact=True, scroll=True):
        """Click the clickable ancestor of the node matching label (text or content-desc)."""
        for attempt in range(18 if scroll else 1):
            tree = self.nodes()
            parents = {c: p for p in tree.iter() for c in p}
            for node in tree.iter("node"):
                text, desc = node.get("text", ""), node.get("content-desc", "")
                hit = (text == label or desc == label) if exact else (label in text or label in desc)
                if not hit:
                    continue
                target = node
                while target.get("clickable") != "true" and target in parents:
                    target = parents[target]
                if target.get("clickable") != "true":
                    continue
                x1, y1, x2, y2 = self.bounds(target)
                if y2 - y1 < 28:
                    continue
                self.sh("input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
                time.sleep(1)
                return True
            if scroll:
                self.swipe_up()
        return False

    def wait_for_text(self, label, timeout=15.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if any(label in (n.get("text", "") + n.get("content-desc", "")) for n in self.nodes().iter("node")):
                return True
            time.sleep(0.7)
        return False

    def launch(self):
        self.sh("input", "keyevent", "KEYCODE_WAKEUP")
        self.sh("am", "start", "-n", ACTIVITY)
        time.sleep(2)

    def launch_ready(self, attempts=6):
        """Wake + start until the home screen (Records chip) is actually drawn.

        Display-size overrides and cold starts can drop back to the watch face
        or hold the "Starting…" splash; screencap must never catch either.
        """
        for _ in range(attempts):
            self.launch()
            if self.wait_for_text("Records", timeout=6):
                return True
            time.sleep(2)
        return False


def capture(watch, out, name, settle=2.0):
    time.sleep(settle)
    (out / (name + ".png")).write_bytes(
        subprocess.check_output([*watch.base, "exec-out", "screencap", "-p"], timeout=30)
    )
    tree = watch.nodes()
    labels = [n.get("text") for n in tree.iter("node") if n.get("text")]
    print(f"✓ {name}.png {labels[:6]}", flush=True)
    return tree


# --- screen metadata (same shape as the web catalog) -----------------------
SCREENS = [
    dict(id="01_home_idle", category="recording", file="01_home_idle.png", tier="core",
         title_ko="홈 — 녹음 대기 상태", title_en="Home — Ready to Record",
         description_ko="원형 RECORD 버튼과 Records/Settings 진입 카드, eyes-free 대기 화면",
         description_en="Idle screen with the circular RECORD disc and Records/Settings entry chips for eyes-free launch",
         selector="record_start_accessibility"),
    dict(id="02_recording_active", category="recording", file="02_recording_active.png", tier="core",
         title_ko="녹음 중 — 경과 시간과 정지 버튼", title_en="Recording Active — Elapsed Time & Stop",
         description_ko="하트비트 진동과 함께 진행 중인 녹음 화면: 실시간 경과 시간, STOP, 일시정지",
         description_en="Active recording screen with live elapsed time, STOP, and pause driven by the heartbeat pulse loop",
         selector="record_stop_accessibility"),
    dict(id="03_recordings_list", category="recordings", file="03_recordings_list.png", tier="core",
         title_ko="녹음 목록 — 워치 저장 항목", title_en="Recordings List — On-Watch Captures",
         description_ko="녹음 목록: 시각 라벨 항목, 오프라인 저장 상태, 스크롤 인디케이터",
         description_en="Scrollable list of locally saved recordings with time labels and offline storage status",
         selector="recordings_title"),
    dict(id="04_recording_detail", category="recordings", file="04_recording_detail.png", tier="core",
         title_ko="녹음 상세 — 재생과 메타데이터", title_en="Recording Detail — Playback & Metadata",
         description_ko="재생 컨트롤, 녹음 시각·위치 메타데이터, AI 분류 대기 상태 상세 화면",
         description_en="Playback controls, capture time and location metadata, and pending AI classification detail",
         selector="recording_detail"),
    dict(id="05_recording_paused", category="recording", file="05_recording_paused.png", tier="full",
         title_ko="녹음 일시정지 상태", title_en="Recording Paused State",
         description_ko="PAUSED 배너와 RESUME/STOP 컨트롤이 있는 일시정지 화면",
         description_en="Paused capture screen showing the PAUSED banner with resume and stop controls",
         selector="recording_paused"),
    dict(id="06_cloud_consent", category="settings", file="06_cloud_consent.png", tier="full",
         title_ko="클라우드 AI 동의 — 18+ 고지", title_en="Cloud AI Consent — 18+ Disclosure",
         description_ko="Gemini 업로드 고지와 Agree/Decline 선택: 거절 시 완전 로컬 유지",
         description_en="Supabase/Gemini upload disclosure with agree and decline chips; declining keeps recordings local only",
         selector="cloud_consent_title"),
    dict(id="07_settings", category="settings", file="07_settings.png", tier="full",
         title_ko="설정 — 클라우드·웹·햅틱 그룹", title_en="Settings — Cloud, Web & Haptics",
         description_ko="클라우드 동기화 토글, 웹 리뷰, 햅틱 강도, 위치 저널 등 설정 목록",
         description_en="Settings list with cloud sync toggle, web review access, haptic intensity, and location journal",
         selector="settings_title"),
    dict(id="08_web_access", category="settings", file="08_web_access.png", tier="full",
         title_ko="웹에서 기록 보기 — 브라우저 연결 코드", title_en="Review on the Web — Browser Access Code",
         description_ko="6자리 포털 연결 코드 발급 화면: 포털 주소와 코드 목적 안내",
         description_en="Six-digit portal pairing code screen with the portal address and purpose notice",
         selector="web_access_title"),
    dict(id="09_location_journal", category="settings", file="09_location_journal.png", tier="full",
         title_ko="위치 저널 — GPS 컨텍스트 브라우징", title_en="Location Journal — GPS Context Browsing",
         description_ko="녹음에 저장된 위치·체류 기록을 시간순으로 보는 워치 저널",
         description_en="Chronological watch journal of saved locations and stays attached to recordings",
         selector="location_journal_title"),
    dict(id="10_delete_confirm", category="recordings", file="10_delete_confirm.png", tier="all",
         title_ko="녹음 삭제 확인 시트", title_en="Delete Recording Confirmation",
         description_ko="워치 삭제 범위 고지와 Cancel/Delete 선택 확인 시트",
         description_en="Confirmation sheet describing deletion scope with Cancel and Delete chips",
         selector="delete_confirm_title"),
    dict(id="11_home_stress_192dp", category="accessibility", file="11_home_stress_192dp.png", tier="all",
         title_ko="접근성 스트레스 — 192dp · 200% 폰트", title_en="Accessibility Stress — 192dp · 200% Font",
         description_ko="384px 오버라이드(192dp)와 2.0 배율에서 RECORD 버튼과 레이블 적합성 검증",
         description_en="Home screen fit check at 384px display override (192dp) and 2.0 font scale",
         selector="record_start_accessibility"),
    dict(id="12_list_stress_192dp", category="accessibility", file="12_list_stress_192dp.png", tier="all",
         title_ko="접근성 스트레스 — 목록 192dp · 200% 폰트", title_en="Accessibility Stress — List at 192dp · 200% Font",
         description_ko="확대 폰트에서 녹음 항목이 잘리지 않고 스크롤되는지 검증",
         description_en="Recording list scrollability with enlarged fonts at the 192dp stress display",
         selector="recordings_title"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=["core", "full", "all"], default="all")
    parser.add_argument("--verify", action="store_true", help="dry run into a temp dir; output discarded")
    parser.add_argument("--out", default="screenshots/watch", help="publish output dir (repo root-relative)")
    parser.add_argument("--device", help="adb serial (default: the single connected device)")
    parser.add_argument("--settle", type=float, default=2.0, help="seconds to settle before each screencap")
    args = parser.parse_args()

    out_dir = Path(tempfile.mkdtemp(prefix="haptilog-ui-screens-watch-")) if args.verify else Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    allowed = {name for name, rank in TIER_ORDER.items() if rank <= TIER_ORDER[args.tier]}
    screens = [s for s in SCREENS if s["tier"] in allowed]

    base = [ADB] + (["-s", args.device] if args.device else [])
    devices = [l.split("\t")[0] for l in subprocess.check_output([*base, "devices"], text=True).splitlines()[1:] if "\tdevice" in l]
    if not devices:
        fail("no adb device; boot a Wear OS emulator first (see .github/workflows/ui-screens-watch.yml)")
    serial = args.device or (devices[0] if len(devices) == 1 else fail(f"multiple devices {devices}; pass --device"))
    if not serial.startswith("emulator-"):
        fail(f"{serial} is not an emulator; only disposable emulators may be reset (use --verify elsewhere)")
    watch = Watch(serial)
    watch.wait_for_device()

    print(f"[capture-watch-ui-screens] Device {serial} tier {args.tier} -> {out_dir}", flush=True)

    # Deterministic, cloud-disabled baseline (restored at the end).
    watch.sh("svc", "wifi", "disable")
    watch.sh("svc", "data", "disable")
    watch.sh("svc", "power", "stayon", "true")
    watch.sh("settings", "put", "system", "font_scale", "1.0")
    watch.sh("wm", "size", "reset")
    watch.sh("pm", "clear", PKG)
    for perm in ("android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS",
                 "android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"):
        watch.sh("pm", "grant", PKG, perm)
    if not watch.launch_ready():
        fail("home screen (Records chip) never became ready after launch")

    def record(name):
        meta = next(s for s in SCREENS if s["id"] == name)
        cap_name = meta["file"][:-4]
        capture(watch, out_dir, cap_name, args.settle)
        return meta

    captured = []
    try:
        # 01 idle home.
        captured.append(record("01_home_idle"))
        # 02 recording active (+05 paused at full tier).
        if not watch.click("Start recording"):
            fail("RECORD button not found on home screen")
        time.sleep(3)
        captured.append(record("02_recording_active"))
        if "full" in allowed:
            if not watch.click("Pause", exact=False):
                fail("Pause control not found while recording")
            captured.append(record("05_recording_paused"))
            if not watch.click("Resume", exact=False):
                fail("Resume control not found while paused")
        if not watch.click("Stop recording"):
            fail("STOP control not found while recording")
        time.sleep(1.5)

        # 03 list + 04 detail from the fresh capture.
        if not watch.click("Records"):
            fail("Records entry not found")
        captured.append(record("03_recordings_list"))
        if not watch.click("Recording at", exact=False):
            fail("recorded item not found in list")
        captured.append(record("04_recording_detail"))

        if "all" in allowed:
            if not watch.click("Delete from watch", exact=False):
                fail("delete action not found on detail screen")
            captured.append(record("10_delete_confirm"))
            if not watch.click("Cancel"):
                fail("Cancel not found on delete confirmation")
        watch.sh("input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.8)
        watch.sh("input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.8)

        if "full" in allowed:
            # Settings (+ 06 consent decline, 08 web access, 09 journal).
            if not watch.click("Settings"):
                fail("Settings entry not found")
            captured.append(record("07_settings"))
            if not watch.click("Cloud sync"):
                fail("Cloud sync toggle not found in settings")
            if not watch.wait_for_text("Optional cloud AI"):
                fail("cloud consent disclosure did not appear")
            captured.append(record("06_cloud_consent"))
            if not watch.click("Decline · Keep local only", exact=False):
                fail("decline chip not found on consent screen")
            time.sleep(1)
            if not watch.click("Review on the web"):
                fail("web access entry not found in settings")
            captured.append(record("08_web_access"))
            watch.sh("input", "keyevent", "KEYCODE_BACK")
            time.sleep(1)
            if not watch.click("Location journal"):
                fail("location journal entry not found in settings")
            captured.append(record("09_location_journal"))
            watch.sh("input", "keyevent", "KEYCODE_BACK")
            time.sleep(1)
            watch.sh("input", "keyevent", "KEYCODE_BACK")
            time.sleep(1)

        if "all" in allowed:
            # 192dp / 200% font stress captures, then restore.
            watch.sh("settings", "put", "system", "font_scale", "2.0")
            watch.sh("wm", "size", "384x384")
            watch.sh("wm", "density", "320")
            watch.sh("am", "force-stop", PKG)
            time.sleep(3)  # let the display-size change finish restarting SystemUI
            if not watch.launch_ready():
                fail("home screen never became ready at 192dp stress size")
            captured.append(record("11_home_stress_192dp"))
            if not watch.click("Records"):
                fail("Records entry not found at 192dp")
            captured.append(record("12_list_stress_192dp"))
            watch.sh("wm", "size", "reset")
            watch.sh("wm", "density", "reset")
            watch.sh("settings", "put", "system", "font_scale", "1.0")
            watch.sh("am", "force-stop", PKG)
            watch.launch()

        # Catalog: merge with any previously published entries for other tiers.
        final = {s["id"]: s for s in screens}
        if not args.verify and args.tier != "all":
            existing_path = out_dir / "catalog.json"
            if existing_path.exists():
                try:
                    existing = json.loads(existing_path.read_text())
                    for item in existing.get("screens", []):
                        if item.get("tier") not in allowed:
                            final.setdefault(item["id"], item)
                except (ValueError, OSError):
                    pass
        screens_out = sorted(final.values(), key=lambda s: s["id"])

        def git(*a):
            try:
                return subprocess.check_output(["git", *a], text=True, stderr=subprocess.DEVNULL).strip()
            except subprocess.SubprocessError:
                return ""

        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "branch": os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME") or git("rev-parse", "--abbrev-ref", "HEAD"),
            "commit": os.environ.get("GITHUB_SHA") or git("rev-parse", "HEAD"),
            "commitShort": (os.environ.get("GITHUB_SHA") or git("rev-parse", "HEAD"))[:7],
            "commitDate": git("log", "-1", "--format=%cI"),
            "surface": "wearos-app",
            "device": DEVICE_NAME,
            "screens": screens_out,
        }
        (out_dir / "catalog.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(
            f"[capture-watch-ui-screens] Complete. {len(captured)} screens captured "
            f"({len(screens_out)} in catalog).",
            flush=True,
        )
    finally:
        # Restore device settings (mirrors docs/validation cleanup policy).
        watch.sh("wm", "size", "reset")
        watch.sh("wm", "density", "reset")
        watch.sh("settings", "put", "system", "font_scale", "1.0")
        watch.sh("svc", "power", "stayon", "false")
        watch.sh("svc", "wifi", "enable")
        watch.sh("svc", "data", "enable")
        if args.verify:
            print(f"[capture-watch-ui-screens] Verify mode: output kept at {out_dir} for artifact upload. {len(captured)} screens OK.")


if __name__ == "__main__":
    main()
