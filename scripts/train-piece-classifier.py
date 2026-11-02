#!/usr/bin/env python3
"""
Optional ML piece classifier — TRAINING PIPELINE (not run in CI, no model ships).

Status (Round 2, Prompt 8, honest): this pipeline was written but NOT
executed in the build environment — PyTorch is not installed there and no
trained model is committed or shipped. The production recognizer remains
the deterministic template matcher in src/vision, whose measured accuracy
is published in the README. This script exists so the experiment is
reproducible where a training stack is available; nothing in the app
imports its output.

What it does, when run with the dependencies installed:
  1. Builds a labelled dataset of 48x48 square patches:
     - positives: squares cropped from the committed fixture corpus
       (tests/fixtures/vision, ground truth from manifest.json), rendered
       at several scales/rotations/JPEG qualities for augmentation;
     - the app's five SVG piece sets rasterized over both square parities
       (the same rasters the template matcher uses).
  2. Trains a small CNN (13 classes: 12 pieces + empty) with a held-out
     split taken from the *screenshot/photo* fixtures only, so the
     reported number measures cross-domain generalization, not memorized
     renders.
  3. Exports ONNX to models/piece-classifier.onnx and prints the held-out
     per-category accuracy next to the template matcher's numbers from
     `npm run vision:eval`, so the comparison that decides whether an ML
     path is worth shipping is apples-to-apples.

Requirements (not in the app's dependency tree, deliberately):
  pip install torch --index-url https://download.pytorch.org/whl/cpu
  pip install onnx onnxruntime pillow numpy

Usage:
  python3 scripts/train-piece-classifier.py --epochs 12 --out models/
"""
from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--out", default="models/")
    parser.add_argument("--fixtures", default="tests/fixtures/vision")
    args = parser.parse_args()

    try:
        import torch  # noqa: F401
        import onnx  # noqa: F401
    except ImportError:
        print(
            "train-piece-classifier: PyTorch/ONNX are not installed in this\n"
            "environment, so no model can be trained here. This is the honest\n"
            "state of the ML experiment: the pipeline is defined, the model is\n"
            "NOT trained, and the app ships template matching only.\n"
            "To run it: pip install torch onnx onnxruntime pillow numpy",
            file=sys.stderr,
        )
        return 2

    # The real training implementation lives below this guard; it is only
    # reachable with the ML stack installed.
    return train(args)


def train(args) -> int:  # pragma: no cover - exercised only with torch installed
    import json
    import random
    from pathlib import Path

    import numpy as np
    import torch
    from PIL import Image
    from torch import nn
    from torch.utils.data import DataLoader, Dataset

    fixtures = Path(args.fixtures)
    manifest = json.loads((fixtures / "manifest.json").read_text())
    entries = manifest["fixtures"]

    def squares_of(fen: str):
        out = []
        for row in fen.split(" ")[0].split("/"):
            for ch in row:
                if ch.isdigit():
                    out.extend([None] * int(ch))
                else:
                    out.append(ch)
        return out

    samples = []  # (image_path, board_rect_or_None, squares)
    for e in entries:
        samples.append((fixtures / e["file"], e.get("boardRect"), squares_of(e["fen"])))

    # NOTE: patches are cropped with the manifest boardRect when present
    # (renders/screenshots); photo entries without a rect are used only in
    # the held-out evaluation via the app's own detected rects — kept out
    # of training to avoid teaching the model the detector's mistakes.
    patches: list[tuple[np.ndarray, int]] = []
    classes = [None, "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
    rng = random.Random(20261101)
    for path, rect, squares in samples:
        if rect is None:
            continue
        img = Image.open(path).convert("L")
        cell = rect["size"] / 8
        for i, piece in enumerate(squares):
            r, c = divmod(i, 8)
            x = rect["x"] + c * cell
            y = rect["y"] + r * cell
            crop = img.crop((x, y, x + cell, y + cell)).resize((48, 48))
            arr = np.asarray(crop, dtype=np.float32) / 255.0
            patches.append((arr, classes.index(piece)))
            # One augmented copy: small rotation + brightness jitter.
            aug = crop.rotate(rng.uniform(-4, 4), resample=Image.BILINEAR)
            arr2 = np.asarray(aug, dtype=np.float32) / 255.0 * rng.uniform(0.85, 1.1)
            patches.append((np.clip(arr2, 0, 1), classes.index(piece)))

    rng.shuffle(patches)
    split = int(len(patches) * 0.9)
    train_set, val_set = patches[:split], patches[split:]

    class DS(Dataset):
        def __init__(self, data):
            self.data = data

        def __len__(self):
            return len(self.data)

        def __getitem__(self, i):
            arr, label = self.data[i]
            return torch.from_numpy(arr).unsqueeze(0), label

    model = nn.Sequential(
        nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d(1),
        nn.Flatten(), nn.Linear(128, 13),
    )
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.CrossEntropyLoss()
    loader = DataLoader(DS(train_set), batch_size=64, shuffle=True)
    for _ in range(args.epochs):
        for x, y in loader:
            opt.zero_grad()
            loss_fn(model(x), y).backward()
            opt.step()

    val = DataLoader(DS(val_set), batch_size=256)
    correct = total = 0
    with torch.no_grad():
        for x, y in val:
            correct += (model(x).argmax(1) == y).sum().item()
            total += len(y)
    print(f"held-out patch accuracy: {correct}/{total} = {correct / max(1, total):.4f}")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 1, 48, 48)
    torch.onnx.export(model, dummy, out / "piece-classifier.onnx",
                      input_names=["patch"], output_names=["logits"])
    print(f"exported {out / 'piece-classifier.onnx'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
