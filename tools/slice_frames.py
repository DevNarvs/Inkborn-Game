#!/usr/bin/env python3
"""Slice the (background-cleared) character sheets into uniform animation strips.

These AI sheets are uniform grids underneath, but their row/column count can't be
auto-detected reliably (the inter-row gutter is too thin, and FX bridges columns).
So the grid is HARDCODED below (verified by eye), and each sheet is divided into
equal R×C cells. Within each cell the figure is tight-cropped by its alpha bbox and
re-packed into a uniform per-character cell, anchored FEET-BOTTOM-CENTER so frames
don't jitter during playback. Frames are taken in row-major (reading) order.

Emits public/sprites/<char>_<action>.png + public/sprites/sprites.json, plus a
verification montage of the output strips. If a strip shows split/doubled figures,
fix that sheet's entry in GRID and re-run.

Usage:  python tools/slice_frames.py
"""
from __future__ import annotations
import glob
import json
import os

import numpy as np
from PIL import Image, ImageDraw

ASSETS = "assets"
OUT = "public/sprites"
PAD = 8
BOTTOM_PAD = 6

# (rows, cols) per sheet stem — verified against the per-character montages.
GRID = {
    "versper_idle": (1, 5), "vesper_attack": (2, 4), "vesper_down": (1, 5),
    "vesper_hit": (1, 4), "vesper_skill": (2, 5), "vesper_ultimate": (2, 4),
    "mawgrim_attack": (2, 4), "mawgrim_down": (2, 3), "mawgrim_hit": (1, 4),
    "mawgrim_idle": (2, 4), "mawgrim_skill": (2, 4), "mawgrim_ult": (2, 4),
    "pyra_attack": (2, 4), "pyra_down": (2, 3), "pyra_hit": (1, 4),
    "pyra_idle": (2, 4), "pyra_skill": (2, 5), "pyra_ult": (2, 4),
}

ACTION_PLAYBACK = {
    "idle": {"fps": 6, "loop": True},
    "attack": {"fps": 14, "loop": False},
    "skill": {"fps": 12, "loop": False},
    "ultimate": {"fps": 12, "loop": False},
    "hit": {"fps": 14, "loop": False},
    "down": {"fps": 8, "loop": False},
}


def action_of(stem: str) -> str:
    n = stem.lower()
    for a in ("idle", "attack", "skill", "hit", "down"):
        if a in n:
            return a
    if "ult" in n:
        return "ultimate"
    return "unknown"


