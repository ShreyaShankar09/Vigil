"""Calibrate and cache a single dataset split.

Usage: python ml_training/prepare_cache.py DATASET CACHE SPLIT
Train is augmented before calibration; validation and test are never augmented.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.preprocess import prepare
from ml_training.augment import augment_capture
from ml_training.common import load_config, resolved_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_dir", type=Path)
    parser.add_argument("cache_dir", type=Path)
    parser.add_argument("split", choices=("train", "val", "test"))
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.yaml"))
    parser.add_argument("--augment-repeats", type=int)
    args = parser.parse_args()
    if args.augment_repeats is not None and args.augment_repeats < 0:
        parser.error("--augment-repeats cannot be negative")

    config = load_config(args.config)
    dataset_dir = resolved_path(args.dataset_dir)
    cache_dir = resolved_path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = dataset_dir / "manifest.csv"
    manifest = pd.read_csv(manifest_path, keep_default_na=False)
    required = {"file", "label", "split", "session"}
    if not required <= set(manifest.columns):
        raise ValueError(f"Dataset manifest is missing fields: {sorted(required - set(manifest.columns))}")
    rows = manifest.loc[manifest["split"] == args.split].reset_index(drop=True)
    if rows.empty:
        raise ValueError(f"No records found for split {args.split}")
    repeats = (
        args.augment_repeats
        if args.augment_repeats is not None
        else int(config.get("augmentation_repeats", 1))
    )
    if args.split != "train":
        repeats = 0

    images: list[np.ndarray] = []
    records: list[dict] = []
    image_size = int(config["image_size"])
    seed = int(config["seed"])
    for row_index, row in rows.iterrows():
        relative = Path(str(row["file"]))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Manifest image path must stay under dataset root: {relative}")
        source_path = dataset_dir / relative
        image_bgr = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
        if image_bgr is None:
            raise ValueError(f"Unable to read manifest image: {source_path}")
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        for variant in range(repeats + 1):
            augmented = variant > 0
            current_rgb = (
                augment_capture(
                    image_rgb,
                    np.random.default_rng(
                        np.random.SeedSequence([seed, int(row_index), variant])
                    ),
                )
                if augmented
                else image_rgb
            )
            input_bgr = cv2.cvtColor(current_rgb, cv2.COLOR_RGB2BGR)
            prepared, calibration = prepare(input_bgr)
            if image_size != prepared.shape[0]:
                prepared = cv2.resize(
                    prepared, (image_size, image_size), interpolation=cv2.INTER_AREA
                )
            images.append(prepared)
            record = row.to_dict()
            record.update(
                original_file=str(row["file"]),
                augmentation=variant,
                card_found=calibration.card_found,
                delta_e_before=calibration.delta_e_before,
                delta_e_after=calibration.delta_e_after,
                exposure=calibration.exposure,
                detected_card_scale=calibration.card_scale,
                detected_card_rotation=calibration.card_rotation,
                detection_method=calibration.detection_method,
            )
            records.append(record)
        if row_index and row_index % 250 == 0:
            print(f"{args.split}: calibrated {row_index}/{len(rows)}", flush=True)

    array = np.stack(images).astype(np.uint8, copy=False)
    cache_path = cache_dir / f"cal_{args.split}.npz"
    np.savez_compressed(cache_path, images=array, labels=np.asarray([r["label"] for r in records]))
    pd.DataFrame(records).to_csv(
        cache_dir / f"cal_{args.split}_meta.csv",
        index=False,
        lineterminator="\n",
    )
    print(
        f"{args.split}: {len(array)} images {array.shape[1:]} "
        f"manifest_sha256={hashlib.sha256(manifest_path.read_bytes()).hexdigest()}",
        flush=True,
    )


if __name__ == "__main__":
    main()
