#!/usr/bin/env python3
"""Generate one low-frequency receiver map for Signal's authored Studio set.

The map is intentionally colorless and shared by Light and Dark. Runtime light
can tint a spatial kernel with each bot's accent color, apply this alpha response,
then switch only the overlay blend mode for the active theme.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


STUDIO_ASSETS = {
    "dark": "studio_dark.webp",
    "light": "studio_light.webp",
}
DEFAULT_EMITTERS = ((0.185, 0.66), (0.815, 0.66))
DEMO_TINT = np.asarray((1.0, 0.12, 0.62), dtype=np.float32)


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    scaled = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return scaled * scaled * (3.0 - 2.0 * scaled)


def srgb_to_linear(image: np.ndarray) -> np.ndarray:
    return np.where(
        image <= 0.04045,
        image / 12.92,
        ((image + 0.055) / 1.055) ** 2.4,
    )


def blurred_channel(channel: np.ndarray, radius: float) -> np.ndarray:
    source = Image.fromarray(
        np.rint(np.clip(channel, 0.0, 1.0) * 255.0).astype(np.uint8),
        mode="L",
    )
    return np.asarray(
        source.filter(ImageFilter.GaussianBlur(radius=radius)),
        dtype=np.float32,
    ) / 255.0


def background_receiver_response(source: Image.Image) -> np.ndarray:
    """Estimate broad surfaces that can accept a restrained colored spill.

    This is not a geometry reconstruction. It deliberately rejects texture,
    direct practical lights, and saturated accents while favoring broad lower
    surfaces where reflected light reads convincingly.
    """

    srgb = np.asarray(source.convert("RGB"), dtype=np.float32) / 255.0
    linear = srgb_to_linear(srgb)
    luminance = (
        linear[..., 0] * 0.2126
        + linear[..., 1] * 0.7152
        + linear[..., 2] * 0.0722
    )
    width, height = source.size
    low_frequency = blurred_channel(luminance, radius=max(18.0, width * 0.024))
    low = float(np.percentile(low_frequency, 3.0))
    high = float(np.percentile(low_frequency, 97.0))
    normalized = np.clip((low_frequency - low) / max(high - low, 1e-5), 0.0, 1.0)

    # Dark materials still catch a little colored light. Midtones receive most;
    # bright practical fixtures are suppressed so they retain their own source.
    reflectance = 0.16 + 0.84 * np.sqrt(normalized)
    direct_light_rejection = 1.0 - 0.72 * smoothstep(0.78, 0.98, normalized)

    chroma = np.max(srgb, axis=2) - np.min(srgb, axis=2)
    existing_color_rejection = 1.0 - 0.28 * smoothstep(0.16, 0.48, chroma)

    y = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    lower_surface_bias = 0.34 + 0.66 * smoothstep(0.08, 0.92, y)

    response = (
        reflectance
        * direct_light_rejection
        * existing_color_rejection
        * lower_surface_bias
    )
    response = blurred_channel(response, radius=max(10.0, width * 0.012))
    return np.clip(response * 0.92, 0.0, 1.0)


def shared_receiver_response(sources: list[Image.Image]) -> np.ndarray:
    """Combine the paired exposures into one theme-independent response."""

    if not sources:
        raise ValueError("At least one Studio source image is required")
    source_size = sources[0].size
    if any(source.size != source_size for source in sources[1:]):
        raise ValueError("Studio source images must have matching dimensions")
    responses = np.stack(
        [background_receiver_response(source) for source in sources],
        axis=0,
    )
    return np.mean(responses, axis=0, dtype=np.float32)


def demo_emission(width: int, height: int) -> np.ndarray:
    y, x = np.mgrid[0:height, 0:width]
    x = x.astype(np.float32) / max(width - 1, 1)
    y = y.astype(np.float32) / max(height - 1, 1)
    spill = np.zeros((height, width), dtype=np.float32)
    for emitter_x, emitter_y in DEFAULT_EMITTERS:
        distance = ((x - emitter_x) / 0.18) ** 2 + ((y - emitter_y) / 0.25) ** 2
        spill = np.maximum(spill, np.exp(-2.35 * distance))
    return spill


def tinted_demo(
    source: Image.Image,
    response: np.ndarray,
    blend_mode: str,
) -> Image.Image:
    srgb = np.asarray(source.convert("RGB"), dtype=np.float32) / 255.0
    alpha = response * demo_emission(source.width, source.height) * 0.46
    if blend_mode == "screen":
        blended = 1.0 - (1.0 - srgb) * (1.0 - DEMO_TINT)
    elif blend_mode == "multiply":
        blended = srgb * DEMO_TINT
    else:
        raise ValueError(f"Unsupported blend mode: {blend_mode}")
    composed = srgb * (1.0 - alpha[..., None]) + blended * alpha[..., None]
    rendered = np.rint(np.clip(composed, 0.0, 1.0) * 255.0).astype(np.uint8)
    return Image.fromarray(rendered, mode="RGB")


def alpha_map(response: np.ndarray) -> Image.Image:
    alpha = np.rint(response * 255.0).astype(np.uint8)
    rgba = np.full((*alpha.shape, 4), 255, dtype=np.uint8)
    rgba[..., 3] = alpha
    return Image.fromarray(rgba, mode="RGBA")


def labeled_panel(image: Image.Image, label: str, panel_size: tuple[int, int]) -> Image.Image:
    panel = Image.new("RGB", panel_size, (10, 12, 17))
    preview = image.convert("RGB")
    preview.thumbnail((panel_size[0], panel_size[1] - 34), Image.Resampling.LANCZOS)
    panel.paste(preview, ((panel_size[0] - preview.width) // 2, 28))
    ImageDraw.Draw(panel).text((10, 8), label, fill=(224, 229, 238))
    return panel


def build_contact_sheet(
    rows: list[tuple[str, str, Image.Image, Image.Image, Image.Image]],
) -> Image.Image:
    panel_size = (560, 350)
    sheet = Image.new("RGB", (panel_size[0] * 3, panel_size[1] * len(rows)), (6, 8, 12))
    for row_index, (theme, blend_mode, source, response_preview, demo) in enumerate(rows):
        panels = (
            labeled_panel(source, f"{theme}: source", panel_size),
            labeled_panel(response_preview, "shared receiver response", panel_size),
            labeled_panel(
                demo,
                f"{theme}: shared response + {blend_mode}",
                panel_size,
            ),
        )
        for column_index, panel in enumerate(panels):
            sheet.paste(panel, (column_index * panel_size[0], row_index * panel_size[1]))
    return sheet


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--asset-dir",
        type=Path,
        default=repo_root / "apps/web/public/signal-studio",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / ".codex/output/signal-studio-bounce-light",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    sources = {
        theme: Image.open(args.asset_dir / filename).convert("RGB")
        for theme, filename in STUDIO_ASSETS.items()
    }
    response = shared_receiver_response(list(sources.values()))
    response_preview = Image.fromarray(
        np.rint(response * 255.0).astype(np.uint8),
        mode="L",
    )
    alpha_map(response).save(
        args.output_dir / "studio_bounce_response.png",
        optimize=True,
    )
    response_preview.save(
        args.output_dir / "studio_bounce_response_preview.png",
        optimize=True,
    )

    contact_rows: list[
        tuple[str, str, Image.Image, Image.Image, Image.Image]
    ] = []
    for theme, blend_mode in (("dark", "screen"), ("light", "multiply")):
        source = sources[theme]
        demo = tinted_demo(source, response, blend_mode)
        demo.save(args.output_dir / f"studio_{theme}_bounce_demo.png", optimize=True)
        contact_rows.append((theme, blend_mode, source, response_preview, demo))

    build_contact_sheet(contact_rows).save(
        args.output_dir / "signal_studio_bounce_light_contact_sheet.jpg",
        quality=92,
        optimize=True,
    )


if __name__ == "__main__":
    main()
