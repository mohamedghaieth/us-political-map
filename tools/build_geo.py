"""Build simplified TopoJSON map layers from Census shapefiles (needs Node + npx mapshaper).

Outputs (frontend/public/data):
  districts119.topo.json  - layers: districts, states   (119th Congress, current members)
  districts120.topo.json  - layers: districts, states   (120th Congress, 2026 election maps)
"""
import subprocess, zipfile, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
WORK = ROOT / "data" / "work"
OUT = ROOT / "frontend" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)
MS = ["npx", "-y", "mapshaper@0.6.103"]  # pinned


def run(args):
    print(" ".join(map(str, args))[:120], "...")
    subprocess.run(args, check=True, shell=(sys.platform == "win32"))


def unzip(z: Path, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(z) as f:
        f.extractall(dest)


# ---- 119th (Census cartographic boundary, already shoreline-clipped)
d119 = WORK / "cd119"
if not d119.exists():
    unzip(RAW / "tiger119" / "cb_2025_us_cd119_500k.zip", d119)
shp119 = next(d119.glob("*.shp"))
run(MS + [str(shp119), "-filter-fields", "GEOID,STATEFP,CD119FP,NAMELSAD", "-rename-layers", "districts",
          "-simplify", "weighted", "10%", "keep-shapes", "-dissolve", "STATEFP", "+", "name=states",
          "-o", str(OUT / "districts119.topo.json"), "format=topojson", "target=*", "quantization=20000"])

# ---- 120th (TIGER/Line, includes water -> clip to land from the cartographic file)
shps = []
for z in sorted((RAW / "tiger120").glob("*.zip")):
    d = WORK / "cd120" / z.stem
    if not d.exists():
        unzip(z, d)
    shps.append(str(next(d.glob("*.shp"))))
land = WORK / "land.json"
run(MS + [str(shp119), "-dissolve", "-o", str(land), "format=geojson"])
run(MS + ["-i"] + shps + ["combine-files", "-merge-layers", "-rename-layers", "districts",
          "-filter-fields", "GEOID,STATEFP,CD120FP,NAMELSAD",
          "-simplify", "weighted", "4%", "keep-shapes",
          "-clip", str(land), "remove-slivers",
          "-dissolve", "STATEFP", "+", "name=states",
          "-o", str(OUT / "districts120.topo.json"), "format=topojson", "target=*", "quantization=20000"])
for p in OUT.glob("districts*.json"):
    print(p.name, p.stat().st_size // 1024, "KB")
