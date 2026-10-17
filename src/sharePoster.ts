import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Topology } from 'topojson-specification';

type Point = { lat: number; lon: number; label: string };
type Photo = { url: string; status: 'ready' | 'pending' | 'failed' };
type Stop = { day: number; place: Point; title: string; photos: Photo[] };
export type PosterTrip = {
  travelerName: string;
  destination: Point;
  bookTitle: string | null;
  bookClosing: string | null;
  spots: Stop[];
};

const WIDTH = 1080;
const HEIGHT = 1600;
const INK = '#28473d';
const CORAL = '#dc7154';
const PAPER = '#f8f6ef';

function wrappedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of Array.from(text)) {
    if (ctx.measureText(current + char).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length === maxLines) break;
    } else current += char;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && lines.join('').length < Array.from(text).length) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片无法读取：${url}`));
    image.src = url;
  });
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 16);
  ctx.fill();
}

function wrapLongitude(lon: number, center: number): number {
  return center + ((((lon - center) + 540) % 360) - 180);
}

function drawRouteMap(
  ctx: CanvasRenderingContext2D,
  trip: PosterTrip,
  land: Polygon | MultiPolygon,
  x: number, y: number, width: number, height: number,
) {
  drawCard(ctx, x, y, width, height, '#eaf0e8');
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 16);
  ctx.clip();

  ctx.fillStyle = '#52756a';
  ctx.font = '700 19px sans-serif';
  ctx.fillText('THE ROUTE  /  走过的路', x + 32, y + 43);

  const centerLon = trip.spots[0]?.place.lon ?? trip.destination.lon;
  const points = trip.spots.map(item => ({ x: wrapLongitude(item.place.lon, centerLon), y: item.place.lat }));
  const lons = points.map(item => item.x);
  const lats = points.map(item => item.y);
  const cos = Math.max(0.12, Math.cos((lats.reduce((a, b) => a + b, 0) / Math.max(1, lats.length)) * Math.PI / 180));
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lonSpan = Math.max(0.35 / cos, maxLon - minLon);
  const latSpan = Math.max(0.35, maxLat - minLat);
  const midLon = (minLon + maxLon) / 2;
  const midLat = (minLat + maxLat) / 2;
  const mapX = x + 34, mapY = y + 64, mapW = width - 68, mapH = height - 140;
  const scale = Math.min(mapW / (lonSpan * cos * 1.35), mapH / (latSpan * 1.35));
  const project = (lon: number, lat: number) => ({
    x: mapX + mapW / 2 + (wrapLongitude(lon, centerLon) - midLon) * cos * scale,
    y: mapY + mapH / 2 - (lat - midLat) * scale,
  });
  const viewLon = mapW / (2 * scale * cos) + 0.2;
  const viewLat = mapH / (2 * scale) + 0.2;
  const polygons = land.type === 'Polygon' ? [land.coordinates] : land.coordinates;
  ctx.fillStyle = '#cbd9cf';
  ctx.strokeStyle = '#afc5b7';
  ctx.lineWidth = 1.4;
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer?.length) continue;
    let nearbyCoast = false;
    for (const [lon, lat] of outer) {
      if (Math.abs(wrapLongitude(lon, centerLon) - midLon) <= viewLon && Math.abs(lat - midLat) <= viewLat) {
        nearbyCoast = true;
        break;
      }
    }
    if (!nearbyCoast) continue;
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([lon, lat], index) => {
        const point = project(lon, lat);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
  }
  if (points.length) {
    ctx.beginPath();
    trip.spots.forEach((stop, index) => {
      const point = project(stop.place.lon, stop.place.lat);
      if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = CORAL;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    trip.spots.forEach((stop, index) => {
      const point = project(stop.place.lon, stop.place.lat);
      const endpoint = index === 0 || index === trip.spots.length - 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, endpoint ? 10 : 6, 0, Math.PI * 2);
      ctx.fillStyle = endpoint ? INK : CORAL;
      ctx.fill();
      ctx.strokeStyle = '#f8f6ef';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }
  ctx.restore();

  const first = trip.spots[0]?.place.label || trip.destination.label;
  const last = trip.spots.at(-1)?.place.label || first;
  ctx.fillStyle = INK;
  ctx.font = '600 16px sans-serif';
  ctx.fillText(first.slice(0, 22), x + 32, y + height - 52);
  ctx.fillStyle = CORAL;
  ctx.fillText('↓', x + 32, y + height - 29);
  ctx.fillStyle = INK;
  ctx.fillText(last.slice(0, 22), x + 54, y + height - 27);
}

export async function createSharePoster(trip: PosterTrip): Promise<Blob> {
  const ready = trip.spots.flatMap(stop => stop.photos.filter(photo => photo.status === 'ready').map(photo => ({ stop, photo })));
  if (!ready.length) throw new Error('至少需要一张已生成的旅途照片，才能导出分享图。');
  await document.fonts.ready;
  const hero = ready.at(-1)!;
  const supporting = [ready[0], ready[Math.floor(ready.length / 2)]].filter((item, index, list) =>
    item.photo.url !== hero.photo.url && list.findIndex(other => other.photo.url === item.photo.url) === index);
  const images = await Promise.all([hero, ...supporting].map(item => loadImage(item.photo.url)));
  const [{ default: atlas }, { feature: toFeature }] = await Promise.all([
    import('world-atlas/land-10m.json'), import('topojson-client'),
  ]);
  const landFeatures = toFeature(atlas as unknown as Topology, atlas.objects.land as unknown as Topology['objects'][string]) as FeatureCollection<Polygon | MultiPolygon>;
  const land = landFeatures.features[0]?.geometry;
  if (!land) throw new Error('地图陆地轮廓暂不可用。');

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器暂不支持生成分享图。');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = CORAL;
  ctx.font = '44px serif';
  ctx.fillText('✳', 70, 107);
  ctx.fillStyle = INK;
  ctx.font = '700 36px "Noto Serif SC", serif';
  ctx.fillText('在别处', 117, 105);
  ctx.fillStyle = '#83988c';
  ctx.font = '700 17px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ELSEWHERE  ·  TRAVEL ARCHIVE', 1010, 99);
  ctx.textAlign = 'left';

  ctx.fillStyle = INK;
  ctx.font = '600 58px "Noto Serif SC", serif';
  const title = trip.bookTitle || `在别处 · ${trip.destination.label}`;
  wrappedLines(ctx, title, 930, 2).forEach((line, index) => ctx.fillText(line, 70, 197 + index * 76));
  ctx.fillStyle = '#8b9e91';
  ctx.font = '600 19px sans-serif';
  const days = Math.max(...trip.spots.map(stop => stop.day), 1);
  ctx.fillText(`${trip.travelerName}  ·  ${days} DAYS  ·  ${trip.spots.length} STOPS`, 72, 302);

  drawCoverImage(ctx, images[0], 70, 345, 940, 505, 16);
  ctx.fillStyle = 'rgba(20, 38, 32, .48)';
  ctx.beginPath();
  ctx.roundRect(87, 785, 360, 43, 5);
  ctx.fill();
  ctx.fillStyle = '#fffdf6';
  ctx.font = '600 17px sans-serif';
  ctx.fillText(hero.stop.place.label.slice(0, 26), 105, 813);

  drawRouteMap(ctx, trip, land, 70, 890, 600, 450);
  supporting.forEach((item, index) => {
    const y = 890 + index * 235;
    drawCoverImage(ctx, images[index + 1], 690, y, 320, 215, 14);
  });
  if (supporting.length < 2) {
    const y = supporting.length ? 1125 : 890;
    drawCard(ctx, 690, y, 320, supporting.length ? 215 : 450, '#dfe9df');
    ctx.fillStyle = '#6f8b7c';
    ctx.font = '600 24px "Noto Serif SC", serif';
    ctx.fillText('旅行还会继续，', 718, y + 80);
    ctx.fillText('照片慢慢长出来。', 718, y + 119);
  }

  ctx.fillStyle = '#b8c5b8';
  ctx.fillRect(70, 1390, 940, 1);
  ctx.fillStyle = INK;
  ctx.font = '500 24px "Noto Serif SC", serif';
  const closing = trip.bookClosing || '地图上的每一枚标记，都是另一个我曾经停留的地方。';
  wrappedLines(ctx, closing, 930, 3).forEach((line, index) => ctx.fillText(line, 70, 1440 + index * 40));
  ctx.fillStyle = '#92a598';
  ctx.font = '700 16px sans-serif';
  ctx.fillText('ELSEWHERE  /  在别处', 70, 1560);
  ctx.textAlign = 'right';
  ctx.fillText('MADE FOR THE IMPOSSIBLE EVERYDAY', 1010, 1560);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('分享图编码失败。')), 'image/png');
  });
}
