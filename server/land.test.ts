import test from 'node:test';
import assert from 'node:assert/strict';
import { isLand, randomLandPoint } from './land.js';

test('known land and ocean coordinates match the land mask', () => {
  assert.equal(isLand(48.8566, 2.3522), true); // Paris
  assert.equal(isLand(-8.6705, 115.2126), true); // Bali
  assert.equal(isLand(62.01, -6.77), true); // Faroe Islands
  assert.equal(isLand(0, 0), false); // Gulf of Guinea, not "Null Island"
  assert.equal(isLand(0, -3), false); // Gulf of Guinea away from the artificial polygon
  assert.equal(isLand(0, -140), false); // Pacific
  assert.equal(isLand(-20, 80), false); // Indian Ocean
});

test('random landing retries water and keeps the actual land coordinate', () => {
  const parisLat = 48.8566;
  const parisLon = 2.3522;
  const draws = [0.5, 0.5, (Math.sin(parisLat * Math.PI / 180) + 1) / 2, (parisLon + 180) / 360];
  let index = 0;
  const landing = randomLandPoint(() => draws[index++]);
  assert.equal(index, 4);
  assert.ok(Math.abs(landing.lat - parisLat) < 0.00001);
  assert.ok(Math.abs(landing.lon - parisLon) < 0.00001);
});
