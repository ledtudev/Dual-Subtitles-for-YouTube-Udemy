#!/usr/bin/env python3
"""Render icons/icon{16,48,128}.png from the shapes of icons/icon.svg (no image library needed).

Draws at 4x and averages each 4x4 block, which gives anti-aliased edges.
"""

import struct
import zlib
from pathlib import Path

SCALE = 4


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def inside_round_rect(x: float, y: float, rx: float, ry: float, w: float, h: float, r: float) -> bool:
    if not (rx <= x <= rx + w and ry <= y <= ry + h):
        return False
    cx = min(max(x, rx + r), rx + w - r)
    cy = min(max(y, ry + r), ry + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_triangle(x: float, y: float) -> bool:
    # M56 42 L76 54 L56 66: right-pointing play mark
    return x >= 56 and abs(y - 54) <= (76 - x) * 12 / 20


def pixel(x: float, y: float) :
    """Colour of one point in the 128-unit design space (straight alpha)."""
    if not inside_round_rect(x, y, 0, 0, 128, 128, 28):
        return (0, 0, 0, 0)
    t = (x + y) / 256
    colour = (lerp(0x63, 0x43, t), lerp(0x66, 0x38, t), lerp(0xF1, 0xCA, t))
    if inside_round_rect(x, y, 22, 30, 84, 48, 8):
        colour = tuple(lerp(c, d, 0.45) for c, d in zip(colour, (0x1E, 0x1B, 0x4B)))
    if inside_triangle(x, y):
        colour = (255, 255, 255)
    if inside_round_rect(x, y, 24, 84, 80, 12, 6):
        colour = (255, 255, 255)
    if inside_round_rect(x, y, 36, 102, 56, 12, 6):
        colour = (0xFF, 0xD8, 0x4D)
    return (*colour, 255)


def render(size: int) -> bytes:
    rows = []
    step = 128 / (size * SCALE)
    for py in range(size):
        row = bytearray([0])  # PNG filter: none
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SCALE):
                for sx in range(SCALE):
                    r, g, b, a = pixel((px * SCALE + sx + 0.5) * step, (py * SCALE + sy + 0.5) * step)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            n = SCALE * SCALE
            alpha = acc[3] / n
            row += bytes([round(acc[i] / acc[3]) if acc[3] else 0 for i in range(3)] + [round(alpha)])
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    for size in (16, 32, 48, 128):
        (out / f"icon{size}.png").write_bytes(render(size))
        print(f"icons/icon{size}.png")
