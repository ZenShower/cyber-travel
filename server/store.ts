import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type Point = { lat: number; lon: number; label: string };
export type PlanLeg = { id: string; title: string; place: Point; transport: string; activity: string; why: string; localBasis: string; accessNotes: string; sourceUrl: string | null; status: 'planned' | 'visited' | 'skipped' | 'superseded'; introducedDay?: number; resolvedDay?: number; resolutionNote?: string; planningNotes?: string };
export type Photo = { id?: string; url: string; kind: 'candid' | 'landscape'; caption: string; brief?: PhotoBrief; status: 'ready' | 'pending' | 'failed'; attempts?: number; error?: string | null };
export type ContinuityUpdate = { threadId: string; effect: string; remaining: string | null };
export type ConsequenceThread = { id: string; originSpotId: string; originDay: number; trigger: string; pending: string; status: 'open' | 'resolved'; history: Array<{ spotId: string; day: number; effect: string; remaining: string | null }> };
export type PhotoBrief = { moment: string; photographer: string; framing: string };
export type PhotoShot = { kind: Photo['kind']; caption: string; brief: PhotoBrief };
export type CompanionChange = { id: string | null; name: string; travelingTogether: boolean; relationship: string; whereabouts: string; change: string; appearance: string | null };
export type Companion = { id: string; name: string; source: 'uploaded' | 'encounter'; referenceUrls: string[]; appearance: string | null; travelingTogether: boolean; relationship: string; whereabouts: string; firstDay: number; lastDay: number; history: Array<{ spotId: string; day: number; change: string; relationship: string; whereabouts: string; travelingTogether: boolean }> };
export type Spot = { photoScene?: 'scenic' | 'daily' | 'mixed'; id: string; day: number; happenedAt: string; place: Point; title: string; diary: string; activity: string; transport: string; movement?: { mode: string; durationMinutes: number | null; basis: string | null }; stay: string; people: string[]; companionChanges?: CompanionChange[]; event: string | null; consequence: string | null; sourceUrl: string | null; photoDirection: string; photoDirections?: { candid: PhotoBrief | null; landscape: PhotoBrief | null }; photoShots?: PhotoShot[]; photos: Photo[]; planRevision: number; branchReason: string | null; branchSourceThreadId?: string | null; continuityUpdates?: ContinuityUpdate[]; eventCue?: boolean };
export type Trip = { pace?: 'realtime' | 'event'; id: string; createdAt: string; startedAt: string | null; endedAt: string | null; status: 'planning' | 'active' | 'paused' | 'ended'; statusNote: string | null; experimentNote?: string | null; travelerName: string; avatarUrls: string[]; companions?: Companion[]; destination: Point; currentDay: number; nextTickAt: string; planRevision: number; plan: PlanLeg[]; spots: Spot[]; consequenceThreads?: ConsequenceThread[]; bookTitle: string | null; bookClosing: string | null; sharePosterUrl?: string | null; simulation?: boolean };

const root = path.resolve(process.cwd(), 'data');
mkdirSync(root, { recursive: true });
const db = new DatabaseSync(path.join(root, 'trips.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
const getStatement = db.prepare('SELECT value FROM trips WHERE id = ?');
const listStatement = db.prepare('SELECT value FROM trips ORDER BY updated_at DESC');
const saveStatement = db.prepare('INSERT INTO trips (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');

export function getTrip(id: string): Trip | null {
  const row = getStatement.get(id) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as Trip : null;
}
export function listTrips(): Trip[] {
  return (listStatement.all() as { value: string }[]).map(row => JSON.parse(row.value) as Trip);
}
export function saveTrip(trip: Trip): void {
  saveStatement.run(trip.id, JSON.stringify(trip), new Date().toISOString());
}
