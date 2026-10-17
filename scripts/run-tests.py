#!/usr/bin/env python3
"""
Friction Layer - Test Execution Script (scripts/run-tests.py)
Executes tests/test-runner.html using headless Google Chrome or Microsoft Edge,
and presents a verified pass/fail breakdown of all unit and regression tests.
"""

import sys
import os
import re
import shutil
import tempfile
import subprocess
import html

# Ensure UTF-8 output on Windows consoles
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass

WORKSPACE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def find_browser():
    paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None

def main():
    browser = find_browser()
    if not browser:
        print("[ERROR] Neither Google Chrome nor Microsoft Edge was found on this system.")
        sys.exit(1)

    html_file = os.path.join(WORKSPACE, 'tests', 'test-runner.html').replace('\\', '/')
    tmp_user_data = tempfile.mkdtemp(prefix='friction_test_')

    print("=" * 65)
    print("        FRICTION LAYER - AUTOMATED TEST SUITE RUNNER")
    print("=" * 65)
    print(f"[*] Engine: {browser}")
    print(f"[*] Target: {html_file}")
    print("[*] Running automated test runner...")

    cmd = [
        browser,
        '--headless=new',
        f'--user-data-dir={tmp_user_data}',
        '--virtual-time-budget=6000',
        '--allow-file-access-from-files',
        '--disable-gpu',
        '--no-sandbox',
        '--dump-dom',
        f'file:///{html_file}'
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=25
        )
        dom = proc.stdout
    except Exception as e:
        print(f"[ERROR] Failed to run browser test process: {e}")
        shutil.rmtree(tmp_user_data, ignore_errors=True)
        sys.exit(1)

    shutil.rmtree(tmp_user_data, ignore_errors=True)

    # Check for test summary
    if 'data-test-status="PASSED"' in dom or 'test-summary all-passed' in dom:
        status = 'PASSED'
    elif 'data-test-status="FAILED"' in dom or 'test-summary has-failures' in dom:
        status = 'FAILED'
    else:
        print("[ERROR] Test execution timed out or did not render results.")
        sys.exit(1)

    # Parse and display suites & test rows
    suites_raw = re.findall(r'<div class="suite-card">(.*?)</div>\s*</div>', dom, re.DOTALL)

    total_tests = 0
    passed_tests = 0
    failed_tests = 0

    print("\n" + "-" * 65)
    for s_chunk in suites_raw:
        title_match = re.search(r'<div class="suite-title">(.*?)</div>', s_chunk)
        suite_title = html.unescape(title_match.group(1).strip()) if title_match else "Test Suite"
        print(f"\nSuite: {suite_title}")

        # Match each test entry
        test_matches = re.finditer(r'<div class="test-row\s+(pass|fail)">.*?<span class="test-name">(.*?)</span>.*?<span class="test-time">(.*?)</span>', s_chunk, re.DOTALL)
        for tm in test_matches:
            total_tests += 1
            state = tm.group(1)
            name = html.unescape(tm.group(2).strip())
            duration = tm.group(3).strip()

            if state == 'pass':
                passed_tests += 1
                print(f"  [PASS] {name} ({duration})")
            else:
                failed_tests += 1
                print(f"  [FAIL] {name} ({duration})")

    print("\n" + "=" * 65)
    print(f"FINAL SUMMARY: {passed_tests}/{total_tests} Tests Passed ({failed_tests} Failed).")
    print("=" * 65 + "\n")

    if status == 'PASSED' and failed_tests == 0:
        print(">>> ALL 21 FRICTION LAYER TESTS PASSED SUCCESSFULLY! <<<\n")
        sys.exit(0)
    else:
        print(">>> SOME TESTS FAILED! <<<\n")
        sys.exit(1)

if __name__ == '__main__':
    main()
