#!/usr/bin/env python3
"""Clear baked backgrounds from character sprite sheets -> real transparent PNGs.

The generated sheets ship with an OPAQUE checkerboard "transparency" pattern
(plus warm/green FX tinting it and a corner watermark). Naive colour-keying eats
the characters, because their dark armour/legs match the checkerboard greys. This
pipeline avoids that:

  1. rembg (isnet-general-use) -> a coarse foreground matte for the whole sheet.
  2. Erode the matte to snap the per-figure aura/flame bridges, label the
     connected blobs, and re-matte EACH figure at full resolution with
     alpha-matting edge refinement. Per-figure mattes hug the silhouette far
     tighter than one matte over a downscaled 8-up sheet (this is what makes the
     dark beast on the black checkerboard come out clean).
  3. Flat-flood cleanup: flood transparency in from the image border through
     FLAT opaque pixels. The checkerboard is flat even where FX tints it; the
     textured figures stop the flood. Kills residual squares near the feet.

Requires: pillow, numpy, scipy, rembg, onnxruntime  (pip install rembg onnxruntime)
First run downloads the ~180 MB isnet model to ~/.u2net/.

Usage:
  python tools/clear_bg.py assets --in-place        # overwrite, back up to assets/_originals/
  python tools/clear_bg.py assets --out cleaned/    # write cleaned copies under cleaned/
  python tools/clear_bg.py one_sheet.png --out .     # single file
"""
from __future__ import annotations
import argparse
import glob
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from rembg import remove, new_session

# --- tunables (defaults are what produced clean results on the Inkborn sheets) -
ERODE_BRIDGES = 7      # erosion (px) to snap aura/flame bridges between figures
MIN_FIGURE_AREA = 900  # drop matte blobs smaller than this (specks, not figures)
CROP_PAD = 16          # padding (px) around each figure box before re-matting
FLAT_STD = 9           # local-std threshold: <= this reads as flat background
ALPHA_FLOOR = 8        # alpha below this -> fully transparent (kills halo dust)


def _local_std(channel: np.ndarray, win: int = 5) -> np.ndarray:
    """Per-pixel local standard deviation over a win x win window."""
    c = channel.astype(np.float32)
    mean = ndi.uniform_filter(c, win)
    mean_sq = ndi.uniform_filter(c * c, win)
    return np.sqrt(np.maximum(mean_sq - mean * mean, 0))


def _figure_boxes(coarse_alpha: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of each figure, found by eroding the coarse matte so the
    thin FX bridges between figures break into separate connected components."""
    core = ndi.binary_erosion(coarse_alpha > 40, iterations=ERODE_BRIDGES)
    labels, n = ndi.label(core)
    boxes = []
    for i in range(1, n + 1):
        ys, xs = np.where(labels == i)
        if len(ys) < MIN_FIGURE_AREA:
            continue
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return boxes


def _flat_flood(rgba: np.ndarray) -> np.ndarray:
    """Set alpha=0 for opaque FLAT pixels reachable from the image border.
    Flat == checkerboard (even FX-tinted); the textured figure halts the flood."""
    rgb = rgba[:, :, :3].astype(np.float32)
    alpha = rgba[:, :, 3].copy()
    std = np.maximum.reduce([_local_std(rgb[:, :, i]) for i in range(3)])
    flat = ndi.binary_dilation(std < FLAT_STD, iterations=2)  # dilate to bridge seams
    labels, _ = ndi.label(flat & (alpha > 0))
    border = set(np.unique(np.concatenate(
        [labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    alpha[np.isin(labels, list(border)) & (alpha > 0)] = 0
    alpha[alpha < ALPHA_FLOOR] = 0
    rgba[:, :, 3] = alpha
    return rgba


def clear_background(path: str, session) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    coarse = np.array(remove(im, session=session))[:, :, 3]
    out = np.zeros((h, w, 4), np.uint8)
    for (x0, y0, x1, y1) in _figure_boxes(coarse):
        cx0, cy0 = max(0, x0 - CROP_PAD), max(0, y0 - CROP_PAD)
        cx1, cy1 = min(w, x1 + CROP_PAD), min(h, y1 + CROP_PAD)
        refined = np.array(remove(
            im.crop((cx0, cy0, cx1, cy1)), session=session,
            alpha_matting=True, alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=12, alpha_matting_erode_size=6))
        patch = out[cy0:cy1, cx0:cx1]
        take = refined[:, :, 3] > patch[:, :, 3]  # max-combine (figures may overlap)
        patch[take] = refined[take]
        out[cy0:cy1, cx0:cx1] = patch
    return Image.fromarray(_flat_flood(out))


def _collect(inputs: list[str]) -> list[str]:
    files = []
    for item in inputs:
        if os.path.isdir(item):
            for p in glob.glob(os.path.join(item, "**", "*.png"), recursive=True):
                if "_originals" not in p.replace("\\", "/").split("/"):
                    files.append(p)
        elif item.lower().endswith(".png"):
            files.append(item)
    return sorted(set(files))


def main() -> int:
    ap = argparse.ArgumentParser(description="Clear baked sprite-sheet backgrounds.")
    ap.add_argument("inputs", nargs="+", help="PNG file(s) or folder(s) to clean")
    ap.add_argument("--in-place", action="store_true",
                    help="overwrite originals (backed up under <root>/_originals/)")
    ap.add_argument("--out", metavar="DIR", help="write cleaned copies under DIR")
    ap.add_argument("--model", default="isnet-general-use", help="rembg model")
    args = ap.parse_args()

    if not args.in_place and not args.out:
        ap.error("choose one: --in-place or --out DIR")

    files = _collect(args.inputs)
    if not files:
        print("No PNGs found.")
        return 1

    session = new_session(args.model)
    root = args.inputs[0] if os.path.isdir(args.inputs[0]) else os.path.dirname(args.inputs[0]) or "."
    print(f"Clearing backgrounds on {len(files)} file(s) with {args.model}...")
    for f in files:
        cleaned = clear_background(f, session)
        if args.out:
            rel = os.path.relpath(f, root)
            dest = os.path.join(args.out, rel)
        else:  # --in-place: back the original up once, then overwrite
            rel = os.path.relpath(f, root)
            backup = os.path.join(root, "_originals", rel)
            os.makedirs(os.path.dirname(backup) or ".", exist_ok=True)
            if not os.path.exists(backup):
                shutil.copy2(f, backup)
            dest = f
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        cleaned.save(dest)
        print(f"  {f} -> {dest}")
    print("Done." + ("" if not args.in_place else "  Originals in <root>/_originals/."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
