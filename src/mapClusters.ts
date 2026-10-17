export type ScreenPoint = { x: number; y: number };
export type StopCluster = ScreenPoint & { indices: number[] };

// Group by screen distance, so coincident visits remain reachable at every zoom.
export function clusterStops(points: ScreenPoint[], radius = 48): StopCluster[] {
  const parents = points.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < radius) parents[find(j)] = find(i);
    }
  }
  const groups = new Map<number, number[]>();
  points.forEach((_, index) => {
    const key = find(index);
    const group = groups.get(key) || [];
    group.push(index); groups.set(key, group);
  });
  const clusters = [...groups.values()].map(indices => ({ indices,
    x: indices.reduce((sum, i) => sum + points[i].x, 0) / indices.length,
    y: indices.reduce((sum, i) => sum + points[i].y, 0) / indices.length,
  }));
  // A long chain can have its centroid close to another cluster. Merge those too.
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length && !merged; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i], b = clusters[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= radius) continue;
        const count = a.indices.length + b.indices.length;
        a.x = (a.x * a.indices.length + b.x * b.indices.length) / count;
        a.y = (a.y * a.indices.length + b.y * b.indices.length) / count;
        a.indices.push(...b.indices); a.indices.sort((x, y) => x - y);
        clusters.splice(j, 1); merged = true; break;
      }
    }
  }
  return clusters.sort((a, b) => a.indices[0] - b.indices[0]);
}
