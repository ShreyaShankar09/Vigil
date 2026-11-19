"""Reproducible wrapper for the repository's synthetic image generator."""
import argparse
from pathlib import Path
import subprocess
import sys


GENERATOR = Path(__file__).resolve().parents[2] / "narcotrace-synthetic-dataset" / "generate_synthetic.py"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--images-per-class", type=int, default=1250)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    if not GENERATOR.is_file():
        raise FileNotFoundError(f"Synthetic generator not found: {GENERATOR}")
    subprocess.run(
        [
            sys.executable,
            str(GENERATOR),
            str(args.output_dir),
            str(args.images_per_class),
            str(args.seed),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
