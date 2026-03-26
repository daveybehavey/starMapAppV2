#!/usr/bin/env python3

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT_DIR = PUBLIC / "printproof" / "home"
SIZE = (1200, 1200)


@dataclass(frozen=True)
class CompositeSpec:
  output_name: str
  texture_path: str
  art_path: str
  art_scale: float
  art_offset: tuple[int, int] = (0, 0)
  art_crop_inset: tuple[int, int, int, int] = (0, 0, 0, 0)
  tint_rgba: tuple[int, int, int, int] = (255, 255, 255, 0)
  drop_shadow_alpha: int = 140
  drop_shadow_blur: int = 18
  drop_shadow_offset: tuple[int, int] = (0, 20)
  matte_border: int = 0
  matte_color: tuple[int, int, int, int] = (247, 243, 233, 255)


def load_texture(path: Path, size: tuple[int, int]) -> Image.Image:
  texture = Image.open(path).convert("RGB")
  return ImageOps.fit(texture, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def make_stage(texture_path: str, tint_rgba: tuple[int, int, int, int]) -> Image.Image:
  stage = load_texture(PUBLIC / texture_path, SIZE).convert("RGBA")
  if tint_rgba[3] > 0:
    stage = Image.alpha_composite(stage, Image.new("RGBA", SIZE, tint_rgba))

  # Add subtle edge vignette so the artwork reads with more depth.
  vignette_mask = Image.new("L", SIZE, 0)
  draw = ImageDraw.Draw(vignette_mask)
  draw.rectangle((0, 0, SIZE[0], SIZE[1]), fill=190)
  inset = 140
  draw.rectangle((inset, inset, SIZE[0] - inset, SIZE[1] - inset), fill=0)
  vignette_mask = vignette_mask.filter(ImageFilter.GaussianBlur(110))
  stage = Image.composite(Image.new("RGBA", SIZE, (0, 0, 0, 60)), stage, vignette_mask)

  # Add top highlight for a soft "room light" look.
  highlight = Image.new("L", SIZE, 0)
  draw = ImageDraw.Draw(highlight)
  draw.ellipse((-200, -320, SIZE[0] + 200, 520), fill=255)
  highlight = highlight.filter(ImageFilter.GaussianBlur(90))
  stage = Image.composite(Image.new("RGBA", SIZE, (255, 255, 255, 44)), stage, highlight)

  return stage


def add_shadow(canvas: Image.Image, subject: Image.Image, origin: tuple[int, int], spec: CompositeSpec) -> None:
  alpha = subject.getchannel("A")
  shadow = Image.new("RGBA", subject.size, (0, 0, 0, spec.drop_shadow_alpha))
  shadow.putalpha(alpha)
  shadow = shadow.filter(ImageFilter.GaussianBlur(spec.drop_shadow_blur))
  shadow_origin = (
    origin[0] + spec.drop_shadow_offset[0],
    origin[1] + spec.drop_shadow_offset[1],
  )
  canvas.alpha_composite(shadow, dest=shadow_origin)


def maybe_wrap_matte(subject: Image.Image, spec: CompositeSpec) -> Image.Image:
  if spec.matte_border <= 0:
    return subject
  w, h = subject.size
  framed = Image.new(
    "RGBA",
    (w + spec.matte_border * 2, h + spec.matte_border * 2),
    spec.matte_color,
  )
  framed.alpha_composite(subject, dest=(spec.matte_border, spec.matte_border))
  return framed


def maybe_crop_art(subject: Image.Image, spec: CompositeSpec) -> Image.Image:
  left, top, right, bottom = spec.art_crop_inset
  if left <= 0 and top <= 0 and right <= 0 and bottom <= 0:
    return subject
  crop_left = max(0, left)
  crop_top = max(0, top)
  crop_right = max(crop_left + 1, subject.width - max(0, right))
  crop_bottom = max(crop_top + 1, subject.height - max(0, bottom))
  return subject.crop((crop_left, crop_top, crop_right, crop_bottom))


def render(spec: CompositeSpec) -> None:
  stage = make_stage(spec.texture_path, spec.tint_rgba)
  art = maybe_crop_art(Image.open(PUBLIC / spec.art_path).convert("RGBA"), spec)

  target_edge = int(min(SIZE) * spec.art_scale)
  scale = target_edge / max(art.size)
  resized = art.resize(
    (max(1, int(art.width * scale)), max(1, int(art.height * scale))),
    resample=Image.Resampling.LANCZOS,
  )
  subject = maybe_wrap_matte(resized, spec)

  origin = (
    (SIZE[0] - subject.width) // 2 + spec.art_offset[0],
    (SIZE[1] - subject.height) // 2 + spec.art_offset[1],
  )

  add_shadow(stage, subject, origin, spec)
  stage.alpha_composite(subject, dest=origin)

  output_path = OUTPUT_DIR / spec.output_name
  stage.convert("RGB").save(output_path, format="WEBP", quality=92, method=6)
  print(f"wrote {output_path.relative_to(ROOT)}")


def main() -> None:
  OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

  specs = [
    CompositeSpec(
      output_name="gallery-framed-classic.webp",
      texture_path="textures/beige-wall-soft.webp",
      art_path="printproof/framed-latest.png",
      art_scale=0.76,
      art_offset=(0, -10),
      tint_rgba=(232, 214, 183, 62),
    ),
    CompositeSpec(
      output_name="gallery-framed-heart.webp",
      texture_path="textures/plaster-wall-neutral.webp",
      art_path="printproof/gallery/wedding-framed-cutout.webp",
      art_scale=0.74,
      tint_rgba=(232, 224, 212, 46),
    ),
    CompositeSpec(
      output_name="gallery-unframed-classic.webp",
      texture_path="textures/beige-wall-soft.webp",
      art_path="printproof/unframed-latest.png",
      art_scale=0.72,
      tint_rgba=(229, 209, 176, 52),
      drop_shadow_alpha=120,
      drop_shadow_blur=16,
      drop_shadow_offset=(0, 16),
    ),
    CompositeSpec(
      output_name="gallery-style-noir.webp",
      texture_path="textures/plaster-wall-neutral.webp",
      art_path="examples/example-birthday-noir-full.webp",
      art_scale=0.63,
      art_crop_inset=(36, 36, 36, 36),
      tint_rgba=(226, 221, 212, 42),
      matte_border=30,
      matte_color=(17, 28, 56, 255),
      drop_shadow_alpha=155,
      drop_shadow_blur=20,
      drop_shadow_offset=(0, 24),
    ),
    CompositeSpec(
      output_name="delivery-framed-heart.webp",
      texture_path="textures/plaster-wall-neutral.webp",
      art_path="printproof/gallery/wedding-framed-cutout.webp",
      art_scale=0.7,
      tint_rgba=(226, 220, 210, 42),
      drop_shadow_alpha=145,
      drop_shadow_blur=18,
      drop_shadow_offset=(0, 18),
    ),
    CompositeSpec(
      output_name="delivery-unframed-classic.webp",
      texture_path="textures/beige-wall-soft.webp",
      art_path="printproof/unframed-latest.png",
      art_scale=0.7,
      tint_rgba=(228, 210, 179, 48),
      drop_shadow_alpha=120,
      drop_shadow_blur=16,
      drop_shadow_offset=(0, 16),
    ),
  ]

  for spec in specs:
    render(spec)


if __name__ == "__main__":
  main()
