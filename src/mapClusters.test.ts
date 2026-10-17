import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterStops } from './mapClusters.js';

test('all visits at the same coordinate remain in the cluster', () => {
  const clusters = clusterStops([{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }]);
  assert.deepEqual(clusters, [{ x: 1, y: 2, indices: [0, 1, 2] }]);
});
test('zooming apart splits nearby visits without losing any', () => {
  const close = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 160, y: 0 }];
  assert.deepEqual(clusterStops(close).map(g => g.indices), [[0, 1], [2]]);
  assert.deepEqual(clusterStops(close.map(p => ({ x: p.x * 4, y: p.y }))).map(g => g.indices), [[0], [1], [2]]);
});
test('panning preserves membership and all visible marker centers are separated', () => {
  const points = [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 80, y: 4 }, { x: 100, y: 4 }];
  const clusters = clusterStops(points);
  assert.deepEqual(clusterStops(points.map(p => ({ x: p.x + 800, y: p.y - 200 }))).map(g => g.indices), clusters.map(g => g.indices));
  assert.deepEqual(clusters.flatMap(g => g.indices).sort((a,b) => a-b), [0, 1, 2, 3]);
  for (let i=0;i<clusters.length;i++) for(let j=i+1;j<clusters.length;j++) assert.ok(Math.hypot(clusters[i].x-clusters[j].x,clusters[i].y-clusters[j].y)>=48);
});
