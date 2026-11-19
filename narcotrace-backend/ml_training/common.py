"""Shared configuration and run helpers for ML training commands."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import yaml

TRAINING_DIR = Path(__file__).resolve().parent
REPO_ROOT = TRAINING_DIR.parents[1]
CONFIG_PATH = TRAINING_DIR / "config.yaml"


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    config = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError(f"Training config must be an object: {path}")
    for required in ("seed", "image_size", "epochs", "batch_size", "models"):
        if required not in config:
            raise ValueError(f"Missing training config setting: {required}")
    if config["image_size"] not in (96, 128):
        raise ValueError("image_size must be 96 or 128")
    if not isinstance(config["epochs"], int) or config["epochs"] < 1:
        raise ValueError("epochs must be a positive integer")
    return config


def current_git_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def resolved_path(value: str | Path, relative_to: Path | None = None) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ((relative_to or Path.cwd()) / path).resolve()
