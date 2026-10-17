import assert from 'node:assert/strict';
import test from 'node:test';
import { canAdvanceEvent, CHECKPOINT_MS, choosePhotoKinds, cyberDay, nextCheckpointAt, shouldRecordSpot } from './scheduler.js';
import type { Spot, Trip } from './store.js';

const start = Date.parse('2026-09-29T08:00:00.000Z');
const base: Pick<Trip, 'createdAt' | 'startedAt' | 'spots'> = {
  createdAt: new Date(start).toISOString(),
  startedAt: new Date(start).toISOString(),
  spots: [],
};
function spot(day: number, minute: number, photos = 0): Spot {
  return {
    id: `${day}-${minute}`, day, happenedAt: new Date(start + minute * 60_000).toISOString(),
    place: { lat: 62, lon: -7, label: 'Faroe Islands' }, title: '', diary: '',
    activity: '', transport: '', stay: '', people: [], event: null, consequence: null,
    sourceUrl: null, photoDirection: '',
    photos: Array.from({ length: photos }, (_, index) => ({
      url: '', kind: index % 2 ? 'landscape' as const : 'candid' as const,
      caption: '', status: 'pending' as const,
    })),
    planRevision: 1, branchReason: null,
  };
}

test('one cyber day passes per real hour, including after a long sleep', () => {
  assert.equal(cyberDay(base, start), 1);
  assert.equal(cyberDay(base, start + 59 * 60_000), 1);
  assert.equal(cyberDay(base, start + 60 * 60_000), 2);
  assert.equal(cyberDay(base, start + 12 * 60 * 60_000), 13);
  assert.equal(nextCheckpointAt(start), new Date(start + CHECKPOINT_MS).toISOString());
});

test('checkpoints do not turn every ten minutes into a new spot', () => {
  assert.equal(shouldRecordSpot(base, start), true);
  const one = { ...base, spots: [spot(1, 0)] };
  assert.equal(shouldRecordSpot(one, start + 10 * 60_000), false);
  assert.equal(shouldRecordSpot(one, start + 30 * 60_000), true);
  const two = { ...base, spots: [spot(1, 0), spot(1, 30)] };
  assert.equal(shouldRecordSpot(two, start + 50 * 60_000), false);
  assert.equal(shouldRecordSpot(two, start + 60 * 60_000), true);
});

test('photographs stay within a daily budget while keeping the agent’s scene choice', () => {
  assert.deepEqual(choosePhotoKinds(['landscape', 'candid'], [spot(1, 0, 1)]), ['landscape', 'candid']);
  assert.deepEqual(choosePhotoKinds(['candid', 'landscape'], [spot(1, 0, 2)]), ['candid']);
  assert.deepEqual(choosePhotoKinds(['candid'], [spot(1, 0, 3)]), []);
});

test('event clock advances two stops per day without depending on real time', () => {
  const eventTrip = { ...base, pace: 'event' as const, spots: [spot(1, 0)] };
  assert.equal(cyberDay(eventTrip, start + 30 * 24 * 3600_000), 1);
  eventTrip.spots.push(spot(1, 1));
  assert.equal(cyberDay(eventTrip, start), 2);
  assert.equal(shouldRecordSpot(eventTrip, start), true);
  eventTrip.spots.push(spot(2, 2));
  assert.equal(cyberDay(eventTrip, start), 2);
});

test('event pacing waits for all photos and stops on error, pause or end', () => {
  const journey = { status: 'active' as Trip['status'], statusNote: null as string | null, spots: [spot(1, 0, 4)] };
  assert.equal(canAdvanceEvent(journey), false);
  journey.spots[0].photos.forEach(photo => { photo.status = 'ready'; });
  assert.equal(canAdvanceEvent(journey), true);
  journey.spots[0].photos[0].status = 'failed';
  assert.equal(canAdvanceEvent(journey), false);
  journey.spots[0].photos[0].status = 'ready';
  journey.statusNote = '旅程推进待重试';
  assert.equal(canAdvanceEvent(journey), false);
  journey.statusNote = null;
  journey.status = 'paused';
  assert.equal(canAdvanceEvent(journey), false);
  journey.status = 'ended';
  assert.equal(canAdvanceEvent(journey), false);
});
