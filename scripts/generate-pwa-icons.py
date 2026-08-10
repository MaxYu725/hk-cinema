#!/usr/bin/env python3
"""Generate deterministic HK Cinema PWA PNG icons using only Python stdlib."""

from __future__ import annotations

import binascii
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "icons"

BG = (23, 25, 29)
WHITE = (255, 255, 255)
GREEN = (28, 143, 91)


def inside_round_rect(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
    if left + radius <= x <= right - radius or top + radius <= y <= bottom - radius:
        return left <= x <= right and top <= y <= bottom
    cx = left + radius if x < left + radius else right - radius
    cy = top + radius if y < top + radius else bottom - radius
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def inside_triangle(px: int, py: int, a, b, c) -> bool:
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    p = (px, py)
    d1 = sign(p, a, b)
    d2 = sign(p, b, c)
    d3 = sign(p, c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def pixel(size: int, x: int, y: int) -> tuple[int, int, int]:
    # The glyph stays inside the central ~60% safe zone so maskable crops remain readable.
    outer = (
        int(size * 0.20),
        int(size * 0.23),
        int(size * 0.80),
        int(size * 0.77),
        max(2, int(size * 0.055)),
    )
    inner = (
        int(size * 0.31),
        int(size * 0.34),
        int(size * 0.69),
        int(size * 0.66),
        max(2, int(size * 0.035)),
    )
    stroke = max(2, int(size * 0.04))

    ol, ot, or_, ob, rr = outer
    il, it, ir, ib, irr = inner

    in_outer = inside_round_rect(x, y, ol, ot, or_, ob, rr)
    in_outer_inner = inside_round_rect(
        x,
        y,
        ol + stroke,
        ot + stroke,
        or_ - stroke,
        ob - stroke,
        max(1, rr - stroke),
    )

    if in_outer and not in_outer_inner:
        return WHITE

    if inside_round_rect(x, y, il, it, ir, ib, irr):
        tri = (
            (int(size * 0.455), int(size * 0.405)),
            (int(size * 0.455), int(size * 0.595)),
            (int(size * 0.605), int(size * 0.50)),
        )
        return GREEN if inside_triangle(x, y, *tri) else WHITE

    return BG


def png_chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", binascii.crc32(body) & 0xFFFFFFFF)


def write_png(path: Path, size: int) -> None:
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type: None
        for x in range(size):
            rows.extend(pixel(size, x, y))

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)))
    png.extend(png_chunk(b"IDAT", zlib.compress(bytes(rows), level=9)))
    png.extend(png_chunk(b"IEND", b""))
    path.write_bytes(png)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon-maskable-512.png": 512,
        "apple-touch-icon.png": 180,
    }
    for filename, size in targets.items():
        write_png(OUT / filename, size)
        print(f"generated {OUT / filename} ({size}x{size})")


if __name__ == "__main__":
    main()
