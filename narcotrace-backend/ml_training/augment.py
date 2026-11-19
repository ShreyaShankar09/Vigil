"""Seeded capture-domain augmentations applied before reference-card calibration."""
from __future__ import annotations

import cv2
import numpy as np


def augment_capture(image_rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    height, width = image_rgb.shape[:2]
    scale = float(rng.uniform(0.8, 1.2))
    tx = float(rng.uniform(-0.1, 0.1) * width)
    ty = float(rng.uniform(-0.1, 0.1) * height)
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), 0.0, scale)
    matrix[:, 2] += (tx, ty)
    augmented = cv2.warpAffine(
        image_rgb,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    pixels = augmented.astype(np.float32)
    yy, xx = np.mgrid[:height, :width].astype(np.float32)

    if rng.random() < 0.5:
        angle = float(rng.uniform(0, np.pi))
        distance = xx * np.cos(angle) + yy * np.sin(angle)
        edge = float(rng.uniform(0.1, 0.9) * (width * abs(np.cos(angle)) + height * abs(np.sin(angle))))
        width_px = float(rng.uniform(10, 38))
        shadow = np.clip((edge - distance) / width_px, 0, 1)
        pixels *= (1 - 0.45 * cv2.GaussianBlur(shadow, (0, 0), 4))[..., None]

    if rng.random() < 0.35:
        gx, gy = rng.uniform(0, width), rng.uniform(0, height)
        sigma = float(rng.uniform(8, 30))
        glare = np.exp(-((xx - gx) ** 2 + (yy - gy) ** 2) / (2 * sigma**2))
        pixels += (glare * rng.uniform(40, 150))[..., None]

    if rng.random() < 0.35:
        kernel_size = int(rng.choice((3, 5, 7)))
        kernel = np.zeros((kernel_size, kernel_size), np.float32)
        kernel[kernel_size // 2, :] = 1 / kernel_size
        pixels = cv2.filter2D(pixels, -1, kernel)

    pixels = np.clip(pixels, 0, 255).astype(np.uint8)
    quality = int(rng.integers(45, 96))
    success, encoded = cv2.imencode(
        ".jpg",
        cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR),
        [cv2.IMWRITE_JPEG_QUALITY, quality],
    )
    if not success:
        raise RuntimeError("Unable to encode augmented image")
    decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if decoded is None:
        raise RuntimeError("Unable to decode augmented image")
    return cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)
