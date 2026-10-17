#!/usr/bin/env python3
"""
generate-icons.py
Pure Python (stdlib only: zlib, struct, math) raster PNG icon generator for Friction Layer.
Produces icon16.png, icon32.png, icon48.png, and icon128.png without PIL or external dependencies.
"""

import os
import math
import zlib
import struct

def make_png(width, height, rgba_buffer):
    """Encodes raw RGBA buffer into a valid PNG byte stream."""
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0) # 8-bit RGBA
    
    scanlines = bytearray()
    row_bytes = width * 4
    for y in range(height):
        scanlines.append(0) # Filter type 0 (None)
        scanlines.extend(rgba_buffer[y * row_bytes : (y + 1) * row_bytes])

    idat = zlib.compress(bytes(scanlines), level=9)
    return header + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

def render_friction_icon(size):
    """Renders the Friction Layer shield & horizontal wave filters at the given resolution."""
    buf = bytearray(size * size * 4)

    def set_pixel(x, y, r, g, b, a):
        if 0 <= x < size and 0 <= y < size:
            idx = (y * size + x) * 4
            # Alpha blend over existing pixel
            dst_a = buf[idx + 3] / 255.0
            src_a = a / 255.0
            out_a = src_a + dst_a * (1.0 - src_a)
            if out_a > 0.001:
                out_r = (r * src_a + buf[idx] * dst_a * (1.0 - src_a)) / out_a
                out_g = (g * src_a + buf[idx + 1] * dst_a * (1.0 - src_a)) / out_a
                out_b = (b * src_a + buf[idx + 2] * dst_a * (1.0 - src_a)) / out_a
                buf[idx] = int(min(255, max(0, out_r)))
                buf[idx + 1] = int(min(255, max(0, out_g)))
                buf[idx + 2] = int(min(255, max(0, out_b)))
                buf[idx + 3] = int(min(255, max(0, out_a * 255)))

    # Supersampling factor for clean antialiasing
    scale = 2
    sw, sh = size * scale, size * scale

    # Palette
    # Background: #0a1128 -> #1e293b
    # Outer Border: #334155
    # Primary Teal: #14b8a6 (20, 184, 166)
    # Bright Teal: #2dd4bf (45, 212, 191)
    # Sky Accent: #38bdf8 (56, 189, 248)

    corner_radius = sw * 0.22

    for sy in range(sh):
        norm_y = sy / sh
        for sx in range(sw):
            # Check rounded box bounds
            # Distance from corners
            cx = max(corner_radius, min(sw - corner_radius, sx))
            cy = max(corner_radius, min(sh - corner_radius, sy))
            dist_sq = (sx - cx) ** 2 + (sy - cy) ** 2

            if dist_sq <= corner_radius ** 2:
                # Inside card
                # Gradient background (navy to slate)
                bg_r = int(10 + (30 - 10) * norm_y)
                bg_g = int(17 + (41 - 17) * norm_y)
                bg_b = int(40 + (59 - 40) * norm_y)
                bg_a = 255

                # Border edge check
                dist = math.sqrt(dist_sq)
                if dist > corner_radius - (1.5 * scale):
                    # Border #334155
                    bg_r, bg_g, bg_b = 51, 65, 85

                # Normalized coords centered [-1, 1]
                nx = (sx - sw / 2) / (sw / 2)
                ny = (sy - sh / 2) / (sh / 2)

                # Shield test:
                # Top edge around ny = -0.65 to 0.7
                # Shield boundary equation
                in_shield = False
                if -0.65 <= ny <= 0.75:
                    max_w = 0.65 * (1.0 - max(0.0, (ny - 0.0) / 0.75) ** 1.5)
                    if abs(nx) <= max_w:
                        in_shield = True

                # Draw Friction Layer horizontal plates
                # 3 horizontal curved plates
                # Plate 1: ny ~ -0.25
                # Plate 2: ny ~ 0.05
                # Plate 3: ny ~ 0.35
                plate_hit = False
                color = (45, 212, 191) # Bright teal
                
                # Plate 1
                y_curve1 = -0.25 + 0.1 * (nx ** 2)
                if abs(ny - y_curve1) < 0.08 and abs(nx) < 0.45:
                    plate_hit = True
                    color = (45, 212, 191) # #2dd4bf
                
                # Plate 2
                y_curve2 = 0.05 + 0.09 * (nx ** 2)
                if abs(ny - y_curve2) < 0.09 and abs(nx) < 0.52:
                    plate_hit = True
                    color = (20, 184, 166) # #14b8a6

                # Plate 3
                y_curve3 = 0.33 + 0.08 * (nx ** 2)
                if abs(ny - y_curve3) < 0.08 and abs(nx) < 0.40:
                    plate_hit = True
                    color = (13, 148, 136) # #0d9488

                # Core gem at (0, 0.58)
                gem_dist = math.sqrt(nx ** 2 + ((ny - 0.58) * 1.2) ** 2)
                if gem_dist < 0.12:
                    plate_hit = True
                    color = (56, 189, 248) # #38bdf8

                if plate_hit:
                    px_r, px_g, px_b, px_a = color[0], color[1], color[2], 255
                elif in_shield and (abs(abs(nx) - max_w) < 0.06 or (abs(ny - (-0.65)) < 0.05 and abs(nx) < 0.6)):
                    # Shield outline glow
                    px_r, px_g, px_b, px_a = 20, 184, 166, 220
                else:
                    px_r, px_g, px_b, px_a = bg_r, bg_g, bg_b, bg_a

                # Accumulate to target buffer
                target_x = sx // scale
                target_y = sy // scale
                alpha_sample = int(px_a / (scale * scale))
                set_pixel(target_x, target_y, px_r, px_g, px_b, alpha_sample)

    return make_png(size, size, buf)

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    sizes = [16, 32, 48, 128]
    for size in sizes:
        png_data = render_friction_icon(size)
        filepath = os.path.join(icons_dir, f"icon{size}.png")
        with open(filepath, 'wb') as f:
            f.write(png_data)
        print(f"Generated {filepath} ({len(png_data)} bytes)")

if __name__ == '__main__':
    main()
