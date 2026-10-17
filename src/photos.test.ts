import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeReferencePhotos, MAX_REFERENCE_BYTES } from './photos.js';

const photo = (name: string, size = 1000, type = 'image/jpeg') => ({ name, size, type, lastModified: 1 }) as File;

test('reference photos append without silently replacing earlier selections', () => {
  const first = mergeReferencePhotos([], [photo('front.jpg')]);
  const second = mergeReferencePhotos(first.files, [photo('side.jpg')]);
  assert.deepEqual(second.files.map(file => file.name), ['front.jpg', 'side.jpg']);
});

test('reference photos reject duplicates, invalid formats and oversized files', () => {
  const result = mergeReferencePhotos([photo('front.jpg')], [
    photo('front.jpg'), photo('film.gif', 1000, 'image/gif'), photo('large.jpg', MAX_REFERENCE_BYTES + 1), photo('side.webp', 2000, 'image/webp'),
  ]);
  assert.deepEqual(result.files.map(file => file.name), ['front.jpg', 'side.webp']);
  assert.match(result.message || '', /格式不支持/);
  assert.match(result.message || '', /超过 12 MB/);
  assert.match(result.message || '', /已添加过/);
});

test('reference photo selection stops at eight', () => {
  const result = mergeReferencePhotos([], Array.from({ length: 10 }, (_, index) => photo(`photo-${index}.jpg`)));
  assert.equal(result.files.length, 8);
  assert.match(result.message || '', /最多只能上传 8 张/);
});
