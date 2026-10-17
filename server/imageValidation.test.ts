import assert from 'node:assert/strict';
import test from 'node:test';
import { validReferenceImage } from './imageValidation.js';

test('reference image bytes must agree with the declared format', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array(16).fill(0)]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Buffer.from('RIFF0000WEBPVP8 ', 'ascii');
  assert.equal(validReferenceImage('image/png', png), true);
  assert.equal(validReferenceImage('image/jpeg', jpeg), true);
  assert.equal(validReferenceImage('image/webp', webp), true);
  assert.equal(validReferenceImage('image/jpeg', png), false);
  assert.equal(validReferenceImage('image/png', Buffer.from('not a photo')), false);
});
