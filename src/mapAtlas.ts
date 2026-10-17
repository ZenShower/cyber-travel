import type { Map as AtlasMap } from 'maplibre-gl';

function stamp(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  return ctx.getImageData(0, 0, size, size);
}

// Printed marks follow the actual water/forest/peak features in the vector tiles.
export function installAtlasDetails(map: AtlasMap) {
  map.addImage('atlas-waves', stamp(192, ctx => {
    ctx.strokeStyle = '#e8fcf5'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (const [x, y] of [[24, 30], [120, 112], [60, 162]]) {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.bezierCurveTo(x + 5, y - 3, x + 8, y + 3, x + 13, y);
      ctx.bezierCurveTo(x + 18, y - 3, x + 21, y + 3, x + 26, y); ctx.stroke();
      ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + 21, y + 5); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }));
  map.addImage('atlas-trees', stamp(96, ctx => {
    for (const [x, y] of [[20, 20], [68, 64]]) {
      ctx.fillStyle = '#477650'; ctx.globalAlpha = .32;
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x - 5, y + 3); ctx.lineTo(x + 5, y + 3); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - .6, y + 3, 1.2, 3);
    }
  }));
  map.addImage('atlas-peak', stamp(48, ctx => {
    ctx.lineJoin = 'round'; ctx.lineWidth = 2;
    ctx.fillStyle = '#b6a07d'; ctx.strokeStyle = '#8c7759';
    ctx.beginPath(); ctx.moveTo(5, 38); ctx.lineTo(24, 9); ctx.lineTo(43, 38); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3d7'; ctx.beginPath(); ctx.moveTo(24, 9); ctx.lineTo(15, 23); ctx.lineTo(23, 20); ctx.lineTo(29, 25); ctx.lineTo(33, 23); ctx.closePath(); ctx.fill();
  }), { pixelRatio: 2 });
  const firstLabel = map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id;
  map.addLayer({ id: 'atlas-sea-print', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
    filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-pattern': 'atlas-waves', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, .6, 10, .45, 14, .16] } }, 'atlas-shoreline');
  map.addLayer({ id: 'atlas-forest-print', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', minzoom: 7,
    filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-pattern': 'atlas-trees', 'fill-opacity': .6 } }, firstLabel);
  map.addLayer({ id: 'atlas-mountain-marks', type: 'symbol', source: 'openmaptiles', 'source-layer': 'mountain_peak', minzoom: 7,
    layout: { 'icon-image': 'atlas-peak', 'icon-size': ['interpolate', ['linear'], ['zoom'], 7, .75, 12, 1.1],
      'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': 10,
      'text-anchor': 'top', 'text-offset': [0, 1.3], 'icon-padding': 14 },
    paint: { 'text-color': '#8a7459', 'text-halo-color': '#fff5de', 'text-halo-width': 1.5 } }, firstLabel);
}
