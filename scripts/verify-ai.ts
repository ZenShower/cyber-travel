import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { planJourney, advanceJourney, generateSpotPhoto, closeBook } from '../server/agent.js';
import { codexStatus } from '../server/codexRuntime.js';
import { saveTrip, type Trip, type Photo } from '../server/store.js';

const status = codexStatus();
if (!status.available || !status.loggedIn) throw new Error(status.message);
console.log('真实验证：检索 → 计划 → 节点 → 4张照片（随拍+风光）→ 相册。会使用账号额度。');
const now = new Date().toISOString();
const trip: Trip = { id: randomUUID(), pace: 'realtime', createdAt: now, startedAt: null, endedAt: null,
  status: 'planning', statusNote: null, travelerName: '测试旅人', avatarUrls: [], companions: [],
  destination: { lat: 62.01, lon: -6.77, label: 'Tórshavn · FO' }, currentDay: 1, nextTickAt: now,
  planRevision: 1, plan: [], spots: [], consequenceThreads: [], bookTitle: null, bookClosing: null };
const report = (message: string) => console.log(new Date().toISOString().slice(11, 19), message);
trip.plan = await planJourney(trip, report);
console.log(`已查证 ${trip.plan.length} 段方向`);
const result = await advanceJourney(trip, { eventCue: true, report });
const spot = result.spot;
// Exercise both photography routes. No user portrait or local history is used.
const shots = (spot.photoShots || []).slice(0, 4);
if (shots.length !== 4) throw new Error('节点没有四个独立拍摄时刻');
shots[0].kind = 'landscape';
shots[1].kind = 'candid';
spot.photoShots = shots;
spot.photos = shots.map(shot => ({ id: randomUUID(), kind: shot.kind, caption: shot.caption, brief: shot.brief, status: 'pending' as const, url: '' }));
trip.spots = [spot]; trip.status = 'paused'; trip.startedAt = now;
saveTrip(trip);
const generate = async (photo: Photo) => {
  photo.url = await generateSpotPhoto(trip, spot, photo, report); photo.status = 'ready';
  assertImage(await stat(path.join('public', photo.url.slice(1))).then(s => s.size)); saveTrip(trip);
};
function assertImage(bytes: number) { if (bytes < 1000) throw new Error('生成图片文件过小'); }
for (let i = 0; i < spot.photos.length; i += 2) await Promise.all(spot.photos.slice(i, i + 2).map(generate));
const book = await closeBook(trip, report);
trip.bookTitle = book.title; trip.bookClosing = book.closing; trip.endedAt = new Date().toISOString(); trip.status = 'ended'; saveTrip(trip);
await mkdir('data/verification', { recursive: true });
await writeFile('data/verification/live.json', JSON.stringify({ ok: true, tripId: trip.id, planLegs: trip.plan.length, photos: spot.photos.length, kinds: spot.photos.map(p => p.kind), title: trip.bookTitle }, null, 2));
console.log(`PASS: ${trip.plan.length}段计划、${spot.photos.length}张真实生成图、相册；测试记录只保存在已忽略的 data/ 和 public/media/。`);
