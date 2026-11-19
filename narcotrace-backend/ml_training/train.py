"""Train all configured candidates in one process and select on validation only."""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import tensorflow as tf
from skimage.color import deltaE_ciede2000, rgb2lab
from tensorflow import keras
from tensorflow.keras import layers

from ml_training.common import current_git_commit, load_config, resolved_path


def small_cnn(image_size: int, class_count: int) -> keras.Model:
    def block(value, filters: int):
        value = layers.SeparableConv2D(filters, 3, padding="same", use_bias=False)(value)
        value = layers.BatchNormalization()(value)
        value = layers.ReLU()(value)
        value = layers.SeparableConv2D(filters, 3, padding="same", use_bias=False)(value)
        value = layers.BatchNormalization()(value)
        value = layers.ReLU()(value)
        return layers.MaxPool2D()(value)

    inputs = keras.Input((image_size, image_size, 3), dtype="float32")
    value = layers.Rescaling(1 / 127.5, offset=-1)(inputs)
    value = layers.Conv2D(16, 3, strides=2, padding="same", use_bias=False)(value)
    value = layers.BatchNormalization()(value)
    value = layers.ReLU()(value)
    for filters in (24, 48, 80):
        value = block(value, filters)
    value = layers.GlobalAveragePooling2D()(value)
    value = layers.Dropout(0.25)(value)
    outputs = layers.Dense(class_count, activation="softmax")(value)
    return keras.Model(inputs, outputs, name="small_cnn")


def mobilenetv3_small(image_size: int, class_count: int, config: dict) -> keras.Model:
    base = keras.applications.MobileNetV3Small(
        input_shape=(image_size, image_size, 3),
        include_top=False,
        weights=config["mobilenet"]["weights"],
        include_preprocessing=True,
    )
    base.trainable = True
    fine_tune_layers = int(config["mobilenet"]["fine_tune_layers"])
    for layer in base.layers[:-fine_tune_layers]:
        layer.trainable = False
    inputs = keras.Input((image_size, image_size, 3), dtype="float32")
    value = base(inputs, training=False)
    value = layers.GlobalAveragePooling2D()(value)
    value = layers.Dropout(0.25)(value)
    outputs = layers.Dense(class_count, activation="softmax")(value)
    return keras.Model(inputs, outputs, name="mobilenetv3_small")


def rgb_prototype(images: np.ndarray, fraction: float) -> np.ndarray:
    height, width = images.shape[1:3]
    crop_h = max(1, round(height * fraction))
    crop_w = max(1, round(width * fraction))
    top = (height - crop_h) // 2
    left = (width - crop_w) // 2
    return np.median(
        images[:, top:top + crop_h, left:left + crop_w].reshape(len(images), -1, 3),
        axis=1,
    ).astype(np.float32)


def fit_lab_nn(images: np.ndarray, labels: np.ndarray, classes: list[str], fraction: float) -> dict:
    rgb = rgb_prototype(images, fraction) / 255.0
    lab = rgb2lab(rgb[:, None, :]).reshape(-1, 3)
    prototypes = {}
    for class_name in classes:
        prototypes[class_name] = np.median(lab[labels == class_name], axis=0).tolist()
    return {"center_crop_fraction": fraction, "prototypes_lab": prototypes}


def predict_lab_nn(images: np.ndarray, artifact: dict, classes: list[str]) -> np.ndarray:
    rgb = rgb_prototype(images, float(artifact["center_crop_fraction"])) / 255.0
    lab = rgb2lab(rgb[:, None, :]).reshape(-1, 3)
    reference = np.asarray([artifact["prototypes_lab"][name] for name in classes])
    distances = np.stack(
        [deltaE_ciede2000(lab, np.broadcast_to(row, lab.shape)) for row in reference],
        axis=1,
    )
    return distances.argmin(axis=1)


def model_predictions(model: keras.Model, images: np.ndarray, batch_size: int) -> np.ndarray:
    return model.predict(images.astype(np.float32), batch_size=batch_size, verbose=0)


def save_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


class EpochCheckpoint(keras.callbacks.Callback):
    def __init__(self, path: Path, started: float, budget_seconds: float | None):
        super().__init__()
        self.path = path
        self.started = started
        self.budget_seconds = budget_seconds
        self.paused = False

    def on_epoch_end(self, epoch, logs=None):
        temporary = self.path.with_name(self.path.stem + ".tmp.keras")
        self.model.save(temporary)
        os.replace(temporary, self.path)
        if self.budget_seconds and time.monotonic() - self.started >= self.budget_seconds:
            self.paused = True
            self.model.stop_training = True


