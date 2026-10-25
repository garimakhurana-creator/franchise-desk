"""Bake the India diorama assets once: heightmap, satellite texture and India mask.

Sources (credited in the app): elevation from AWS Terrain Tiles (Mapzen, open data);
imagery from Sentinel-2 cloudless by EOX (CC BY-NC-SA 4.0, Copernicus Sentinel data 2020);
India outline from public/geo/india.json (Natural Earth, public domain).
All three images share one Web Mercator pixel grid described in meta.json.
Usage: python -I scripts/bake_diorama.py            (all India, writes public/diorama/)
       python -I scripts/bake_diorama.py region     (close-up slab of the territory region, public/diorama/region/)
"""
import io, json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REGION = len(sys.argv) > 1 and sys.argv[1] == "region"
OUT = ROOT / "public" / "diorama" / ("region" if REGION else "")
# the region covers Karnataka with a margin: every expansion city and territory sits inside it
Z = 9 if REGION else 6
BBOX = (72.6, 11.2, 79.6, 16.8) if REGION else (67.5, 5.5, 98.5, 37.6)  # lon min, lat min, lon max, lat max
HW, TW = (720, 3072) if REGION else (640, 2048)
UA = {"User-Agent": "franchise-desk-diorama-bake/1.0 (one-off)"}

def merc(lon, lat, z=Z):
    n = 2 ** z * 256
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y

def fetch(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception:
            time.sleep(1 + i)
    return None

def stitch(url_for):
    x0, y0 = merc(BBOX[0], BBOX[3])
    x1, y1 = merc(BBOX[2], BBOX[1])
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    jobs = [(tx, ty) for tx in range(tx0, tx1 + 1) for ty in range(ty0, ty1 + 1)]
    with ThreadPoolExecutor(8) as ex:
        for (tx, ty), img in zip(jobs, ex.map(lambda t: fetch(url_for(*t)), jobs)):
            if img is None:
                print("missing tile", tx, ty, file=sys.stderr)
                continue
            canvas.paste(img.resize((256, 256)), ((tx - tx0) * 256, (ty - ty0) * 256))
    crop = (int(x0 - tx0 * 256), int(y0 - ty0 * 256), int(x1 - tx0 * 256), int(y1 - ty0 * 256))
    return canvas.crop(crop), (x0, y0, x1, y1)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("elevation…")
    dem, px = stitch(lambda x, y: f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png")
    print("imagery…")
    sat, _ = stitch(lambda x, y: f"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{Z}/{y}/{x}.jpg")
    w, h = dem.size
    # keep the heightmap as terrarium RGB (decoded in the browser), downsized for the mesh
    hw = HW
    hh = round(h * hw / w)
    dem.resize((hw, hh), Image.BILINEAR).save(OUT / "height.png", optimize=True)
    tw = TW
    th = round(h * tw / w)
    sat.resize((tw, th), Image.LANCZOS).save(OUT / "sat.jpg", quality=86, optimize=True)
    # India mask on the heightmap grid
    india = json.loads((ROOT / "public" / "geo" / "india.json").read_text(encoding="utf8"))
    feat = next(f for f in india["features"] if f["properties"].get("kind") == "india")
    polys = feat["geometry"]["coordinates"] if feat["geometry"]["type"] == "MultiPolygon" else [feat["geometry"]["coordinates"]]
    scale = hw / (px[2] - px[0])
    mask = Image.new("L", (hw, hh), 255 if REGION else 0)
    d = ImageDraw.Draw(mask)
    for poly in ([] if REGION else polys):  # the region is a full rectangular slab
        ring = [((merc(lon, lat)[0] - px[0]) * scale, (merc(lon, lat)[1] - px[1]) * scale) for lon, lat in poly[0]]
        if len(ring) > 2:
            d.polygon(ring, fill=255)
        for hole in poly[1:]:
            d.polygon([((merc(lon, lat)[0] - px[0]) * scale, (merc(lon, lat)[1] - px[1]) * scale) for lon, lat in hole], fill=0)
    mask.save(OUT / "mask.png", optimize=True)
    meta = {
        "zoom": Z,
        "bbox": BBOX,
        "mercPx": px,
        "height": {"w": hw, "h": hh, "encoding": "terrarium"},
        "texture": {"w": tw, "h": th},
        "sources": "Elevation: AWS Terrain Tiles (Mapzen). Imagery: Sentinel-2 cloudless by EOX (CC BY-NC-SA 4.0, contains modified Copernicus Sentinel data 2020). Outline: Natural Earth.",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))
    for f in OUT.iterdir():
        print(f.name, f.stat().st_size // 1024, "KB")

if __name__ == "__main__":
    main()
