"""One-off build of lib/engine/pin-centroids.json via OpenStreetMap Nominatim.

Politely rate-limited (1.1 s between requests), cached on disk, run once at build time.
No runtime geocoding. Input: GeoNames IN.txt (CC BY 4.0) for the list of pins and
post-office names in the allowed prefixes. Results are validated to lie within 45 km of
the city's reference point; anything else is dropped and the app falls back to a
flagged city-level point.
Usage: python -I scripts/build_centroids.py <IN.txt> <cache.json> <out.json>
"""
import os, sys, csv, json, time, math, urllib.request, urllib.parse, collections

src, cache_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
CITY = {  # reference points (city centres) for validation and fallback
    "560": ("Bengaluru", 12.9716, 77.5946), "570": ("Mysuru", 12.2958, 76.6394),
    "575": ("Mangaluru", 12.9141, 74.8560), "580": ("Hubballi-Dharwad", 15.3647, 75.1240),
    "590": ("Belagavi", 15.8497, 74.4977), "572": ("Tumakuru", 13.3392, 77.1140),
    "577": ("Davanagere", 14.4644, 75.9218),
}
UA = "franchise-desk-hackathon/1.0 (one-off pin centroid build; contact: " + os.environ.get("NOMINATIM_CONTACT", "set NOMINATIM_CONTACT") + ")"

def km(a, b, c, d):
    r = 6371; p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(h))

try: cache = json.load(open(cache_path))
except Exception: cache = {}

names = collections.defaultdict(list)
with open(src, encoding="utf8") as f:
    for row in csv.reader(f, delimiter="\t"):
        pin = row[1].strip()
        if len(pin) == 6 and pin[:3] in CITY: names[pin].append(row[2])

def get(params):
    key = urllib.parse.urlencode(sorted(params.items()))
    if key in cache: return cache[key]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({**params, "format": "json", "limit": 1, "countrycodes": "in"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: res = json.load(r)
    except Exception as e:
        res = None
    time.sleep(1.1)
    if res is not None:
        cache[key] = res
        json.dump(cache, open(cache_path, "w"))
    return res or []

pins = {}
for i, pin in enumerate(sorted(names)):
    city, clat, clon = CITY[pin[:3]]
    hit = None
    for params in ({"postalcode": pin}, {"q": f"{names[pin][0]}, {city}, Karnataka"}):
        res = get(params)
        if res:
            lat, lon = float(res[0]["lat"]), float(res[0]["lon"])
            if km(lat, lon, clat, clon) <= 45:
                hit = [round(lat, 5), round(lon, 5), "postalcode" if "postalcode" in params else "place"]
                break
    if hit: pins[pin] = hit
    if i % 25 == 0: print(i, pin, hit, flush=True)

json.dump({
    "source": "OpenStreetMap Nominatim (ODbL), queried once at build time; pin list and post-office names from GeoNames (CC BY 4.0). Approximate pin centroids, not catchment boundaries.",
    "generated": time.strftime("%Y-%m-%d"),
    "cities": {k: {"city": v[0], "lat": v[1], "lon": v[2]} for k, v in CITY.items()},
    "pins": pins,
}, open(out, "w"), separators=(",", ":"))
print("done", len(pins), "of", len(names))
