"""Reference-card colour calibration.

The kit ships with a printed card: dark frame + 4 swatches (white, grey, red, green) in a row.
We (1) find the card, (2) fit a per-channel tone curve through frame/grey/white so the card's known
neutrals come out right (corrects colour cast, exposure and gamma), then (3) VALIDATE the correction on
the red and green swatches, which were NOT used in the fit. That validation error (CIE76 delta-E before/after)
is the honest "calibration accuracy" number shown to the officer.

The card detector searches both portrait/landscape orientations, both swatch directions, and
scales from 0.7 to 1.4 on the canonical 224-pixel square."""
from __future__ import annotations
import base64
from dataclasses import dataclass, field
import cv2
import numpy as np

CANON = 224
# card layout at scale 1.0 (pixels @224): total 72x30, 4 cells of 13x24, pitch 17, inset (3,3)
CELL_W, CELL_H, PITCH, INX, INY, CARD_W, CARD_H = 13, 24, 17, 3, 3, 72, 30
TRUE = {
    "frame": (30, 30, 30),
    "grey": (128, 128, 128),
    "white": (240, 240, 240),
    "red": (200, 40, 40),
    "green": (40, 160, 70),
    "blue": (80, 130, 205),
    "yellow": (225, 190, 35),
}
SCALES = tuple(round(scale / 10, 1) for scale in range(7, 15))
FLAT = 0.40   # max within-swatch std relative to brightness (shading, shadow edges and sensor noise are tolerated)


def to_square(img_bgr: np.ndarray) -> np.ndarray:
    """Centre-crop to square, resize to 224 (what the capture guide frames)."""
    h, w = img_bgr.shape[:2]; s = min(h, w); y0, x0 = (h - s) // 2, (w - s) // 2
    return cv2.resize(img_bgr[y0:y0 + s, x0:x0 + s], (CANON, CANON), interpolation=cv2.INTER_AREA)


def _lab(rgb):  # rgb float 0..255 (N,3) -> Lab
    a = np.clip(np.asarray(rgb, np.float32).reshape(-1, 1, 3) / 255.0, 0, 1)
    return cv2.cvtColor(a, cv2.COLOR_RGB2Lab).reshape(-1, 3)


def delta_e(a, b) -> float:
    return float(np.linalg.norm(_lab(a) - _lab(b), axis=1).mean())


