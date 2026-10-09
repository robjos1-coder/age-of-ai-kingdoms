"""Import CC0 Poly Haven scans and pack them for the instanced world renderer.

Run with Python + Pillow. Downloads are build-time only; the game uses local files.
"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import hashlib
import json
import urllib.request
from PIL import Image, ImageChops, ImageEnhance, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "realism"
OUT.mkdir(parents=True, exist_ok=True)
CACHE = ROOT / ".asset-cache"
CACHE.mkdir(exist_ok=True)
HEADER = {"User-Agent": "AgeOfAIKingdoms-AssetImporter/1.0"}

MODEL = [
    "oak_wood_planks", "old_stone_wall", "white_plaster_rough_01", "clay_roof_tiles",
    "roof_slates_02", "reed_roof_04", "bark_brown_02", None,
    "brown_mud_dry", "metal_plate_02", "rough_linen", "fabric_leather_01",
    "poly_wool_herringbone", None, "rock_boulder_dry", "metal_plate",
]
GROUND = ["grass_ground", "brown_mud_dry", "coast_sand_01", "forest_ground_04", "snow_02", "rock_boulder_dry", "leafy_grass", "brown_mud_rocks_01"]
records = {}


def request(url):
    cache = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not cache.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADER), timeout=60) as response:
            data = response.read()
        cache.write_bytes(data)
    return cache.read_bytes()


def scan(asset):
    if asset in records:
        return records[asset]
    files = json.loads(request(f"https://api.polyhaven.com/files/{asset}"))
    result = {}
    urls = {}
    for kind, options in (("color", ["Diffuse", "diffuse", "diff"]), ("normal", ["nor_gl"]), ("arm", ["arm"])):
        channel = next((files[k] for k in options if k in files), None)
        if channel and "1k" in channel:
            fmt = channel["1k"].get("jpg") or channel["1k"].get("png")
            urls[kind] = fmt["url"]
            result[kind] = Image.open(BytesIO(request(fmt["url"]))).convert("RGB")
        elif kind == "arm":
            rough = files["Rough"]["1k"]["jpg"]
            urls[kind] = rough["url"]
            r = Image.open(BytesIO(request(rough["url"]))).convert("L")
            result[kind] = Image.merge("RGB", (Image.new("L", r.size, 255), r, Image.new("L", r.size, 0)))
        else:
            raise ValueError(f"Missing {kind} map for {asset}")
    result["source"] = {"asset": asset, "license": "CC0-1.0", "page": f"https://polyhaven.com/a/{asset}", "files": urls}
    print(f"Imported {asset}", flush=True)
    records[asset] = result
    return result


def procedural(slot, n):
    # Original small-scale organic surfaces; photographic scans cover architecture/terrain.
    import random
    rnd = random.Random(916 + slot)
    color = Image.new("RGB", (n, n), (175, 186, 157) if slot == 7 else (236, 229, 216))
    draw = ImageDraw.Draw(color)
    for _ in range(12000):
        x, y = rnd.randrange(n), rnd.randrange(n)
        v = rnd.randrange(-25, 26)
        rgb = tuple(max(0, min(255, c + v)) for c in ((175, 186, 157) if slot == 7 else (236, 229, 216)))
        draw.ellipse((x, y, x + rnd.randrange(1, 5), y + rnd.randrange(1, 5)), fill=rgb)
    if slot == 7:
        for x in range(0, n, 24):
            draw.line((x, 0, x + 35, n), fill=(153, 168, 139), width=2)
    return {"color": color, "normal": Image.new("RGB", (n, n), (128, 128, 255)), "arm": Image.new("RGB", (n, n), (250, 230, 0))}


def atlas(name, assets, cell, columns):
    n = cell - 16  # Wrap-around gutters prevent seams and mip bleeding between materials.
    canvases = {k: Image.new("RGB", (cell * columns, cell * ((len(assets) + columns - 1) // columns))) for k in ("color", "normal", "arm")}
    sources = []
    for slot, asset in enumerate(assets):
        data = records[asset] if asset else procedural(slot, n)
        if asset:
            sources.append({"slot": slot, **data["source"]})
        for kind, canvas in canvases.items():
            im = data[kind].resize((n, n), Image.Resampling.LANCZOS)
            if kind == "color":
                if name == "model" and slot == 9:
                    im = ImageEnhance.Color(im).enhance(0)
                    im = ImageEnhance.Brightness(im).enhance(1.3)
                if name == "model" and slot in (10, 11, 12):
                    # Clothing and wool retain their authored color and team tint.
                    im = ImageEnhance.Color(im).enhance(0)
                    im = ImageEnhance.Brightness(im).enhance(1.65 if slot != 11 else 2.2)
                if name == "model" and slot == 15:
                    im = Image.new("RGB", (n, n), (205, 162, 65))
            tile = Image.new("RGB", (cell, cell))
            tile.paste(im, (8, 8))
            tile.paste(im.crop((n - 8, 0, n, n)), (0, 8))
            tile.paste(im.crop((0, 0, 8, n)), (n + 8, 8))
            tile.paste(tile.crop((0, n, cell, n + 8)), (0, 0))
            tile.paste(tile.crop((0, 8, cell, 16)), (0, n + 8))
            canvas.paste(tile, ((slot % columns) * cell, (slot // columns) * cell))
    for kind, canvas in canvases.items():
        canvas.save(OUT / f"{name}-{kind}.webp", quality=94 if kind == "normal" else 90, method=6)
    return sources


if __name__ == "__main__":
    assets = sorted(set(x for x in MODEL + GROUND if x))
    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(scan, assets))
    sources = {"model": atlas("model", MODEL, 1024, 4), "ground": atlas("ground", GROUND, 1024, 4)}
    hdri = "kloofendal_48d_partly_cloudy"
    files = json.loads(request(f"https://api.polyhaven.com/files/{hdri}"))
    url = files["hdri"]["1k"]["hdr"]["url"]
    (OUT / "daylight.hdr").write_bytes(request(url))
    sources["environment"] = {"asset": hdri, "license": "CC0-1.0", "page": f"https://polyhaven.com/a/{hdri}", "file": url}
    (OUT / "sources.json").write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
    print("Local realism assets ready.", flush=True)
