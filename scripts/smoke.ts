import assert from 'node:assert/strict';
const base = process.env.TRAVEL_TEST_URL || 'http://127.0.0.1:5173';
async function get(route: string) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  return response;
}
assert.equal((await (await get('/api/health')).json()).ok, true);
assert.ok(Array.isArray(await (await get('/api/trips')).json()));
assert.match(await (await get('/')).text(), /在别处/);
assert.match(await (await get('/demo/window.svg')).text(), /<svg/);
const map = await (await get('/maps/travel-atlas.json')).json();
assert.ok(map.layers.length > 10);
const places = await (await get('/api/places/search?q=iceland')).json();
assert.ok(places[0].label.includes('IS'));
for (let i = 0; i < 5; i++) {
  const point = await (await get('/api/places/random')).json();
  assert.ok(point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180);
}
const crossSite = await fetch(base + '/api/trips', { method: 'POST', headers: { Origin: 'https://example.com' } });
assert.equal(crossSite.status, 403);
console.log('PASS: page, health, storage API, demo asset, map, place search, random land, cross-site guard');
