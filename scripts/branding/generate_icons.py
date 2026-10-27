#!/usr/bin/env python3
"""Generate HaptiLog A icons from shared vector geometry.

Run from any directory with Python 3 and the system libcairo (no pip packages).
Android vectors, SVG masters and PNG exports share exactly the same paths.
"""
import ctypes as ct
import ctypes.util
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "watch/app/src/main/res"
OUT = ROOT / "docs/design/branding"
BG, WHITE, CORAL = "#121318", "#FFFFFF", "#FF735E"


def pill(x, y, w, h):
    r = w / 2
    k = r * 0.55228475
    return (f"M{x+r},{y} C{x+r+k},{y} {x+w},{y+r-k} {x+w},{y+r} "
            f"L{x+w},{y+h-r} C{x+w},{y+h-r+k} {x+r+k},{y+h} {x+r},{y+h} "
            f"C{x+r-k},{y+h} {x},{y+h-r+k} {x},{y+h-r} L{x},{y+r} "
            f"C{x},{y+r-k} {x+r-k},{y} {x+r},{y} Z")


# The large capsule and open cradle remain legible without color.
PATHS = [
    (WHITE, pill(46, 31, 16, 31)),
    (WHITE, "M40,53 C40,51.9 40.9,51 42,51 C43.1,51 44,51.9 44,53 "
     "L44,55 C44,61 48.5,65 54,65 C59.5,65 64,61 64,55 L64,53 "
     "C64,51.9 64.9,51 66,51 C67.1,51 68,51.9 68,53 L68,55 "
     "C68,62.5 62.8,68 56,68.9 L56,74 C56,75.1 55.1,76 54,76 "
     "C52.9,76 52,75.1 52,74 L52,68.9 C45.2,68 40,62.5 40,55 Z"),
    (CORAL, pill(27, 46, 4, 10)),
    (CORAL, pill(34, 41, 4, 16)),
    (CORAL, pill(70, 41, 4, 16)),
    (CORAL, pill(77, 46, 4, 10)),
]


def vector(mono=False):
    paths = "\n".join(
        f'    <path android:fillColor="{WHITE if mono else color}" android:pathData="{path}" />'
        for color, path in PATHS)
    # Complications use a tight viewport with padding; launchers use adaptive safe zone.
    group = f'    <group android:translateX="-21" android:translateY="-22">\n{paths}\n    </group>' if mono else paths
    viewport, size = (66, 24) if mono else (108, 108)
    return (f'<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            f'    android:width="{size}dp" android:height="{size}dp"\n'
            f'    android:viewportWidth="{viewport}" android:viewportHeight="{viewport}">\n'
            f'{group}\n</vector>\n')


def svg(mono=False):
    paths = "".join(f'<path fill="{WHITE if mono else c}" d="{p}"/>' for c, p in PATHS)
    if mono:
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="21 22 66 66">'
                + paths + '</svg>\n')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">'
            + ("" if mono else f'<path fill="{BG}" d="M0,0 L108,0 L108,108 L0,108 Z"/>')
            + '<g transform="translate(54 54) scale(1.35) translate(-54 -54)">'
            + paths + '</g></svg>\n')


cairo = ct.CDLL(ct.util.find_library("cairo"))


def bind(name, args, result=None):
    fn = getattr(cairo, "cairo_" + name)
    fn.argtypes, fn.restype = args, result
    return fn


P, D, I = ct.c_void_p, ct.c_double, ct.c_int
surface = bind("image_surface_create", [I, I, I], P)
create = bind("create", [P], P)
rgb = bind("set_source_rgb", [P, D, D, D])
paint = bind("paint", [P])
scale = bind("scale", [P, D, D])
translate = bind("translate", [P, D, D])
move = bind("move_to", [P, D, D])
line = bind("line_to", [P, D, D])
curve = bind("curve_to", [P, D, D, D, D, D, D])
close = bind("close_path", [P])
fill = bind("fill", [P])
arc = bind("arc", [P, D, D, D, D, D])
clip = bind("clip", [P])
write = bind("surface_write_to_png", [P, ct.c_char_p], I)
destroy = bind("destroy", [P])
destroy_surface = bind("surface_destroy", [P])


def color(ctx, value):
    rgb(ctx, *(int(value[i:i+2], 16) / 255 for i in (1, 3, 5)))


def draw(ctx, mono=False):
    for ink, path in PATHS:
        color(ctx, WHITE if mono else ink)
        tokens = iter(re.findall(r"[MLCZ]|-?\d+(?:\.\d+)?", path))
        for command in tokens:
            fn, count = {"M": (move, 2), "L": (line, 2), "C": (curve, 6), "Z": (close, 0)}[command]
            fn(ctx, *(float(next(tokens)) for _ in range(count)))
        fill(ctx)


def png(path, size, round_icon=False, mono=False):
    s = surface(0, size, size)
    ctx = create(s)
    scale(ctx, size / 108, size / 108)
    if round_icon:
        arc(ctx, 54, 54, 54, 0, 2 * math.pi)
        clip(ctx)
    if not mono:
        color(ctx, BG)
        paint(ctx)
    if mono:
        scale(ctx, 108 / 66, 108 / 66)
        translate(ctx, -21, -22)
    else:
        translate(ctx, 54, 54)
        scale(ctx, 1.35, 1.35)
        translate(ctx, -54, -54)
    draw(ctx, mono)
    path.parent.mkdir(parents=True, exist_ok=True)
    assert write(s, str(path).encode()) == 0, path
    destroy(ctx)
    destroy_surface(s)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (RES / "drawable/ic_launcher_foreground.xml").write_text(vector())
    (RES / "drawable/ic_haptilog_monochrome.xml").write_text(vector(True))
    (RES / "drawable/ic_launcher_background.xml").write_text(
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
        f'    <solid android:color="{BG}" />\n</shape>\n')
    for density, size in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        png(RES / f"mipmap-{density}/ic_launcher.png", size)
        png(RES / f"mipmap-{density}/ic_launcher_round.png", size, round_icon=True)
    (OUT / "haptilog-a.svg").write_text(svg())
    (OUT / "haptilog-a-monochrome.svg").write_text(svg(True))
    png(ROOT / "haptilog_icon_512.png", 512)
    png(ROOT / "web/public/playstore/icon_512.png", 512)
    png(OUT / "haptilog-a-preview.png", 512, round_icon=True)
    for size in (24, 32):
        png(OUT / f"haptilog-a-mono-{size}.png", size, mono=True)
    print("Generated Android vectors, density PNGs, Play icon and previews.")


if __name__ == "__main__":
    main()
