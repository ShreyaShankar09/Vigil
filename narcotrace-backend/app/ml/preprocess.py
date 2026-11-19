"""Single preprocessing path shared by training and the API (so they can never drift apart)."""
import cv2, numpy as np
from .calibration import calibrate, Calibration

MODEL_SZ = 96


def prepare(img_bgr: np.ndarray) -> tuple[np.ndarray, Calibration]:
    """image -> (float32 1x96x96x3 RGB 0..255 for the CNN, calibration report). Calibrated if the card is found, else raw square."""
    cal = calibrate(img_bgr)
    rgb = cv2.cvtColor(cal.corrected_bgr, cv2.COLOR_BGR2RGB)
    return cv2.resize(rgb, (MODEL_SZ, MODEL_SZ), interpolation=cv2.INTER_AREA), cal