def _search(rgb: np.ndarray, sc: float):
    """Vectorised search for the card at one scale. Returns (score, x, y, cells) or None."""
    f = rgb.astype(np.float32); H, W = f.shape[:2]
    cw, ch = max(3, round(CELL_W * sc)), max(3, round(CELL_H * sc))
    pitch = round(PITCH * sc); inx, iny = round(INX * sc), round(INY * sc); cardw, cardh = round(CARD_W * sc), round(CARD_H * sc)
    if cardw >= W or cardh >= H: return None
    box = lambda a, kw, kh: cv2.boxFilter(a, -1, (kw, kh), normalize=True, borderType=cv2.BORDER_REPLICATE)
    M, M2 = box(f, cw, ch), box(f * f, cw, ch)
    nx, ny = W - cardw + 1, H - cardh + 1
    ccy = iny + ch // 2
    cells, stds = [], []
    for i in range(4):
        ccx = inx + i * pitch + cw // 2
        cells.append(M[ccy:ccy + ny, ccx:ccx + nx]); stds.append(np.sqrt(np.maximum(M2[ccy:ccy + ny, ccx:ccx + nx] - cells[-1] ** 2, 0)))
    gw = max(2, pitch - cw)                                   # gap between cells = visible dark frame
    G = box(f, gw, ch); gaps = [G[ccy:ccy + ny, inx + i * pitch + cw + gw // 2: inx + i * pitch + cw + gw // 2 + nx] for i in range(3)]
    lum = lambda c: 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]
    best = None
    for reverse in (False, True):
        order = [3, 2, 1, 0] if reverse else [0, 1, 2, 3]
        Wc, Gc, Rc, Nc = [cells[index] for index in order]
        Lw, Lg, Lf = lum(Wc), lum(Gc), np.mean([lum(g) for g in gaps], axis=0)
        ok = (Lw / (Lg + 1) > 1.3) & (Lw / (Lg + 1) < 2.8) & (Lg / (Lf + 1) > 1.7)
        ok &= (Rc[..., 0] > 1.5 * np.maximum(Rc[..., 1], Rc[..., 2])) & (Nc[..., 1] > 1.2 * np.maximum(Nc[..., 0], Nc[..., 2]))
        ok &= Lw < 252
        for cell, std in zip(cells, stds):
            ok &= std.max(axis=-1) < FLAT * (cell.mean(axis=-1) + 12)
        if not ok.any():
            continue
        score = (
            -np.abs(np.log((Lw + 1) / (Lg + 1) / 1.875))
            - 0.5 * np.abs(np.log((Lg + 1) / (Lf + 1) / 4.2))
            - sum(std.max(axis=-1) / 60 for std in stds)
        )
        score = np.where(ok, score, -1e9)
        y, x = np.unravel_index(int(score.argmax()), score.shape)
        candidate = float(score[y, x]), int(x), int(y), reverse
        if best is None or candidate[0] > best[0]:
            best = candidate
    if best is None:
        return None
    score, x, y, reverse = best
    return score, x, y, dict(
        cw=cw, ch=ch, pitch=pitch, inx=inx, iny=iny, gw=gw, sc=sc,
        cardw=cardw, cardh=cardh, reverse=reverse,
    )


def find_card(rgb: np.ndarray):
    best = None
    for rotation in (0, 1):
        rotated = np.rot90(rgb, rotation)
        for sc in SCALES:
            hit = _search(rotated, sc)
            if hit and (best is None or hit[0] > best[0]):
                best = (*hit, rotation)
    return best


def _med(rgb, x, y, w, h):
    return np.median(rgb[y:y + h, x:x + w].reshape(-1, 3), axis=0).astype(np.float32)


def _curve(obs, true):
    """Monotone piecewise-linear curve through (obs->true) points with linear extrapolation, as a 256-LUT."""
    o, t = np.array(obs, np.float32), np.array(true, np.float32); lut = np.interp(np.arange(256), o, t)
    lo, hi = (t[1] - t[0]) / max(o[1] - o[0], 1), (t[-1] - t[-2]) / max(o[-1] - o[-2], 1)
    x = np.arange(256, dtype=np.float32); lut = np.where(x < o[0], t[0] + (x - o[0]) * lo, lut); lut = np.where(x > o[-1], t[-1] + (x - o[-1]) * hi, lut)
    return np.clip(lut, 0, 255).astype(np.uint8)


def _ridge(X, T, lam=0.1):
    """3x3 matrix mapping tone-corrected patch colours X to truth T (3xN, 0..1), shrunk toward identity."""
    I = np.eye(3, dtype=np.float32)
    return (T @ X.T + lam * I) @ np.linalg.inv(X @ X.T + lam * I)


def _cct(rgb_white) -> float | None:
    """Rough CCT (McCamy) of the observed white swatch, assuming sRGB. Indicative only."""
    r, g, b = [(v / 255.0) for v in rgb_white]; lin = lambda c: c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    r, g, b = lin(r), lin(g), lin(b)
    X, Y, Z = .4124 * r + .3576 * g + .1805 * b, .2126 * r + .7152 * g + .0722 * b, .0193 * r + .1192 * g + .9505 * b
    s = X + Y + Z
    if s <= 0: return None
    n = (X / s - .3320) / (.1858 - Y / s); return float(449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33)


@dataclass
class Calibration:
    card_found: bool
    corrected_bgr: np.ndarray                 # 224x224 BGR (== squared input if no card)
    squared_bgr: np.ndarray
    exposure: str = "unknown"                 # ok | dim | bright (warn) | dark | clipped (reject) | unknown
    cast: str = "unknown"                     # warm | neutral | cool
    white_rgb: tuple | None = None
    cct_k: float | None = None
    delta_e_before: float | None = None       # mean dE of red+green swatches vs truth, raw
    delta_e_after: float | None = None        # ... after correction (independent validation, not used in fit)
    bbox: tuple | None = None                 # x,y,w,h on the 224 image
    card_scale: float | None = None
    card_rotation: int | None = None
    detection_method: str = "none"
    saturation_gain: float | None = None
    notes: list = field(default_factory=list)


def calibrate(img_bgr: np.ndarray) -> Calibration:
    sq = to_square(img_bgr); rgb = cv2.cvtColor(sq, cv2.COLOR_BGR2RGB)
    hit = find_card(rgb)
    if not hit:
        notes = ["Reference card not detected - place the kit card inside the guide box, fully lit, and retake."]
        wl = float(np.mean(0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]))
        ex = "dark" if wl < 45 else ("clipped" if wl > 235 else "unknown")
        return Calibration(False, sq, sq, exposure=ex, notes=notes)
    _, x, y, g, rotation = hit
    rotated_rgb = np.rot90(rgb, rotation)
    cw, ch, pitch, inx, iny, gw = g["cw"], g["ch"], g["pitch"], g["inx"], g["iny"], g["gw"]
    names = ["green", "red", "grey", "white"] if g["reverse"] else ["white", "grey", "red", "green"]
    physical_cells = [
        _med(rotated_rgb, x + inx + i * pitch, y + iny, cw, ch)
        for i in range(4)
    ]
    cell = dict(zip(names, physical_cells))
    # Six-patch cards extend the legacy four-patch strip with blue and yellow.
    card_width = round(CARD_W * g["sc"])
    card_height = round(CARD_H * g["sc"])
    six_patch = False
    extra_x = x + inx + 4 * pitch
    if extra_x + cw <= rotated_rgb.shape[1] and y + iny + ch <= rotated_rgb.shape[0]:
        blue = _med(rotated_rgb, extra_x, y + iny, cw, ch)
        yellow = _med(rotated_rgb, extra_x + pitch, y + iny, cw, ch)
        if extra_x + pitch + cw <= rotated_rgb.shape[1]:
            six_patch = (
                blue[2] > blue[0] * 1.3
                and blue[1] > blue[0] * 1.2
                and yellow[0] > yellow[2] * 2
                and yellow[1] > yellow[2] * 2
            )
            if six_patch:
                cell.update(blue=blue, yellow=yellow)
                card_width = round((CARD_W + 2 * PITCH) * g["sc"])
    frame = np.mean(
        [_med(rotated_rgb, x + inx + i * pitch + cw, y + iny, gw, ch) for i in range(3)],
        axis=0,
    )
    luts = [_curve([frame[c], cell["grey"][c], cell["white"][c]], [TRUE["frame"][c], TRUE["grey"][c], TRUE["white"][c]]) for c in range(3)]
    tone = lambda v: np.array([luts[c][int(np.clip(round(float(v[c])), 0, 255))] for c in range(3)], np.float32)
    patch_names = ["frame", "grey", "white", "red", "green"]
    if six_patch:
        patch_names.extend(("blue", "yellow"))
    obs = {"frame": frame, **cell}
    X = np.stack([tone(obs[n]) for n in patch_names], 1) / 255.0
    T = np.stack([TRUE[n] for n in patch_names], 1).astype(np.float32) / 255.0
    M = _ridge(X, T)
    # Every chromatic patch is held out from its own matrix fit.
    colour_names = ["red", "green"]
    if six_patch:
        colour_names.extend(("blue", "yellow"))
    de_b = delta_e(
        np.stack([obs[n] for n in colour_names]),
        np.stack([TRUE[n] for n in colour_names]),
    )
    errs = []
    for n in colour_names:
        keep = [i for i, name in enumerate(patch_names) if name != n]
        Mi = _ridge(X[:, keep], T[:, keep])
        j = patch_names.index(n)
        errs.append(delta_e((Mi @ X[:, j])[None] * 255, np.array([TRUE[n]], np.float32)))
    de_a = float(np.mean(errs))
    f = cv2.merge([cv2.LUT(rotated_rgb[..., c], luts[c]) for c in range(3)]).astype(np.float32) / 255.0
    out = np.clip(f.reshape(-1, 3) @ M.T, 0, 1).reshape(f.shape); out = (out * 255 + .5).astype(np.uint8)
    w = cell["white"]; lw = float(.299 * w[0] + .587 * w[1] + .114 * w[2])
    notes = []
    exposure = "dark" if lw < 50 else "clipped" if min(w) >= 250 else "dim" if lw < 100 else "bright" if max(w) > 248 else "ok"
    if exposure == "dark": notes.append("Scene far too dark - the colour cannot be trusted.")
    if exposure == "clipped": notes.append("Reference white is blown out (clipped) - reduce exposure/glare and retake.")
    if exposure == "dim": notes.append("Lighting is dim - brighter light will improve reliability.")
    if exposure == "bright": notes.append("Very bright - watch for glare.")
    rb = w[0] / max(w[2], 1); cast = "warm" if rb > 1.12 else ("cool" if rb < 0.9 else "neutral")
    bbox = (x, y, card_width, card_height)
    if rotation == 1:
        bx, by, bw, bh = bbox
        bbox = (CANON - (by + bh), bx, bh, bw)
    corrected = cv2.cvtColor(np.rot90(out, -rotation).copy(), cv2.COLOR_RGB2BGR)
    cal = Calibration(
        True, corrected, sq, exposure, cast, tuple(int(v) for v in w), _cct(w),
        de_b, de_a, bbox, g["sc"], (rotation * 90) % 360, "pattern",
        notes=notes,
    )
    if de_a > 12: cal.notes.append("Colour calibration residual is high - result less reliable.")
    return cal


def jpeg_b64(bgr: np.ndarray, q: int = 88) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, q])[1].tobytes()).decode()
