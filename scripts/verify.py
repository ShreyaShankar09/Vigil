from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "narcotrace-backend"
FRONTEND = ROOT / "narcotrace-frontend"
COMPOSE = ["docker", "compose", "-f", str(ROOT / "docker-compose.yml")]
NPM = "npm.cmd" if os.name == "nt" else "npm"


def run(name: str, command: list[str], cwd: Path = ROOT, env: dict[str, str] | None = None) -> tuple[bool, str]:
    print(f"[RUN] {name}", flush=True)
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            env=merged_env,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except OSError as error:
        return False, str(error)
    return result.returncode == 0, result.stdout


def wait_for_backend(timeout_seconds: int = 120) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen("http://localhost:8000/healthz", timeout=2) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.URLError):
            time.sleep(2)
    return False


def coverage_metric(output: str) -> str:
    rows = [line for line in output.splitlines() if re.match(r"^TOTAL\s", line)]
    if rows:
        return rows[-1].split()[-1]
    return "not reported"


def print_tail(name: str, output: str) -> None:
    if output:
        print(f"\n--- {name} output (last 35 lines) ---")
        print("\n".join(output.splitlines()[-35:]))


def main() -> int:
    results: list[tuple[str, str, str, str]] = []

    def record(component: str, tests: str, passed: bool, metric: str) -> None:
        results.append((component, tests, "PASS" if passed else "FAIL", metric))

    started, output = run("compose PostgreSQL and backend", COMPOSE + ["up", "-d", "--wait", "postgres", "backend"])
    if not started:
        print_tail("compose startup", output)
        record("Environment", "compose postgres/backend", False, "unavailable")
        backend_ready = False
    else:
        backend_ready = wait_for_backend()
        record("Environment", "compose postgres/backend", backend_ready, "healthz")
        if not backend_ready:
            _, logs = run("compose backend logs", COMPOSE + ["logs", "--no-color", "backend"])
            print_tail("backend logs", logs)

    if backend_ready:
        seeded, seed_output = run(
            "seed deterministic E2E records",
            COMPOSE + ["exec", "-T", "-e", "E2E_SEED_ALLOW_RESET=1", "backend", "python", "-m", "app.seed_e2e", "--reset"],
        )
        record("E2E fixtures", "guarded seed", seeded, "E2E-prefixed records")
        if not seeded:
            print_tail("E2E seed", seed_output)

        backend_ok, backend_output = run(
            "backend coverage suite",
            COMPOSE + [
                "run", "--rm", "backend", "python", "-m", "pytest", "-q", "--cov=app",
                "--cov-report=term-missing", "--cov-fail-under=85", "tests",
            ],
        )
        record("Backend", "pytest + coverage", backend_ok, coverage_metric(backend_output))
        if not backend_ok:
            print_tail("backend tests", backend_output)

        model_ok, model_output = run(
            "ML policy and runtime smoke",
            COMPOSE + [
                "exec", "-T", "backend", "sh", "-c",
                "python -m pytest -q tests/test_policy.py && python -c \"from app.ml.classifier import model_info; assert model_info()['status'].startswith('SYNTHETIC BASELINE')\"",
            ],
        )
        record("ML", "policy + TFLite runtime", model_ok, "synthetic baseline")
        if not model_ok:
            print_tail("ML smoke", model_output)

        openapi_ok, openapi_output = run(
            "OpenAPI export check",
            COMPOSE + ["exec", "-T", "backend", "python", "-m", "app.export_openapi", "--check"],
        )
        record("API contract", "OpenAPI export", openapi_ok, "committed schema")
        if not openapi_ok:
            print_tail("OpenAPI check", openapi_output)
    else:
        record("E2E fixtures", "guarded seed", False, "blocked: backend not ready")
        record("Backend", "pytest + coverage", False, "blocked: backend not ready")
        record("ML", "policy + TFLite runtime", False, "blocked: backend not ready")
        record("API contract", "OpenAPI export", False, "blocked: backend not ready")

    for label, script in (
        ("Frontend typecheck", "typecheck"),
        ("Frontend lint", "lint"),
        ("Frontend unit tests", "test"),
        ("Locale parity", "check:locales"),
        ("Frontend build + login budget", "build"),
    ):
        ok, output = run(label, [NPM, "run", script], cwd=FRONTEND)
        metric = "250 kB gzip budget" if script == "build" else "-"
        record("Frontend", label.removeprefix("Frontend "), ok, metric)
        if not ok:
            print_tail(label, output)

    vectors_ok, vectors_output = run(
        "custody vector parity",
        [sys.executable, str(ROOT / "scripts" / "check_custody_vectors.py")],
    )
    record("Contract", "custody vectors", vectors_ok, "byte-identical")
    if not vectors_ok:
        print_tail("custody vectors", vectors_output)

    evaluation_ok, evaluation_output = run(
        "generated evaluation check",
        [sys.executable, str(BACKEND / "scripts" / "generate_evaluation.py"), "--check"],
    )
    record("Docs", "generated evaluation", evaluation_ok, "model-card sourced")
    if not evaluation_ok:
        print_tail("evaluation check", evaluation_output)

    e2e_ran = False
    report = FRONTEND / "playwright-report" / "index.html"
    report_mtime_before = report.stat().st_mtime_ns if report.exists() else None
    if backend_ready and results[1][2] == "PASS":
        e2e_ran = True
        e2e_ok, e2e_output = run("compose-backed Playwright suite", [NPM, "run", "test:e2e"], cwd=FRONTEND)
        record("E2E", "Playwright", e2e_ok, "playwright-report/index.html")
        if not e2e_ok:
            print_tail("Playwright", e2e_output)
    else:
        record("E2E", "Playwright", False, "blocked: seeded backend unavailable")

    widths = (18, 30, 8, 34)
    print()
    print(
        f"{'component':<{widths[0]}} | {'tests':<{widths[1]}} | "
        f"{'pass':<{widths[2]}} | {'coverage/metric':<{widths[3]}}"
    )
    print("-" * (sum(widths) + 9))
    for component, tests, status, metric in results:
        print(f"{component:<{widths[0]}} | {tests:<{widths[1]}} | {status:<{widths[2]}} | {metric:<{widths[3]}}")

    report_generated = report.exists() and (
        report_mtime_before is None or report.stat().st_mtime_ns != report_mtime_before
    )
    if e2e_ran and report_generated:
        print(f"\nPlaywright HTML report: {report}")
    else:
        print("\nPlaywright HTML report was not generated by this run.")
    if not shutil.which("docker"):
        print("Docker is required by make verify.")
    return 0 if all(row[2] == "PASS" for row in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