def figure_bbox(alpha_cell: np.ndarray):
    ys, xs = np.where(alpha_cell > 16)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def cells_for(im: Image.Image, rows: int, cols: int):
    """Crop each figure (alpha bbox) from an R×C equal division of the content area,
    in row-major order. Returns (crops, abs_boxes)."""
    arr = np.array(im)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 16)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
    crops, boxes = [], []
    for r in range(rows):
        for c in range(cols):
            gx0, gy0 = int(x0 + c * cw), int(y0 + r * ch)
            gx1, gy1 = int(x0 + (c + 1) * cw), int(y0 + (r + 1) * ch)
            bb = figure_bbox(alpha[gy0:gy1, gx0:gx1])
            if bb is None:
                continue
            bx0, by0, bx1, by1 = bb
            box = (gx0 + bx0, gy0 + by0, gx0 + bx1, gy0 + by1)
            crops.append(im.crop(box))
            boxes.append(box)
    return crops, boxes


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    sheets = sorted(glob.glob(os.path.join(ASSETS, "*", "*.png")))
    sheets = [s for s in sheets if "_originals" not in s.replace("\\", "/").split("/")]

    parsed = {}
    per_char_dims: dict[str, list] = {}
    idle_body: dict[str, int] = {}
    for path in sheets:
        stem = os.path.splitext(os.path.basename(path))[0]
        char = os.path.basename(os.path.dirname(path)).lower()
        action = action_of(stem)
        if stem not in GRID or action == "unknown":
            print(f"  ! skip {path} (no grid / action)")
            continue
        if action == "ultimate":
            # Ultimate sheets have FX-driven non-uniform figure spacing that
            # uniform division can't slice cleanly; the game maps ult -> skill.
            print(f"  ~ skip {char}_ultimate (non-uniform; ult maps to skill in-game)")
            continue
        rows, cols = GRID[stem]
        im = Image.open(path).convert("RGBA")
        crops, _ = cells_for(im, rows, cols)
        alpha = np.array(im)[:, :, 3]
        ys = np.where(alpha > 16)[0]
        fig_scale = (ys.max() - ys.min()) / rows  # per-figure vertical extent (source px)
        parsed[f"{char}_{action}"] = {
            "char": char, "action": action, "crops": crops, "figScale": fig_scale,
        }
        print(f"  {char}_{action}: {rows}x{cols} -> {len(crops)} frames")

    # 1-row sheets draw figures ~2x larger than 2-row sheets. Downscale each
    # action to the character's smallest per-figure scale so every action of a
    # character renders at the same on-screen size.
    char_ref: dict[str, float] = {}
    for info in parsed.values():
        c = info["char"]
        char_ref[c] = min(char_ref.get(c, 1e9), info["figScale"])
    for info in parsed.values():
        k = char_ref[info["char"]] / info["figScale"]
        if k < 0.98:
            info["crops"] = [
                cr.resize((max(1, round(cr.width * k)), max(1, round(cr.height * k))), Image.LANCZOS)
                for cr in info["crops"]
            ]
    for info in parsed.values():
        for cr in info["crops"]:
            per_char_dims.setdefault(info["char"], []).append((cr.width, cr.height))
        if info["action"] == "idle" and info["crops"]:
            idle_body[info["char"]] = int(np.median([c.height for c in info["crops"]]))

    cell_dims = {
        ch: (max(w for w, _ in d) + PAD * 2, max(h for _, h in d) + PAD + BOTTOM_PAD)
        for ch, d in per_char_dims.items()
    }

    manifest = {}
    strips = []
    for key, info in parsed.items():
        char, action, crops = info["char"], info["action"], info["crops"]
        cw, chh = cell_dims[char]
        strip = Image.new("RGBA", (cw * len(crops), chh), (0, 0, 0, 0))
        for i, cr in enumerate(crops):
            strip.alpha_composite(cr, (i * cw + (cw - cr.width) // 2, chh - BOTTOM_PAD - cr.height))
        strip.save(os.path.join(OUT, f"{key}.png"))
        strips.append((key, strip))
        play = ACTION_PLAYBACK[action]
        manifest[key] = {
            "char": char, "action": action,
            "frameWidth": int(cw), "frameHeight": int(chh),
            "frames": int(len(crops)), "fps": play["fps"], "loop": play["loop"],
        }

    chars = {
        ch: {"frameWidth": int(cell_dims[ch][0]), "frameHeight": int(cell_dims[ch][1]),
             "bodyPx": idle_body.get(ch, cell_dims[ch][1])}
        for ch in cell_dims
    }
    with open(os.path.join(OUT, "sprites.json"), "w") as f:
        json.dump({"chars": chars, "strips": manifest}, f, indent=2)

    # verification montage: each strip on a checker-ish dark bg, labeled
    pad = 18
    sw = 900
    thumbs = []
    for key, strip in strips:
        comp = Image.alpha_composite(Image.new("RGBA", strip.size, (40, 40, 48, 255)), strip).convert("RGB")
        w, h = comp.size
        thumbs.append((key, comp.resize((sw, int(sw * h / w)))))
    rowh = max(t.size[1] for _, t in thumbs) + 20
    M = Image.new("RGB", (sw, rowh * len(thumbs)), (0, 0, 0))
    d = ImageDraw.Draw(M)
    for i, (key, t) in enumerate(thumbs):
        d.text((4, i * rowh + 2), key, fill=(120, 230, 120))
        M.paste(t, (0, i * rowh + 18))
    M.save(os.path.join("tools", "_strips_preview.png"))  # outside public/ (not bundled)
    print(f"\nWrote {len(manifest)} strips + sprites.json. Cells: {cell_dims}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
