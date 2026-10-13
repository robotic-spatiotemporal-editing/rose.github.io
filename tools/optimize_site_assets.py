"""Mechanical asset extraction and image conversion; preserves source PNGs.

Run with the bundled Python/Pillow runtime. Embedded videos and robot meshes
are extracted byte-for-byte. The operation is safe to rerun after extraction.
"""

import base64
import gzip
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / "mam-demo.html"
html = html_path.read_text()
before_html = len(html.encode())
asset_dir = ROOT / "assets" / "interactive"
asset_dir.mkdir(parents=True, exist_ok=True)
media_files = set()


def packed_script(name):
    pattern = r'<script\b[^>]*\bid="' + re.escape(name) + r'"[^>]*>(.*?)</script>'
    match = re.search(pattern, html, re.S)
    if not match:
        raise ValueError(f"Missing embedded data: {name}")
    return match, match.group(1).strip()


def extract_media(value):
    if isinstance(value, dict):
        return {key: extract_media(item) for key, item in value.items()}
    if isinstance(value, list):
        return [extract_media(item) for item in value]
    if not isinstance(value, str) or not value.startswith("data:"):
        return value
    match = re.fullmatch(r"data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)", value)
    if not match:
        return value
    extensions = {"video/mp4": "mp4", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    extension = extensions.get(match.group(1))
    if not extension:
        return value
    binary = base64.b64decode(match.group(2), validate=False)
    name = hashlib.sha256(binary).hexdigest()[:24] + "." + extension
    path = asset_dir / name
    if not path.exists():
        path.write_bytes(binary)
    media_files.add(name)
    return "./assets/interactive/" + name


if 'data-src="./assets/interactive/model-data.bin"' not in html:
    model_match, model_encoded = packed_script("model-data")
    library_match, library_encoded = packed_script("library-data")
    panda_match, panda_encoded = packed_script("panda-data")
    model_binary = base64.b64decode(model_encoded)
    (asset_dir / "model-data.bin").write_bytes(model_binary)
    library = json.loads(gzip.decompress(base64.b64decode(library_encoded)))
    library = extract_media(library)
    library_json = json.dumps(library, separators=(",", ":"), ensure_ascii=False).encode()
    (asset_dir / "library-data.bin").write_bytes(gzip.compress(library_json, mtime=0))
    panda = json.loads(panda_encoded)
    panda_paths = {}
    for name, encoded in panda.items():
        path = asset_dir / ("panda-" + name + ".bin")
        path.write_bytes(base64.b64decode(encoded))
        panda_paths[name] = "./assets/interactive/" + path.name
    replacements = [
        (model_match, '<script id="model-data" type="application/octet-stream" data-src="./assets/interactive/model-data.bin"></script>'),
        (library_match, '<script id="library-data" type="application/octet-stream" data-src="./assets/interactive/library-data.bin"></script>'),
        (panda_match, '<script id="panda-data" type="application/json">' + json.dumps(panda_paths, separators=(",", ":")) + "</script>"),
    ]
    for match, replacement in sorted(replacements, key=lambda entry: entry[0].start(), reverse=True):
        html = html[:match.start()] + replacement + html[match.end():]

    # Executable code becomes separately cached scripts, in its original order.
    filenames = iter(["three.js", "trackball-controls.js", "gltf-loader.js", "pako.js", "replay-smoothing.js", "reference-visuals.js", "map-interface.js", "reference-studio.js"])

    def external_script(match):
        attrs, content = match.group(1), match.group(2)
        if 'type="' in attrs or 'src="' in attrs:
            return match.group(0)
        name = next(filenames)
        target = ROOT / "js" / "mam" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return '<script src="./js/mam/' + name + '"></script>'

    html = re.sub(r"<script([^>]*)>(.*?)</script>", external_script, html, flags=re.S)
    style = re.search(r"<style>(.*?)</style>", html, re.S)
    (ROOT / "css" / "mam-demo-base.css").write_text(style.group(1))
    html = html[:style.start()] + '<link rel="stylesheet" href="./css/mam-demo-base.css">' + html[style.end():]
    html_path.write_text(html)

image_stats = []
for path in sorted((ROOT / "assets" / "images").glob("*.png")):
    destination = path.with_suffix(".webp")
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((2800, 2800), Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=88, method=6)
    image_stats.append((path.name, path.stat().st_size, destination.stat().st_size))

print(f"Demo HTML: {before_html:,} -> {html_path.stat().st_size:,} bytes")
print(f"Extracted media: {len(media_files)} unique files (no re-encoding)")
for name, before, after in image_stats:
    print(f"{name}: {before:,} -> {after:,} bytes")
print("Original PNGs preserved; serve the site with a local HTTP server.")
