import test from 'node:test';
import assert from 'node:assert/strict';
import { bookFace, bookSpreadFaces } from './bookLayout.js';
test('each event owns both facing pages', () => {
  for (let page=1;page<=12;page++) {
    const faces=bookSpreadFaces(page);
    assert.deepEqual(bookFace(faces.left,12),{kind:'entry',spotIndex:page-1,side:'left'});
    assert.deepEqual(bookFace(faces.right,12),{kind:'entry',spotIndex:page-1,side:'right'});
  }
});
test('turning reveals the actual reverse page and the following face', () => {
  const faces=bookSpreadFaces(3);
  assert.equal(faces.forwardBack,bookSpreadFaces(4).left);
  assert.equal(faces.nextRight,bookSpreadFaces(4).right);
  assert.equal(faces.backwardLeft,bookSpreadFaces(2).left);
  assert.equal(faces.backwardBack,bookSpreadFaces(2).right);
  assert.equal(bookFace(bookSpreadFaces(0).right,12).kind,'cover');
  assert.equal(bookFace(bookSpreadFaces(13).left,12).kind,'closing');
  assert.equal(bookFace(bookSpreadFaces(13).right,12).kind,'closing');
});
