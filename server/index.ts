import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import cities from 'all-the-cities';
import { randomLandPoint } from './land.js';
import { advanceJourney, closeBook, generateSpotPhoto, planJourney } from './agent.js';
import { getTrip, listTrips, saveTrip, type Point, type Trip } from './store.js';
import { TripEngine } from './engine.js';
import { ActivityRegistry } from './activity.js';
import type { ActivityTask } from '../src/activityTypes.js';
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { validReferenceImage } from './imageValidation.js';
import { codexStatus } from './codexRuntime.js';

const app = express();
// This application controls a local agent. Reject cross-site writes and DNS
// rebinding hosts while still allowing local CLI clients with no Origin header.
app.use((req, res, next) => {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: '仅允许本机访问' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (origin.protocol !== 'http:' || origin.host !== req.headers.host) return res.status(403).json({ error: '请从本机应用页面操作' });
    } catch { return res.status(403).json({ error: '无效请求来源' }); }
  }
  next();
});
let runtimeCache: { time: number; value: ReturnType<typeof codexStatus> } | null = null;
function runtimeStatus() {
  if (!runtimeCache || Date.now() - runtimeCache.time > 30_000) runtimeCache = { time: Date.now(), value: codexStatus() };
  return runtimeCache.value;
}
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '0.2.0' }));
app.get('/api/runtime', (_req, res) => res.json(runtimeStatus()));
const root = process.cwd();
const publicDir = path.join(root, 'public');
await mkdir(publicDir, { recursive: true });
app.use(express.json({ limit: '1mb' }));
app.use('/media', express.static(path.join(publicDir, 'media')));
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 48, fileSize: 12 * 1024 * 1024 }, fileFilter(_req, file, callback) { if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) callback(null, true); else callback(new Error('仅支持 JPG、PNG 或 WEBP 照片')); } });
const pointSchema = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180), label: z.string().min(1).max(150) });
const createSchema = z.object({ travelerName: z.string().trim().min(1).max(32), destination: pointSchema, pace: z.enum(['realtime', 'event']).default('realtime'), companions: z.array(z.object({ name: z.string().trim().min(1).max(32) })).default([]) });
const events = new Set<express.Response>();

