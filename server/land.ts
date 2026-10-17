import landAtlas from 'world-atlas/land-10m.json' with { type: 'json' };
import { feature } from 'topojson-client';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { Point } from './store.js';

const landFeatures = feature(
  landAtlas as unknown as Topology,
  landAtlas.objects.land as unknown as Topology['objects'][string],
) as FeatureCollection<Polygon | MultiPolygon>;
const land = landFeatures.features[0]?.geometry;
if (!land) throw new Error('陆地边界数据不可用');

/** Natural Earth 1:10m land mask. Tiny islets absent from this map are treated as sea. */
export function isLand(lat: number, lon: number): boolean {
  // The source includes an artificial 0,0 island; that coordinate is open ocean.
  if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return false;
  return booleanPointInPolygon([lon, lat], land);
}

/** Samples the sphere uniformly, rejects water, and keeps the exact chosen land coordinate. */
export function randomLandPoint(random = Math.random): Point {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const lat = Math.asin(random() * 2 - 1) * 180 / Math.PI;
    const lon = random() * 360 - 180;
    if (isLand(lat, lon)) return { lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
  }
  throw new Error('连续随机落点均不在陆地，请重试');
}
