"""Image sniffing, validation, and optional GPS metadata removal."""
from io import BytesIO

from PIL import ExifTags, Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def sniff_image_media_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(_PNG_SIGNATURE):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_image(data: bytes) -> str:
    media_type = sniff_image_media_type(data)
    if media_type is None:
        raise ValueError("Unsupported image format")
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
    except (OSError, UnidentifiedImageError) as exc:
        raise ValueError("Image data is invalid") from exc
    return media_type


def strip_gps_exif(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Unsupported image format")
            exif = image.getexif()
            if ExifTags.Base.GPSInfo not in exif:
                return data
            exif.pop(ExifTags.Base.GPSInfo, None)
            output = BytesIO()
            image.save(output, format=image.format, exif=exif.tobytes())
    except (OSError, UnidentifiedImageError) as exc:
        raise ValueError("Image data is invalid") from exc
    return output.getvalue()