def new_run_dir() -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    return Path(__file__).resolve().parent / "runs" / stamp


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_dir", type=Path)
    parser.add_argument("cache_dir", type=Path)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.yaml"))
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--budget-seconds", type=float, default=0)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if args.budget_seconds < 0:
        parser.error("--budget-seconds cannot be negative")

    config = load_config(args.config)
    dataset_dir = resolved_path(args.dataset_dir)
    cache_dir = resolved_path(args.cache_dir)
    run_dir = resolved_path(args.run_dir) if args.run_dir else new_run_dir()
    if run_dir.exists() and not args.resume and any(run_dir.iterdir()):
        raise FileExistsError(f"Run directory already contains files: {run_dir}")
    run_dir.mkdir(parents=True, exist_ok=True)
    models_dir = run_dir / "models"
    checkpoints_dir = run_dir / "checkpoints"
    models_dir.mkdir(exist_ok=True)
    checkpoints_dir.mkdir(exist_ok=True)
    (run_dir / "config.yaml").write_text(
        Path(args.config).read_text(encoding="utf-8"), encoding="utf-8"
    )
    save_json(
        run_dir / "run.json",
        {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "git_commit": current_git_commit(),
            "dataset_manifest_sha256": __import__("hashlib").sha256(
                (dataset_dir / "manifest.csv").read_bytes()
            ).hexdigest(),
            "seed": int(config["seed"]),
        },
    )

    tf.keras.utils.set_random_seed(int(config["seed"]))
    classes = sorted(pd.read_csv(dataset_dir / "manifest.csv")["label"].unique())

    def load_split(split: str):
        cache = np.load(cache_dir / f"cal_{split}.npz")
        metadata = pd.read_csv(cache_dir / f"cal_{split}_meta.csv", keep_default_na=False)
        images = cache["images"]
        labels = cache["labels"].astype(str)
        if len(images) != len(labels) or len(labels) != len(metadata):
            raise ValueError(f"{split} cache arrays and metadata are not row-aligned")
        return images, labels, metadata

    x_train, y_train, _ = load_split("train")
    x_val, y_val, meta_val = load_split("val")
    if set(classes) - set(y_train):
        raise ValueError("Training split is missing one or more classes")
    class_ids = {name: index for index, name in enumerate(classes)}
    y_train_ids = np.asarray([class_ids[name] for name in y_train], dtype=np.int64)
    y_val_ids = np.asarray([class_ids[name] for name in y_val], dtype=np.int64)
    models_config = list(config["models"])
    if not {"small_cnn", "mobilenetv3_small", "lab_nn"} <= set(models_config):
        raise ValueError("Configured candidate list must include all three model families")
    batch_size = int(config["batch_size"])
    epochs = int(config["epochs"])
    run_started = time.monotonic()
    budget = args.budget_seconds or None
    validation_metrics = {}
    lab_artifact = fit_lab_nn(
        x_train,
        y_train,
        classes,
        float(config["lab_nn"]["center_crop_fraction"]),
    )
    (models_dir / "lab_nn.json").write_text(
        json.dumps(lab_artifact, indent=2) + "\n", encoding="utf-8"
    )
    lab_pred = predict_lab_nn(x_val, lab_artifact, classes)
    validation_metrics["lab_nn"] = _validation_metrics(
        y_val_ids, lab_pred, meta_val, classes
    )

    for model_name in ("small_cnn", "mobilenetv3_small"):
        if model_name not in models_config:
            continue
        checkpoint = checkpoints_dir / f"{model_name}.keras"
        if args.resume and checkpoint.is_file():
            model = keras.models.load_model(checkpoint)
            initial_epoch = int(
                json.loads((checkpoints_dir / f"{model_name}.json").read_text())["epoch"]
            )
        else:
            initial_epoch = 0
            model = (
                small_cnn(int(config["image_size"]), len(classes))
                if model_name == "small_cnn"
                else mobilenetv3_small(int(config["image_size"]), len(classes), config)
            )
            model.compile(
                optimizer=keras.optimizers.Adam(learning_rate=1e-3),
                loss="sparse_categorical_crossentropy",
                metrics=["accuracy"],
            )
        callback = EpochCheckpoint(checkpoint, run_started, budget)
        history = model.fit(
            x_train.astype(np.float32),
            y_train_ids,
            validation_data=(x_val.astype(np.float32), y_val_ids),
            batch_size=batch_size,
            epochs=epochs,
            initial_epoch=initial_epoch,
            callbacks=[callback],
            verbose=2,
            shuffle=True,
        )
        completed_epoch = initial_epoch + len(history.epoch)
        save_json(
            checkpoints_dir / f"{model_name}.json",
            {"epoch": completed_epoch, "complete": completed_epoch >= epochs},
        )
        if callback.paused and completed_epoch < epochs:
            save_json(
                run_dir / "training_state.json",
                {"status": "paused", "model": model_name, "completed_epoch": completed_epoch},
            )
            print(f"Paused after epoch {completed_epoch}; rerun with --resume --run-dir {run_dir}")
            raise SystemExit(75)
        if completed_epoch < epochs:
            raise RuntimeError(f"{model_name} completed only {completed_epoch}/{epochs} epochs")
        model_path = models_dir / f"{model_name}.keras"
        model.save(model_path)
        probabilities = model_predictions(model, x_val, batch_size)
        validation_metrics[model_name] = _validation_metrics(
            y_val_ids, probabilities.argmax(axis=1), meta_val, classes
        )
        del model
        tf.keras.backend.clear_session()

    card_scores = {
        name: metric["card_found_accuracy"]
        for name, metric in validation_metrics.items()
        if metric["card_found_count"] > 0
    }
    if not card_scores:
        raise ValueError("Validation split contains no card-found samples")
    selected = max(
        card_scores,
        key=lambda name: (card_scores[name], validation_metrics[name]["accuracy"]),
    )
    save_json(
        run_dir / "training.json",
        {
            "status": "complete",
            "classes": classes,
            "validation": validation_metrics,
            "selected_model": selected,
            "selection_metric": "card_found_accuracy",
            "test_evaluated": False,
        },
    )
    save_json(run_dir / "training_state.json", {"status": "complete"})
    print(f"Selected {selected} using validation card-found accuracy: {card_scores[selected]:.4f}")
    print(f"Run directory: {run_dir}")


def _validation_metrics(
    labels: np.ndarray,
    predicted: np.ndarray,
    metadata: pd.DataFrame,
    classes: list[str],
) -> dict:
    correct = labels == predicted
    card_found = metadata["card_found"].astype(bool).to_numpy()
    return {
        "accuracy": float(correct.mean()),
        "card_found_accuracy": float(correct[card_found].mean()) if card_found.any() else 0.0,
        "card_found_count": int(card_found.sum()),
        "count": len(labels),
        "classes": classes,
    }


if __name__ == "__main__":
    main()
