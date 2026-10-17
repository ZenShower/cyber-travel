import type { PhotoShot, Spot, Trip } from './store.js';

export const DAY_MS = 60 * 60 * 1000;
export const CHECKPOINT_MS = 10 * 60 * 1000;
export const MAX_SPOTS_PER_DAY = 2;
export const MAX_PHOTOS_PER_DAY = 3;
export const MAX_GRID_PHOTOS_PER_DAY = 18;
const MIN_RECORD_GAP_MS = 30 * 60 * 1000;

export function cyberDay(trip: Pick<Trip, 'startedAt' | 'createdAt'> & Partial<Pick<Trip, 'pace' | 'spots'>>, now: number): number {
  if (trip.pace === 'event') {
    const spots = trip.spots || [];
    const lastDay = spots.at(-1)?.day || 1;
    return lastDay + (spots.filter(spot => spot.day === lastDay).length >= MAX_SPOTS_PER_DAY ? 1 : 0);
  }
  const started = new Date(trip.startedAt || trip.createdAt).getTime();
  if (!Number.isFinite(started)) return 1;
  return Math.max(1, Math.floor(Math.max(0, now - started) / DAY_MS) + 1);
}

export function shouldRecordSpot(trip: Pick<Trip, 'spots' | 'startedAt' | 'createdAt'> & Partial<Pick<Trip, 'pace'>>, now: number): boolean {
  if (trip.pace === 'event') return true;
  const day = cyberDay(trip, now);
  const today = trip.spots.filter(spot => spot.day === day);
  if (today.length >= MAX_SPOTS_PER_DAY) return false;
  if (today.length === 0) return true;
  const lastRecord = new Date(today.at(-1)!.happenedAt).getTime();
  return !Number.isFinite(lastRecord) || now - lastRecord >= MIN_RECORD_GAP_MS;
}

export function canAdvanceEvent(trip: Pick<Trip, 'status' | 'statusNote' | 'spots'>): boolean {
  return trip.status === 'active' && !trip.statusNote &&
    !trip.spots.some(spot => spot.photos.some(photo => photo.status !== 'ready'));
}

export function nextCheckpointAt(now: number): string {
  return new Date(now + CHECKPOINT_MS).toISOString();
}

export function choosePhotoKinds(
  requested: Array<'candid' | 'landscape'>,
  daySpots: Spot[],
): Array<'candid' | 'landscape'> {
  const used = daySpots.reduce((sum, spot) => sum + spot.photos.length, 0);
  const remaining = Math.max(0, MAX_PHOTOS_PER_DAY - used);
  return [...new Set(requested)].slice(0, remaining);
}

export function choosePhotoShots(requested: PhotoShot[], daySpots: Spot[]): PhotoShot[] {
  const used = daySpots.reduce((sum, spot) => sum + spot.photos.length, 0);
  return requested.slice(0, Math.max(0, MAX_GRID_PHOTOS_PER_DAY - used));
}
