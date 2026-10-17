import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanNarrativeText, cleanStoryFields, validatePhotoComposition, validatePlanReferences } from './travelContent.js';
import type { PhotoShot } from './store.js';

test('museum event reads as an experience and loses its simulation explanation', () => {
  assert.equal(cleanNarrativeText('模拟入馆时，才发现装着午饭的大背包不能带进展区，需要留在走廊的可锁寄存处。我锁好包后又想起面包还在里面，重新开柜取出。大包不得进入展区及寄存设施有馆方资料支持；忘取午饭是本次模拟插曲。'), '入馆时，才发现装着午饭的大背包不能带进展区，需要留在走廊的可锁寄存处。我锁好包后又想起面包还在里面，重新开柜取出。');
  assert.equal(cleanNarrativeText('接近美术馆时，模拟中的细雨突然变密。'), '接近美术馆时，细雨突然变密。');
  assert.equal(cleanNarrativeText('游客速写及同行者画船为模拟情节；未触摸藏品。'), '未触摸藏品。');
});

test('reference checks keep completed plans intact and permit a genuine cancellation', () => {
  const planned = new Set(['next-stop']);
  assert.throws(() => validatePlanReferences(planned, { visitedPlanLegId: null, skippedPlanLegId: 'already-visited', skipReason: '返回住处', event: '下雨', consequence: '改去室内' }), /planned/);
  assert.doesNotThrow(() => validatePlanReferences(planned, { visitedPlanLegId: null, skippedPlanLegId: 'next-stop', skipReason: '交通接续无法落实', event: '没有合适的班次', consequence: '改去城区图书馆' }));
  assert.throws(() => validatePlanReferences(planned, { visitedPlanLegId: 'next-stop', skippedPlanLegId: 'next-stop', skipReason: '回去了', event: '下雨', consequence: '返城' }), /skippedPlanLegId/);
});

test('story repair preserves geography, sources, photo briefs and real simulation activities', () => {
  const original = { id: 'same', place: { lat: 62, lon: -7, label: '模拟器展厅' }, diary: '体验了一次飞行模拟器。', event: '模拟中，纸袋破了。', sourceUrl: 'https://example.org/simulator', brief: { framing: '不虚构窗外景观' }, photos: [{ id: 'photo-1', kind: 'candid', url: '/media/original.png', caption: '本次模拟中，杯子换了一只手。' }] };
  const repaired = cleanStoryFields(original);
  assert.equal(repaired.event, '纸袋破了。');
  assert.equal(repaired.diary, original.diary);
  assert.deepEqual(repaired.place, original.place);
  assert.equal(repaired.sourceUrl, original.sourceUrl);
  assert.deepEqual(repaired.brief, original.brief);
  assert.equal(repaired.photos[0].url, original.photos[0].url);
  assert.equal(original.event, '模拟中，纸袋破了。');
});

test('scenic stops require photography coverage while daily scenes stay flexible', () => {
  const shot = (kind: PhotoShot['kind']): PhotoShot => ({ kind, caption: '一处场景', brief: { moment: '看见这处场景的时刻', photographer: '我停在公共道路上拍摄', framing: '前景与远处主形状的关系' } });
  assert.throws(() => validatePhotoComposition('scenic', [shot('landscape'), ...Array.from({ length: 3 }, () => shot('candid'))]), /风光/);
  assert.doesNotThrow(() => validatePhotoComposition('scenic', [shot('landscape'), shot('landscape'), shot('candid'), shot('candid')]));
  assert.doesNotThrow(() => validatePhotoComposition('daily', Array.from({ length: 4 }, () => shot('candid'))));
  assert.throws(() => validatePhotoComposition('scenic', [...Array.from({ length: 3 }, () => shot('landscape')), ...Array.from({ length: 6 }, () => shot('candid'))]), /风光/);
});