function broadcast() {
  for (const res of events) res.write(`data: ${Date.now()}\n\n`);
}
function update(trip: Trip) {
  saveTrip(trip); broadcast();
  for (const res of activityListeners.get(trip.id) || []) res.write('event: trip\ndata: updated\n\n');
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
const activityListeners = new Map<string, Set<express.Response>>();
const activityFile = path.join(root, 'data', 'activity.json');
mkdirSync(path.dirname(activityFile), { recursive: true });
const savedActivity = await readFile(activityFile, 'utf8').then(text => JSON.parse(text) as ActivityTask[]).catch(() => []);
function persistActivity() {
  writeFileSync(`${activityFile}.tmp`, JSON.stringify(activity.all()));
  renameSync(`${activityFile}.tmp`, activityFile);
}
const activity = new ActivityRegistry(tripId => {
  try { persistActivity(); } catch (error) { console.error('执行实况保存失败：', error); }
  const data = JSON.stringify(activity.snapshot(tripId));
  for (const res of activityListeners.get(tripId) || []) res.write(`event: activity\ndata: ${data}\n\n`);
}, savedActivity);
persistActivity();
const engine = new TripEngine({ read: getTrip, write: update, activity, plan: planJourney,
  advance: (trip, report) => advanceJourney(trip, { report }), photo: generateSpotPhoto, book: closeBook });

app.get('/api/trips/:id/activity', (req, res) => {
  const id = req.params.id;
  if (!getTrip(id)) return res.status(404).json({ error: '旅程不存在' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write(`event: activity\ndata: ${JSON.stringify(activity.snapshot(id))}\n\n`);
  res.write('event: trip\ndata: updated\n\n');
  const listeners = activityListeners.get(id) || new Set<express.Response>();
  activityListeners.set(id, listeners); listeners.add(res);
  const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat); listeners.delete(res);
    if (!listeners.size) activityListeners.delete(id);
  });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: ready\n\n');
  events.add(res);
  req.on('close', () => events.delete(res));
});
app.get('/api/trips', (_req, res) => res.json(listTrips().map(({ id, travelerName, destination, createdAt, status, currentDay }) => ({ id, travelerName, destination, createdAt, status, currentDay }))));
app.get('/api/trips/:id', (req, res) => { const trip = getTrip(req.params.id); if (!trip) return res.status(404).json({ error: '旅程不存在' }); res.json(trip); });
app.post('/api/trips', upload.fields([{ name: 'photos', maxCount: 8 }, { name: 'companionPhotos', maxCount: 40 }]), async (req, res) => {
  let parsed;
  try { parsed = createSchema.parse({ travelerName: req.body.travelerName, destination: JSON.parse(req.body.destination), pace: req.body.pace, companions: JSON.parse(req.body.companions || '[]') }); }
  catch { return res.status(400).json({ error: '请填写旅行者名称并选择地图上的目的地' }); }
  const uploads = (req.files || {}) as Record<string, Express.Multer.File[]>;
  const files = uploads.photos || [];
  const companionFiles = uploads.companionPhotos || [];
  if (files.length < 2) return res.status(400).json({ error: '请至少上传两张可辨识自己的照片' });
  if (parsed.companions.length !== companionFiles.length) return res.status(400).json({ error: '每位出发前的旅伴需要一张外貌参考照片' });
  if ([...files, ...companionFiles].some(file => !validReferenceImage(file.mimetype, file.buffer))) return res.status(400).json({ error: '有照片内容与文件格式不符，请重新选择' });
  const runtime = runtimeStatus();
  if (!runtime.available || !runtime.loggedIn) return res.status(503).json({ error: runtime.message });
  const id = randomUUID();
  const folder = path.join(publicDir, 'media', id);
  await mkdir(folder, { recursive: true });
  const avatarUrls: string[] = [];
  for (const [index, file] of files.entries()) {
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const name = `reference-${index + 1}.${ext}`;
    await import('node:fs/promises').then(fs => fs.writeFile(path.join(folder, name), file.buffer));
    avatarUrls.push(`/media/${id}/${name}`);
  }
  const now = new Date().toISOString();
  const companions = [] as NonNullable<Trip['companions']>;
  for (const [index, file] of companionFiles.entries()) {
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const name = `companion-${index + 1}.${ext}`;
    await writeFile(path.join(folder, name), file.buffer);
    companions.push({ id: randomUUID(), name: parsed.companions[index].name, source: 'uploaded', referenceUrls: [`/media/${id}/${name}`], appearance: null, travelingTogether: true, relationship: '出发前认识的同行者，关系留待旅途中自然变化', whereabouts: '一起出发', firstDay: 1, lastDay: 1, history: [] });
  }
  const trip: Trip = { id, pace: parsed.pace, createdAt: now, startedAt: null, endedAt: null, status: 'planning', statusNote: null, travelerName: parsed.travelerName, avatarUrls, companions, destination: parsed.destination, currentDay: 1, nextTickAt: now, planRevision: 1, plan: [], spots: [], consequenceThreads: [], bookTitle: null, bookClosing: null };
  update(trip);
  res.status(201).json(trip);
  void engine.initialize(id);
});
app.post('/api/trips/:id/retry', (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  if (trip.status === 'ended') return res.status(400).json({ error: '旅程已结束' });
  if (trip.status === 'planning') void engine.initialize(trip.id);
  else {
    if (trip.status === 'paused') return res.status(400).json({ error: '请先继续旅行，再重试这一段' });
    trip.statusNote = null;
    trip.nextTickAt = new Date().toISOString(); update(trip); void engine.advance(trip.id);
  }
  res.json({ ok: true });
});
app.post('/api/trips/:id/photos/retry', (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  const count = engine.retryPhotos(trip.id);
  res.json({ ok: true, count });
});
app.post('/api/trips/:id/book/retry', (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  if (trip.status !== 'ended') return res.status(400).json({ error: '结束旅行后才能整理相册' });
  void engine.finishBook(trip.id);
  res.json({ ok: true });
});
app.post('/api/trips/:id/end', (req, res) => {
  const trip = engine.end(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  res.json(trip);
});
app.post('/api/trips/:id/pause', (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  if (trip.status !== 'active' && trip.status !== 'paused') return res.status(400).json({ error: '当前旅程不能暂停' });
  trip.status = 'paused'; update(trip); res.json(trip);
});
app.post('/api/trips/:id/resume', (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  if (trip.status !== 'paused') return res.status(400).json({ error: '当前旅程不能继续' });
  trip.status = 'active'; trip.nextTickAt = new Date().toISOString();
  update(trip); res.json(trip);
  if (!trip.statusNote) void engine.advance(trip.id);
});
app.post('/api/trips/:id/share-poster', express.raw({ type: 'image/png', limit: '20mb' }), async (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  if (trip.status !== 'ended') return res.status(400).json({ error: '请先结束旅行，再装订分享图' });
  const image = req.body;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(image) || image.length < 33 || !image.subarray(0, 8).equals(signature) || image.readUInt32BE(16) !== 1080 || image.readUInt32BE(20) !== 1600) {
    return res.status(400).json({ error: '分享图必须是 1080 × 1600 的 PNG 图片' });
  }
  const folder = path.join(publicDir, 'media', trip.id);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'share-poster.png'), image);
  trip.sharePosterUrl = `/media/${trip.id}/share-poster.png`;
  update(trip);
  res.json({ url: trip.sharePosterUrl, downloadUrl: `/api/trips/${trip.id}/share-poster/download` });
});
app.get('/api/trips/:id/share-poster/download', async (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip?.sharePosterUrl) return res.status(404).json({ error: '分享图尚未生成' });
  const file = path.join(publicDir, trip.sharePosterUrl.replace(/^\//, ''));
  const data = await readFile(file).catch(() => null);
  if (!data) return res.status(404).json({ error: '分享图文件不存在' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="elsewhere-${trip.id.slice(0, 8)}-share.png"`);
  res.send(data);
});
app.get('/api/trips/:id/export', async (req, res) => {
  const trip = getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: '旅程不存在' });
  const zip = new JSZip();
  const manifest = { title: trip.bookTitle || `在别处 · ${trip.destination.label}`, traveler: trip.travelerName, companions: trip.companions || [], experimentNote: trip.experimentNote || null, createdAt: trip.createdAt, endedAt: trip.endedAt, plan: trip.plan, route: trip.spots.map(({ day, place, title, diary, event, consequence, activity, transport, movement, stay, people, companionChanges, sourceUrl, branchReason, branchSourceThreadId, continuityUpdates, photoDirections, photoShots }) => ({ day, place, title, diary, event, consequence, activity, transport, movement: movement || null, stay, people, companionChanges: companionChanges || [], sourceUrl, branchReason, branchSourceThreadId: branchSourceThreadId || null, continuityUpdates: continuityUpdates || [], photoDirections: photoDirections || null, photoShots: photoShots || null })), consequenceThreads: trip.consequenceThreads || [] };
  zip.file('旅行记录.json', JSON.stringify(manifest, null, 2));
  for (const [index, spot] of trip.spots.entries()) for (const [photoIndex, photo] of spot.photos.filter(p => p.status === 'ready').entries()) {
    const file = path.join(publicDir, photo.url.replace(/^\//, ''));
    const data = await readFile(file).catch(() => null);
    if (data) zip.file(`照片/${String(index + 1).padStart(2, '0')}-${String(photoIndex + 1).padStart(2, '0')}-${photo.kind}${path.extname(file)}`, data);
  }
  if (trip.sharePosterUrl) {
    const data = await readFile(path.join(publicDir, trip.sharePosterUrl.replace(/^\//, ''))).catch(() => null);
    if (data) zip.file('分享图.png', data);
  }
  const output = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="elsewhere-${trip.id.slice(0, 8)}.zip"`);
  res.send(output);
});

const aliases: Array<{ words: string[]; name: string; country: string }> = [
  { words: ['巴厘岛', 'bali'], name: 'Denpasar', country: 'ID' },
  { words: ['布罗莫', 'bromo'], name: 'Probolinggo', country: 'ID' },
  { words: ['法罗群岛', 'faroe'], name: 'Tórshavn', country: 'FO' },
  { words: ['冰岛', 'iceland'], name: 'Reykjavík', country: 'IS' },
  { words: ['乞力马扎罗', 'kilimanjaro'], name: 'Moshi', country: 'TZ' },
  { words: ['特罗姆瑟', '特罗姆', 'tromso'], name: 'Tromsø', country: 'NO' },
  { words: ['东京'], name: 'Tokyo', country: 'JP' },
  { words: ['内罗毕', '肯尼亚'], name: 'Nairobi', country: 'KE' },
  { words: ['北京'], name: 'Beijing', country: 'CN' },
  { words: ['上海'], name: 'Shanghai', country: 'CN' },
];
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const namedCities = cities.filter(city => city.population >= 1000);
function cityPoint(city: typeof cities[number]): Point { return { lon: city.loc.coordinates[0], lat: city.loc.coordinates[1], label: `${city.name} · ${city.country}` }; }
function nearestCity(lat: number, lon: number) {
  let winner = namedCities[0]; let distance = Infinity;
  for (const city of namedCities) {
    const [cityLon, cityLat] = city.loc.coordinates;
    const approximate = Math.hypot(cityLat - lat, (cityLon - lon) * Math.cos(lat * Math.PI / 180));
    if (approximate < distance) { distance = approximate; winner = city; }
  }
  return { city: winner, distance };
}
app.get('/api/places/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  const key = normalized(query);
  const alias = aliases.find(item => item.words.some(word => normalized(word) === key));
  if (alias) {
    const place = cities.find(city => city.name === alias.name && city.country === alias.country);
    if (place) return res.json([cityPoint(place)]);
  }
  const results = namedCities.filter(city => normalized(city.name).includes(key) || normalized(city.altName).includes(key))
    .sort((a, b) => Number(normalized(b.name) === key) - Number(normalized(a.name) === key) || b.population - a.population)
    .slice(0, 6).map(cityPoint);
  res.json(results);
});
app.get('/api/places/reverse', (req, res) => {
  const parsed = pointSchema.pick({ lat: true, lon: true }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: '无效坐标' });
  const { lat, lon } = parsed.data;
  const { city, distance } = nearestCity(lat, lon);
  res.json({ lat, lon, label: distance < 0.6 ? `${city.name} 附近 · ${city.country}` : `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
});
app.get('/api/places/random', (_req, res) => {
  try {
    const point = randomLandPoint();
    const { city, distance } = nearestCity(point.lat, point.lon);
    res.json({ ...point, label: distance < 0.6 ? `${city.name} 附近 · ${city.country}` : point.label });
  } catch (error) { res.status(503).json({ error: errorMessage(error) }); }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*path', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? '单张照片不能超过 12 MB' : error.code === 'LIMIT_FILE_COUNT' ? '一次上传的照片过多，请减少照片后重试' : '照片上传失败，请重新选择';
    return res.status(400).json({ error: message });
  }
  if (error instanceof Error && error.message.startsWith('仅支持')) return res.status(400).json({ error: error.message });
  console.error('请求失败：', error);
  return res.status(500).json({ error: '请求处理失败，请稍后重试' });
});
const port = Number(process.env.PORT || 5173);
app.listen(port, '127.0.0.1', () => console.log(`在别处运行于 http://127.0.0.1:${port}`));
for (const trip of listTrips()) {
  if (trip.status === 'planning' && !trip.statusNote) void engine.initialize(trip.id);
  if (trip.status === 'ended' && !trip.bookClosing) void engine.finishBook(trip.id);
  if (trip.spots.some(spot => spot.photos.some(photo => photo.status === 'pending'))) void engine.resumePhotoJobs(trip.id);
}
setInterval(() => {
  for (const trip of listTrips()) {
    if (trip.status === 'planning' && !trip.statusNote && !engine.isBusy(trip.id)) void engine.initialize(trip.id);
    if (trip.status === 'active' && Date.now() >= new Date(trip.nextTickAt).getTime()) void engine.advance(trip.id);
    if (trip.spots.some(spot => spot.photos.some(photo => photo.status === 'pending'))) void engine.resumePhotoJobs(trip.id);
  }
}, 60_000).unref();
// Event pacing starts a new stop only after the current photos have arrived.
// Eligibility and the per-trip lock live in the engine, including error/pause checks.
setInterval(() => {
  for (const trip of listTrips()) {
    if (trip.pace === 'event' && trip.status === 'active' && !engine.isBusy(trip.id)) void engine.advance(trip.id);
  }
}, 1000).unref();
