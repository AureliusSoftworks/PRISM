#!/usr/bin/env python3
"""
Rasterize design/app-icons/*.svg into platform app icons (macOS, iOS, web, Windows).

Requires macOS qlmanage for SVG → PNG, plus Pillow for resize / ICO / JPEG.

Usage (from repo root):
  python3 scripts/render-app-icons.py
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:
    print("Install Pillow: python3 -m pip install pillow", file=sys.stderr)
    raise SystemExit(1) from exc

REPO = Path(__file__).resolve().parents[1]
DESIGN = REPO / "design" / "app-icons"
CLIENT_SVG = DESIGN / "prism-client-app-icon.svg"
SERVER_SVG = DESIGN / "prism-server-app-icon.svg"

MASTER_PX = 1024


def rasterize_svg(svg: Path, out_png: Path) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    system = platform.system()
    if system == "Darwin":
        tmp = out_png.parent / f".tmp-{svg.stem}"
        tmp.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["qlmanage", "-t", f"-s{MASTER_PX}", "-o", str(tmp), str(svg)],
            check=True,
            capture_output=True,
        )
        produced = tmp / f"{svg.name}.png"
        if not produced.is_file():
            raise RuntimeError(f"qlmanage did not produce: {produced}")
        shutil.move(str(produced), str(out_png))
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        raise RuntimeError(
            f"SVG rasterize is only automated on macOS (qlmanage). On {system}, copy a {MASTER_PX}px PNG to {out_png} or run this script on a Mac."
        )


def resize_master(src: Path, size: int) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    if im.size != (MASTER_PX, MASTER_PX):
        im = im.resize((MASTER_PX, MASTER_PX), Image.Resampling.LANCZOS)
    if size == MASTER_PX:
        return im
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG")


def write_mac_appiconset(master: Path, dest_dir: Path) -> None:
    """Generate AppIcon.appiconset for macOS."""
    import json

    dest = dest_dir / "AppIcon.appiconset"
    dest.mkdir(parents=True, exist_ok=True)
    rows = [
        ("16x16", "icon_16x16.png", "1x", 16),
        ("16x16", "icon_16x16@2x.png", "2x", 32),
        ("32x32", "icon_32x32.png", "1x", 32),
        ("32x32", "icon_32x32@2x.png", "2x", 64),
        ("128x128", "icon_128x128.png", "1x", 128),
        ("128x128", "icon_128x128@2x.png", "2x", 256),
        ("256x256", "icon_256x256.png", "1x", 256),
        ("256x256", "icon_256x256@2x.png", "2x", 512),
        ("512x512", "icon_512x512.png", "1x", 512),
        ("512x512", "icon_512x512@2x.png", "2x", 1024),
    ]
    for _sz, filename, _sc, px in rows:
        save_png(resize_master(master, px), dest / filename)

    contents = {
        "images": [
            {"size": sz, "idiom": "mac", "filename": fn, "scale": sc}
            for sz, fn, sc, _px in rows
        ],
        "info": {"author": "xcode", "version": 1},
    }
    (dest / "Contents.json").write_text(json.dumps(contents, indent=2) + "\n", encoding="utf-8")

    root_contents = {"info": {"author": "xcode", "version": 1}}
    (dest_dir / "Contents.json").write_text(
        json.dumps(root_contents, indent=2) + "\n", encoding="utf-8"
    )


def write_ios_appiconset(master: Path, dest_dir: Path) -> None:
    """Generate AppIcon.appiconset for iOS (iPhone + iPad + marketing)."""
    import json

    dest = dest_dir / "AppIcon.appiconset"
    dest.mkdir(parents=True, exist_ok=True)

    unique_sizes: list[tuple[str, int]] = [
        ("AppIcon-1024.png", 1024),
        ("AppIcon-20.png", 20),
        ("AppIcon-20@2x.png", 40),
        ("AppIcon-20@3x.png", 60),
        ("AppIcon-29.png", 29),
        ("AppIcon-29@2x.png", 58),
        ("AppIcon-29@3x.png", 87),
        ("AppIcon-40.png", 40),
        ("AppIcon-40@2x.png", 80),
        ("AppIcon-40@3x.png", 120),
        ("AppIcon-60@2x.png", 120),
        ("AppIcon-60@3x.png", 180),
        ("AppIcon-76.png", 76),
        ("AppIcon-76@2x.png", 152),
        ("AppIcon-83.5@2x.png", 167),
    ]
    for filename, px in unique_sizes:
        save_png(resize_master(master, px), dest / filename)

    # Build Contents.json image list (unique by filename)
    images: list[dict] = []

    def add(idiom: str, size_pt: str, scale: str, filename: str) -> None:
        images.append(
            {
                "idiom": idiom,
                "size": size_pt,
                "scale": scale,
                "filename": filename,
            }
        )

    add("ios-marketing", "1024x1024", "1x", "AppIcon-1024.png")
    add("ipad", "20x20", "1x", "AppIcon-20.png")
    add("ipad", "20x20", "2x", "AppIcon-20@2x.png")
    add("iphone", "20x20", "2x", "AppIcon-20@2x.png")
    add("iphone", "20x20", "3x", "AppIcon-20@3x.png")
    add("ipad", "29x29", "1x", "AppIcon-29.png")
    add("ipad", "29x29", "2x", "AppIcon-29@2x.png")
    add("iphone", "29x29", "2x", "AppIcon-29@2x.png")
    add("iphone", "29x29", "3x", "AppIcon-29@3x.png")
    add("ipad", "40x40", "1x", "AppIcon-40.png")
    add("ipad", "40x40", "2x", "AppIcon-40@2x.png")
    add("iphone", "40x40", "2x", "AppIcon-40@2x.png")
    add("iphone", "40x40", "3x", "AppIcon-40@3x.png")
    add("iphone", "60x60", "2x", "AppIcon-60@2x.png")
    add("iphone", "60x60", "3x", "AppIcon-60@3x.png")
    add("ipad", "76x76", "1x", "AppIcon-76.png")
    add("ipad", "76x76", "2x", "AppIcon-76@2x.png")
    add("ipad", "83.5x83.5", "2x", "AppIcon-83.5@2x.png")

    (dest / "Contents.json").write_text(
        json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    root_contents = {"info": {"author": "xcode", "version": 1}}
    (dest_dir / "Contents.json").write_text(
        json.dumps(root_contents, indent=2) + "\n", encoding="utf-8"
    )


def write_ico(master: Path, ico_path: Path) -> None:
    im = resize_master(master, 256)
    # ICO: include common sizes
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = [resize_master(master, s[0]) for s in sizes]
    im_rgb = [i.convert("RGBA") for i in images]
    ico_path.parent.mkdir(parents=True, exist_ok=True)
    im_rgb[0].save(
        ico_path,
        format="ICO",
        sizes=[(i.width, i.height) for i in im_rgb],
        append_images=im_rgb[1:],
    )


def write_web_assets(master: Path, public_dir: Path) -> None:
    public_dir.mkdir(parents=True, exist_ok=True)
    save_png(resize_master(master, 192), public_dir / "icon-192.png")
    save_png(resize_master(master, 512), public_dir / "icon-512.png")
    save_png(resize_master(master, 180), public_dir / "apple-touch-icon.png")
    # JPEG for existing in-app <img> references
    rgb = resize_master(master, 512).convert("RGB")
    rgb.save(public_dir / "icon.jpg", format="JPEG", quality=92)


def main() -> None:
    cache = DESIGN / ".render-cache"
    cache.mkdir(parents=True, exist_ok=True)
    client_master = cache / "client-1024.png"
    server_master = cache / "server-1024.png"
    rasterize_svg(CLIENT_SVG, client_master)
    rasterize_svg(SERVER_SVG, server_master)

    # macOS + iOS asset catalogs
    write_mac_appiconset(client_master, REPO / "apps" / "client-mac" / "PrismClient" / "Assets.xcassets")
    write_mac_appiconset(server_master, REPO / "apps" / "server-mac" / "PrismServer" / "Assets.xcassets")
    write_ios_appiconset(client_master, REPO / "apps" / "ios-client" / "PrismIOS" / "Assets.xcassets")

    # Web (client identity)
    write_web_assets(client_master, REPO / "apps" / "web" / "public")

    # Windows server
    write_ico(server_master, REPO / "apps" / "server-windows" / "src" / "Assets" / "prism-server.ico")

    print("Rendered app icons into:")
    print("  apps/client-mac/PrismClient/Assets.xcassets/")
    print("  apps/server-mac/PrismServer/Assets.xcassets/")
    print("  apps/ios-client/PrismIOS/Assets.xcassets/")
    print("  apps/web/public/ (icon-*.png, apple-touch-icon.png, icon.jpg)")
    print("  apps/server-windows/src/Assets/prism-server.ico")


if __name__ == "__main__":
    main()
