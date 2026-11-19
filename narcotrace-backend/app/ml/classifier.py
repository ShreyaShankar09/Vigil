"""TFLite inference + end-to-end analyse(): image bytes -> calibration -> colour -> kit-specific verdict."""
import json, pathlib, threading
import cv2, numpy as np
from .preprocess import prepare
from .calibration import jpeg_b64
from . import kits

HERE = pathlib.Path(__file__).parent / "models"
CARD = json.load(open(HERE / "model_card.json")); CLASSES = CARD["classes"]
try:
    from ai_edge_litert.interpreter import Interpreter           # preferred: small runtime
except ImportError:                                               # pragma: no cover
    from tensorflow.lite.python.interpreter import Interpreter
_it = Interpreter(model_path=str(HERE / "narcotrace_cnn_fp32.tflite")); _it.allocate_tensors()
_in, _out = _it.get_input_details()[0]["index"], _it.get_output_details()[0]["index"]
_lock = threading.Lock()                                          # interpreter is not thread-safe


def _probs(x: np.ndarray) -> np.ndarray:
    with _lock:
        _it.set_tensor(_in, x[None].astype(np.float32)); _it.invoke(); return _it.get_tensor(_out)[0].copy()


def model_info() -> dict:
    return {k: CARD[k] for k in ("name", "version", "status", "classes", "test_accuracy_synthetic", "policy_eval_synthetic", "limitations")}


def analyze(image_bytes: bytes, kit_id: str) -> dict:
    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None: raise ValueError("Could not decode image")
    x, cal = prepare(img); p = _probs(x); k = int(p.argmax()); colour, conf = CLASSES[k], float(p[k])
    d = kits.decide(kit_id, colour, conf, cal.card_found, cal.exposure)
    warn = []
    if cal.card_found and cal.exposure == "dim":
        warn.append({"code": "EXPOSURE_DIM"})
    if cal.card_found and cal.exposure == "bright":
        warn.append({"code": "EXPOSURE_BRIGHT"})
    if cal.delta_e_after is not None and cal.delta_e_after > 12:
        warn.append({"code": "CALIBRATION_RESIDUAL_HIGH", "max_delta_e": 12})
    kit = kits.KITS[kit_id]
    return {
        "verdict": d["verdict"], "substance": d["substance"], "reaction_color": d["reaction_color"], "reasons": d["reasons"], "warnings": warn,
        "colour_class": colour, "confidence": round(conf * 100, 1), "probs": {c: round(float(v), 4) for c, v in zip(CLASSES, p)},
        "kit": {"id": kit_id, "reagent": kit["reagent"], "chart_verified": kit["chart_verified"], "read_window_s": kit["read_window_s"], "note": kits.COMMON_NOTE},
        "calibration": {"card_found": cal.card_found, "exposure": cal.exposure, "cast": cal.cast, "cct_k": round(cal.cct_k) if cal.cct_k else None,
                        "delta_e_before": None if cal.delta_e_before is None else round(cal.delta_e_before, 1),
                        "delta_e_after": None if cal.delta_e_after is None else round(cal.delta_e_after, 1), "bbox": cal.bbox},
        "images": {"raw": jpeg_b64(cal.squared_bgr), "calibrated": jpeg_b64(cal.corrected_bgr)},
        "model": {"name": CARD["name"], "version": CARD["version"], "status": CARD["status"]},
    }
