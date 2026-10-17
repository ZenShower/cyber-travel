import assert from 'node:assert/strict';
import test from 'node:test';
import { TripEngine, type EngineDeps } from './engine.js';
import type { PlanLeg, Spot, Trip } from './store.js';
import { ActivityRegistry } from './activity.js';

const origin = { lat: 62.011, lon: -6.771, label: 'Tórshavn · FO' };
const time = Date.parse('2026-09-29T00:00:00.000Z');

function fixture(status: Trip['status'] = 'planning'): Trip {
  return {
    id: 'faroe', createdAt: new Date(time).toISOString(), startedAt: status === 'active' ? new Date(time).toISOString() : null,
    endedAt: null, status, statusNote: null, travelerName: '旅人', avatarUrls: [],
    destination: origin, currentDay: 1, nextTickAt: new Date(time).toISOString(), planRevision: 1,
    plan: [], spots: [], bookTitle: null, bookClosing: null,
  };
}

function spot(at: number): Spot {
  return {
    id: 'stop-1', day: 1, happenedAt: new Date(at).toISOString(), place: origin, title: '抵达托尔斯港',
    diary: '沿着港口走了一段路。', activity: '散步', transport: '步行', stay: '民宿', people: [],
    event: null, consequence: null, sourceUrl: null, photoDirection: '港口随拍',
    photos: [], planRevision: 1, branchReason: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(initial: Trip, overrides: Partial<EngineDeps> = {}) {
  let saved = structuredClone(initial);
  let now = time;
  const read = () => structuredClone(saved);
  const write = (trip: Trip) => { saved = structuredClone(trip); };
  const deps: EngineDeps = {
    read, write, now: () => now,
    plan: async () => [],
    advance: async () => ({ spot: spot(now), newPlan: null, photoKinds: ['candid'] }),
    photo: async () => '/media/faroe/photo.png',
    book: async () => ({ title: '在别处', closing: '下次再见。' }),
    ...overrides,
  };
  return { engine: new TripEngine(deps), read, setNow: (value: number) => { now = value; } };
}

test('event mode avoids real-time waits and duplicate advances while photos are pending', async () => {
  const initial = fixture('active');
  initial.pace = 'event';
  initial.nextTickAt = new Date(time + 3600_000).toISOString();
  const photo = deferred<string>();
  let advances = 0;
  const { engine, read } = harness(initial, {
    advance: async trip => {
      advances += 1;
      return { spot: { ...spot(time), id: `stop-${advances}`, day: trip.currentDay }, newPlan: null, photoKinds: ['candid'] };
    },
    photo: () => photo.promise,
  });
  await engine.advance(initial.id);
  assert.equal(advances, 1);
  await engine.advance(initial.id);
  assert.equal(advances, 1);
  photo.resolve('/media/photo.png');
  await new Promise(resolve => setImmediate(resolve));
  await engine.advance(initial.id);
  assert.equal(advances, 2);
  assert.equal(read().spots[1].day, 1);
  await new Promise(resolve => setImmediate(resolve));
  await engine.advance(initial.id);
  assert.equal(advances, 3);
  assert.equal(read().spots[2].day, 2);
});

test('failed event advancement waits for an explicit retry', async () => {
  const initial = fixture('active'); initial.pace = 'event';
  let advances = 0;
  const { engine } = harness(initial, { advance: async () => { advances += 1; throw new Error('offline'); } });
  await engine.advance(initial.id);
  await engine.advance(initial.id);
  assert.equal(advances, 1);
});

test('planning progress is visible while Codex is pending and becomes failed on rejection', async () => {
  const activity = new ActivityRegistry();
  const delay = deferred<PlanLeg[]>();
  const { engine, read } = harness(fixture(), { activity, plan: (_trip, report) => {
    report?.('正在查找地点、活动与交通资料');
    return delay.promise;
  } });
  const pending = engine.initialize('faroe');
  assert.equal(activity.snapshot('faroe').tasks[0].status, 'running');
  assert.match(activity.snapshot('faroe').tasks[0].message, /交通资料/);
  delay.resolve([]);
  await pending;
  assert.equal(activity.snapshot('faroe').tasks[0].status, 'completed');
  assert.equal(read().status, 'active');
  const failing = harness(fixture(), { activity, plan: async () => { throw new Error('offline'); } });
  await failing.engine.initialize('faroe');
  assert.equal(activity.snapshot('faroe').tasks.filter(task => task.kind === 'plan').at(-1)?.status, 'failed');
  assert.match(failing.read().statusNote!, /offline/);
});

test('ending during initial planning cannot reactivate the trip', async () => {
  const delayed = deferred<PlanLeg[]>();
  const { engine, read } = harness(fixture(), { plan: () => delayed.promise });
  const pending = engine.initialize('faroe');
  assert.equal(engine.isBusy('faroe'), true);
  engine.end('faroe');
  delayed.resolve([]);
  await pending;
  assert.equal(read().status, 'ended');
  assert.equal(read().spots.length, 0);
});

test('ending while a travel decision is pending discards its late result', async () => {
  const delayed = deferred<{ spot: Spot; newPlan: PlanLeg[] | null; photoKinds: Array<'candid' | 'landscape'> }>();
  const { engine, read } = harness(fixture('active'), { advance: () => delayed.promise });
  const pending = engine.advance('faroe');
  engine.end('faroe');
  delayed.resolve({ spot: spot(time), newPlan: null, photoKinds: ['candid'] });
  await pending;
  assert.equal(read().status, 'ended');
  assert.equal(read().spots.length, 0);
});

test('photo failure is visible and a retry can fill the same spot', async () => {
  let attempts = 0;
  const { engine, read } = harness(fixture('active'), {
    photo: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('image service unavailable');
      return '/media/faroe/recovered.png';
    },
  });
  await engine.advance('faroe');
  await engine.resumePhotoJobs('faroe');
  assert.equal(read().spots[0].photos[0].status, 'failed');
  assert.match(read().statusNote || '', /照片生成失败/);
  assert.equal(engine.retryPhotos('faroe'), 1);
  await engine.resumePhotoJobs('faroe');
  assert.equal(read().spots[0].photos[0].status, 'ready');
  assert.equal(read().spots[0].photos[0].url, '/media/faroe/recovered.png');
});

test('four-photo moment keeps repeated candid shots distinct through generation', async () => {
  const photoShots = Array.from({ length: 4 }, (_, index) => ({
    kind: 'candid' as const,
    caption: `第 ${index + 1} 个瞬间`,
    brief: { moment: `时刻 ${index + 1}`, photographer: '同行者举起相机', framing: `画面 ${index + 1}` },
  }));
  const { engine, read } = harness(fixture('active'), {
    advance: async () => ({ spot: { ...spot(time), photoShots }, newPlan: null, photoKinds: photoShots.map(item => item.kind) }),
    photo: async (_trip, _spot, photo) => `/media/faroe/${photo.id}.png`,
  });
  await engine.advance('faroe');
  await engine.resumePhotoJobs('faroe');
  const photos = read().spots[0].photos;
  assert.equal(photos.length, 4);
  assert.equal(new Set(photos.map(photo => photo.id)).size, 4);
  assert.equal(new Set(photos.map(photo => photo.url)).size, 4);
  assert.ok(photos.every(photo => photo.status === 'ready'));
});

test('ten-minute checks do not generate a new stop before the thirty-minute gap', async () => {
  let calls = 0;
  const { engine, read, setNow } = harness(fixture('active'), {
    advance: async () => { calls += 1; return { spot: { ...spot(time), id: `stop-${calls}` }, newPlan: null, photoKinds: [] }; },
  });
  await engine.advance('faroe');
  assert.equal(calls, 1);
  setNow(time + 10 * 60_000);
  await engine.advance('faroe');
  assert.equal(calls, 1);
  setNow(time + 30 * 60_000);
  await engine.advance('faroe');
  assert.equal(calls, 2);
  assert.equal(read().spots.length, 2);
});

test('a nearby future leg stays planned until the agent explicitly completes it', async () => {
  const trip = fixture('active');
  trip.plan = [
    { id: 'harbor', title: '托尔斯港港边', place: origin, transport: '步行', activity: '港边慢行', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'planned' },
    { id: 'village', title: 'Kirkjubøur 旧村道', place: { lat: 61.9558, lon: -6.7933, label: 'Kirkjubøur' }, transport: '徒步', activity: '旧路', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'planned' },
  ];
  const { engine, read } = harness(trip, {
    advance: async () => ({ spot: spot(time), newPlan: null, photoKinds: [], visitedPlanLegId: 'harbor' }),
  });
  await engine.advance('faroe');
  assert.equal(read().plan[0].status, 'visited');
  assert.equal(read().plan[1].status, 'planned');
});

test('a completed leg remains visited when an event rewrites the rest of the plan', async () => {
  const trip = fixture('active');
  trip.plan = [
    { id: 'harbor', title: '港边', place: origin, transport: '步行', activity: '散步', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'planned' },
    { id: 'next', title: '旧路', place: origin, transport: '徒步', activity: '徒步', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'planned' },
  ];
  const detour: PlanLeg = { ...trip.plan[1], id: 'detour', title: '雨天室内', activity: '做饭' };
  const { engine, read } = harness(trip, {
    advance: async () => ({ spot: { ...spot(time), event: '突然下起大雨', consequence: '旧路封闭，先去室内做饭', branchReason: '雨改变了明天的路线' }, newPlan: [detour], planChange: 'rewrite', newOpenConsequence: '明天确认雨后新路线', photoKinds: [], visitedPlanLegId: 'harbor' }),
  });
  await engine.advance('faroe');
  assert.deepEqual(read().plan.map(item => item.status), ['visited', 'superseded', 'planned']);
  assert.equal(read().planRevision, 2);
  assert.equal(read().consequenceThreads?.[0].pending, '明天确认雨后新路线');
});

test('a completed plan can gain new directions without turning old stops into a branch', async () => {
  const trip = fixture('active');
  trip.plan = [{ id: 'harbor', title: '港边', place: origin, transport: '步行', activity: '散步', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'visited' }];
  const next: PlanLeg = { ...trip.plan[0], id: 'island', title: '下一座岛', status: 'planned' };
  const { engine, read } = harness(trip, {
    advance: async () => ({ spot: spot(time), newPlan: [next], planChange: 'extend', photoKinds: [] }),
  });
  await engine.advance('faroe');
  assert.deepEqual(read().plan.map(item => item.status), ['visited', 'planned']);
  assert.equal(read().planRevision, 2);
});

test('an event consequence must be carried into a later decision and can be resolved', async () => {
  const trip = fixture('active');
  let calls = 0;
  const { engine, read, setNow } = harness(trip, {
    advance: async current => {
      calls += 1;
      if (calls === 1) return { spot: { ...spot(time), event: '船班取消', consequence: '今晚留在港边，明早再核对班次' }, newPlan: null, newOpenConsequence: '明早核对船班，再决定去不去岛上', photoKinds: [] };
      const thread = current.consequenceThreads?.find(item => item.status === 'open');
      assert.ok(thread);
      return { spot: { ...spot(time + 3_600_000), id: 'stop-2', day: 2, diary: '查到了恢复的船班，早上搭船去了岛上。' }, newPlan: null, continuityUpdates: [{ threadId: thread.id, effect: '核对恢复的船班并搭船离港', remaining: null }], photoKinds: [] };
    },
  });
  await engine.advance('faroe');
  assert.equal(read().consequenceThreads?.[0].status, 'open');
  setNow(time + 3_600_000);
  await engine.advance('faroe');
  assert.equal(read().spots.length, 2);
  assert.equal(read().consequenceThreads?.[0].status, 'resolved');
  assert.deepEqual(read().spots[1].continuityUpdates?.map(item => item.effect), ['核对恢复的船班并搭船离港']);
});

test('uploaded and newly met companions keep distinct identities across a separation', async () => {
  const trip = fixture('active');
  trip.companions = [{ id: 'friend-1', name: '阿遥', source: 'uploaded', referenceUrls: ['/media/faroe/friend.png'], appearance: null, travelingTogether: true, relationship: '出发前的朋友', whereabouts: '同行', firstDay: 1, lastDay: 1, history: [] }];
  let calls = 0;
  const { engine, read, setNow } = harness(trip, { advance: async current => {
    calls += 1;
    if (calls === 1) return { spot: { ...spot(time), people: ['阿遥', 'Einar'], companionChanges: [
      { id: 'friend-1', name: '阿遥', travelingTogether: true, relationship: '一起旅行的朋友', whereabouts: '港口', change: '一起在港口吃晚饭', appearance: null },
      { id: null, name: 'Einar', travelingTogether: false, relationship: '刚认识的船员', whereabouts: '港口', change: '借给我们一张旧航线图', appearance: '穿深蓝色毛衣' },
    ] }, newPlan: null, photoKinds: [] };
    const met = current.companions?.find(person => person.name === 'Einar');
    assert.ok(met?.id);
    return { spot: { ...spot(time + 3_600_000), id: 'stop-2', day: 2, people: ['Einar'], companionChanges: [
      { id: 'friend-1', name: '阿遥', travelingTogether: false, relationship: '暂时分开，仍保持联系', whereabouts: '留在托尔斯港', change: '决定多留一天，我们先走', appearance: null },
      { id: met.id, name: 'Einar', travelingTogether: true, relationship: '临时同行的朋友', whereabouts: '一起登船', change: '临时改了班次，和我们同船', appearance: null },
    ] }, newPlan: null, photoKinds: [] };
  } });
  await engine.advance('faroe');
  setNow(time + 3_600_000);
  await engine.advance('faroe');
  const people = read().companions!;
  assert.equal(people.length, 2);
  assert.deepEqual(people.map(person => person.travelingTogether), [false, true]);
  assert.deepEqual(people.map(person => person.history.length), [2, 2]);
  assert.equal(read().spots[1].companionChanges?.[1].id, people[1].id);
});

test('a later stop cannot silently drop an unresolved consequence', async () => {
  const trip = fixture('active');
  trip.consequenceThreads = [{ id: 'ship', originSpotId: 'older', originDay: 1, trigger: '船班取消', pending: '核对新船班', status: 'open', history: [] }];
  const { engine, read } = harness(trip, { advance: async () => ({ spot: spot(time), newPlan: null, photoKinds: [] }) });
  await engine.advance('faroe');
  assert.equal(read().spots.length, 0);
  assert.match(read().statusNote || '', /没有完整承接/);
});

test('a plan rewrite without an event and a lasting effect is rejected', async () => {
  const trip = fixture('active');
  trip.plan = [{ id: 'next', title: '旧路', place: origin, transport: '步行', activity: '徒步', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'planned' }];
  const { engine, read } = harness(trip, { advance: async () => ({ spot: spot(time), newPlan: [{ ...trip.plan[0], id: 'other' }], planChange: 'rewrite', photoKinds: [] }) });
  await engine.advance('faroe');
  assert.equal(read().plan[0].status, 'planned');
  assert.equal(read().spots.length, 0);
  assert.match(read().statusNote || '', /改路必须由当前或此前尚未结清的事件触发/);
});

test('a previous event can cause a route branch on a later day', async () => {
  const trip = fixture('active');
  trip.plan = [{ id: 'ferry', title: '乘船去岛上', place: origin, transport: '渡轮', activity: '登岛', why: '', localBasis: '', accessNotes: '', sourceUrl: null, status: 'planned' }];
  trip.consequenceThreads = [{ id: 'sailing', originSpotId: 'day-1', originDay: 1, trigger: '船班暂停', pending: '确定陆上替代路线', status: 'open', history: [] }];
  const alternate: PlanLeg = { ...trip.plan[0], id: 'road', title: '改走陆上路线', transport: '巴士' };
  const { engine, read } = harness(trip, {
    advance: async () => ({
      spot: { ...spot(time), branchReason: '昨日船班暂停，今天确认走陆上路线', branchSourceThreadId: 'sailing' },
      newPlan: [alternate], planChange: 'rewrite', photoKinds: [],
      continuityUpdates: [{ threadId: 'sailing', effect: '核对陆上交通并放弃原本的渡轮', remaining: null }],
    }),
  });
  await engine.advance('faroe');
  assert.deepEqual(read().plan.map(item => item.status), ['superseded', 'planned']);
  assert.equal(read().spots[0].branchSourceThreadId, 'sailing');
  assert.equal(read().consequenceThreads?.[0].status, 'resolved');
});

test('a missed appointment leaves the planned stop visibly skipped with its cause', async () => {
  const trip = fixture('active');
  trip.plan = [{ id: 'gallery', title: 'Sandur 美术馆', place: origin, transport: '步行', activity: '参观', why: '', localBasis: '', accessNotes: '需预约', sourceUrl: null, status: 'planned' }];
  const { engine, read } = harness(trip, {
    advance: async () => ({
      spot: { ...spot(time), event: '馆方没有确认预约', consequence: '未入馆，改到镇图书馆读书', activity: '图书馆阅读' },
      newPlan: null, photoKinds: [], skippedPlanLegId: 'gallery', skipReason: '预约未确认，离开前不再尝试入馆',
    }),
  });
  await engine.advance('faroe');
  assert.equal(read().spots.length, 1);
  assert.equal(read().plan[0].status, 'skipped');
  assert.equal(read().plan[0].resolvedDay, 1);
  assert.equal(read().plan[0].resolutionNote, '预约未确认，离开前不再尝试入馆');
});
