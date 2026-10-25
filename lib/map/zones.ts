// Territory zones for the 3D maps: Karnataka split by nearest territory, so each territory reads as an area
// with a border. The file defines territories by pin codes, not boundaries, so these zones are an approximation
// (every place is given to its closest territory centre) and the map key says so.
import { Delaunay } from "d3-delaunay";
import type { MapPoint } from "./terrain";

let karnataka: GeoJSON.Feature | null = null;

/** The Karnataka outline from the bundled India file (loaded once). */
export async function loadKarnataka(): Promise<GeoJSON.Feature | null> {
  if (karnataka) return karnataka;
  try {
    const india = await fetch("/geo/india.json").then((r) => r.json());
    karnataka = india.features.find((f: GeoJSON.Feature) => f.properties?.kind === "karnataka") ?? null;
  } catch {
    karnataka = null;
  }
  return karnataka;
}

export function territoryZones(points: MapPoint[], outline: GeoJSON.Feature | null): GeoJSON.FeatureCollection {
  const centres = points.filter((p) => !p.muted && !p.passive);
  const features: GeoJSON.Feature[] = [];
  if (outline) features.push({ ...outline, properties: { kind: "zone-clip" } });
  if (centres.length >= 2) {
    const pts = centres.map((p) => p.lngLat);
    const vor = Delaunay.from(pts).voronoi([73.5, 11.0, 79.0, 18.8]);
    centres.forEach((p, i) => {
      const cell = vor.cellPolygon(i);
      if (cell) features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [cell as GeoJSON.Position[]] }, properties: { kind: "zone", key: p.key } });
    });
  }
  return { type: "FeatureCollection", features };
}
