from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "journal-assets"


def _trim_alpha(image: Image.Image, padding: int = 14) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if not box:
        return image
    left = max(0, box[0] - padding)
    top = max(0, box[1] - padding)
    right = min(image.width, box[2] + padding)
    bottom = min(image.height, box[3] + padding)
    return image.crop((left, top, right, bottom))


def _paper_cutout(
    source: str,
    output: str,
    crop: tuple[int, int, int, int],
    *,
    saturation: float = 0.42,
    contrast: float = 0.96,
    opacity: float = 0.92,
) -> None:
    image = Image.open(ASSETS / source).convert("RGB").crop(crop)
    image = ImageEnhance.Color(image).enhance(saturation)
    image = ImageEnhance.Contrast(image).enhance(contrast)

    pixels = image.load()
    alpha = Image.new("L", image.size)
    alpha_pixels = alpha.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue = pixels[x, y]
            distance = max(255 - red, 255 - green, 255 - blue)
            value = int(max(0, min(255, (distance - 4) * 2.35)) * opacity)
            alpha_pixels[x, y] = value

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    result = image.convert("RGBA")
    result.putalpha(alpha)
    _trim_alpha(result).save(ASSETS / output, optimize=True)


def _real_torn_mask(
    output: str,
    *,
    size: tuple[int, int],
    segment: tuple[float, float],
    flip: bool = False,
) -> None:
    source = Image.open(ASSETS / "cc0-torn-paper-sheet.png").convert("RGBA")
    alpha = source.getchannel("A")
    box = alpha.getbbox()
    if not box:
        raise RuntimeError("The CC0 torn-paper source has no alpha contour.")
    alpha = alpha.crop(box)
    start = round(alpha.height * segment[0])
    end = round(alpha.height * segment[1])
    alpha = alpha.crop((0, start, alpha.width, end))
    if flip:
        alpha = ImageOps.flip(alpha)

    width, height = size
    edge_height = max(54, round(height * 0.13))
    edge = alpha.rotate(90, expand=True, resample=Image.Resampling.BICUBIC)
    edge = edge.resize((width, edge_height), Image.Resampling.LANCZOS)

    mask = Image.new("L", size, 0)
    mask.paste(255, (0, 0, width, height - edge_height // 2))
    mask.paste(edge, (0, height - edge_height), edge)
    paper = Image.new("RGBA", size, (255, 255, 255, 255))
    paper.putalpha(mask)
    paper.save(ASSETS / output, optimize=True)


def _split_letter_atlas() -> None:
    source = Image.open(ASSETS / "burnt-letter-atlas.png").convert("RGBA")
    pieces = (
        ("burnt-letter-diagonal.png", (0, 0, source.width, 610), 760),
        ("burnt-letter-botanical.png", (60, 570, 900, 1160), 690),
        ("burnt-letter-folded.png", (70, 1140, 980, source.height), 760),
    )
    for output, crop, max_width in pieces:
        piece = _trim_alpha(source.crop(crop), padding=8)
        if piece.width > max_width:
            height = round(piece.height * max_width / piece.width)
            piece = piece.resize((max_width, height), Image.Resampling.LANCZOS)
        piece.save(ASSETS / output, optimize=True)


def main() -> None:
    # Source screenshot contains four separate specimens on a white field.
    _paper_cutout(
        "user-moth-botanicals.png",
        "botanical-moth-cutout.png",
        (0, 520, 665, 925),
        saturation=0.12,
        opacity=0.78,
    )
    _paper_cutout(
        "user-moth-botanicals.png",
        "botanical-rosemary-cutout.png",
        (680, 500, 1170, 1260),
        saturation=0.30,
        opacity=0.74,
    )
    _paper_cutout(
        "user-moth-botanicals.png",
        "botanical-leaf-cutout.png",
        (0, 900, 515, 2100),
        saturation=0.34,
        opacity=0.74,
    )
    _paper_cutout(
        "user-moth-botanicals.png",
        "botanical-rose-cutout.png",
        (470, 1060, 855, 2070),
        saturation=0.28,
        opacity=0.76,
    )
    # Three masks use different sections of a photographed CC0 torn contour.
    _real_torn_mask(
        "torn-mask-note-a.png",
        size=(1200, 720),
        segment=(0.02, 0.48),
    )
    _real_torn_mask(
        "torn-mask-note-b.png",
        size=(1200, 720),
        segment=(0.31, 0.81),
        flip=True,
    )
    _real_torn_mask(
        "torn-mask-fragment.png",
        size=(1200, 520),
        segment=(0.58, 0.98),
    )
    _split_letter_atlas()


if __name__ == "__main__":
    main()
