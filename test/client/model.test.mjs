import { test } from 'node:test'; import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { syncModel, loadModel, isStale, ENTITY_SPECS } from '../../lib/model.mjs';

test('ENTITY_SPECS defines 6 entities', () => {
  assert.equal(ENTITY_SPECS.length, 6);
  const names = ENTITY_SPECS.map(s => s.name);
  for (const n of ['pipelines', 'calendars', 'tags', 'customFields', 'users', 'location']) {
    assert.ok(names.includes(n), `ENTITY_SPECS missing: ${n}`);
  }
});

test('syncModel fetches 6 entities + stores blob', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  const http = {
    get: async (path) => {
      const map = {
        '/opportunities/pipelines': { pipelines: [{ id: 'p1', name: 'Sales', stages: [{ id: 's1', name: 'Won', position: 0 }] }] },
        '/calendars/': { calendars: [{ id: 'c1', name: 'Intro' }] },
        '/tags': { tags: [{ id: 't1', name: 'lead' }] },
        '/customFields': { customFields: [{ id: 'f1', name: 'Goal', fieldKey: 'goal' }] },
        '/users/': { users: [{ id: 'u1', firstName: 'Jane', lastName: 'D' }] },
        '/locations/': { location: { id: 'L1', name: 'Biz', timezone: 'Asia/Manila', business: { currency: 'PHP' } } },
      };
      const k = Object.keys(map).find(x => path.includes(x));
      return { code: k ? 200 : 404, ok: !!k, j: k ? map[k] : {} };
    },
  };
  const m = await syncModel({ http, loc: 'L1', dir, now: () => 1000 });
  assert.equal(m.locationId, 'L1');
  assert.equal(m.schemaVersion, 1);
  assert.ok(m.entities.pipelines);
  assert.equal(m.entities.pipelines.items[0].name, 'Sales');
  assert.equal(m.entities.pipelines.items[0].stages[0].name, 'Won');
  const loaded = loadModel('L1', dir);
  assert.ok(loaded !== null);
  assert.equal(loaded.entities.calendars.items[0].name, 'Intro');
  assert.equal(loaded.entities.tags.items[0].name, 'lead');
  assert.equal(loaded.entities.users.items[0].firstName, 'Jane');
  assert.equal(loaded.entities.location.item.name, 'Biz');
  rmSync(dir, { recursive: true });
});

test('partial sync: one entity 403 → stored blocked, others fine, no throw', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  const http = {
    get: async (path) => {
      if (path.includes('/tags')) return { code: 403, ok: false, j: null };
      const map = {
        '/opportunities/pipelines': { pipelines: [{ id: 'p1', name: 'S', stages: [] }] },
        '/calendars/': { calendars: [] },
        '/customFields': { customFields: [] },
        '/users/': { users: [] },
        '/locations/': { location: { id: 'L1', name: 'B', timezone: 'UTC', business: { currency: 'PHP' } } },
      };
      const k = Object.keys(map).find(x => path.includes(x));
      return { code: k ? 200 : 404, ok: !!k, j: k ? map[k] : {} };
    },
  };
  const m = await syncModel({ http, loc: 'L1', dir, now: () => 1 });
  assert.equal(m.entities.tags.blocked, true, 'tags must be blocked');
  assert.ok(m.entities.tags.scope, 'blocked entity must have a scope hint');
  // others fine
  assert.ok(Array.isArray(m.entities.pipelines.items), 'pipelines still stored');
  assert.ok(Array.isArray(m.entities.calendars.items), 'calendars still stored');
  rmSync(dir, { recursive: true });
});

test('partial sync: 401 also marks blocked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  const http = {
    get: async (path) => {
      if (path.includes('/users/')) return { code: 401, ok: false, j: null };
      const map = {
        '/opportunities/pipelines': { pipelines: [] },
        '/calendars/': { calendars: [] },
        '/tags': { tags: [] },
        '/customFields': { customFields: [] },
        '/locations/': { location: { id: 'L1', name: 'B', timezone: 'UTC', business: { currency: 'PHP' } } },
      };
      const k = Object.keys(map).find(x => path.includes(x));
      return { code: k ? 200 : 404, ok: !!k, j: k ? map[k] : {} };
    },
  };
  const m = await syncModel({ http, loc: 'L1', dir, now: () => 1 });
  assert.equal(m.entities.users.blocked, true);
  rmSync(dir, { recursive: true });
});

test('loadModel missing → null', () => {
  assert.equal(loadModel('NOPE', join(tmpdir(), 'x' + Math.random())), null);
});

test('loadModel corrupt blob → null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'L1.json'), 'not json', { mode: 0o600 });
  assert.equal(loadModel('L1', dir), null);
  rmSync(dir, { recursive: true });
});

test('loadModel wrong schemaVersion → null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  writeFileSync(join(dir, 'L1.json'), JSON.stringify({ schemaVersion: 99, locationId: 'L1', syncedAt: 1, entities: {} }), { mode: 0o600 });
  assert.equal(loadModel('L1', dir), null);
  rmSync(dir, { recursive: true });
});

test('isStale: fresh entity → false; stale entity → true', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  const http = {
    get: async (path) => {
      const map = {
        '/opportunities/pipelines': { pipelines: [] },
        '/calendars/': { calendars: [] },
        '/tags': { tags: [] },
        '/customFields': { customFields: [] },
        '/users/': { users: [] },
        '/locations/': { location: { id: 'L1', name: 'B', timezone: 'UTC', business: { currency: 'PHP' } } },
      };
      const k = Object.keys(map).find(x => path.includes(x));
      return { code: k ? 200 : 404, ok: !!k, j: k ? map[k] : {} };
    },
  };
  const NOW = 1_000_000;
  const m = await syncModel({ http, loc: 'L1', dir, now: () => NOW });
  // fresh: same time as sync
  assert.equal(isStale(m.entities.pipelines, NOW, ENTITY_SPECS.find(s => s.name === 'pipelines').ttlMs), false);
  // stale: past TTL (24h = 86400000ms)
  assert.equal(isStale(m.entities.pipelines, NOW + 86400001, ENTITY_SPECS.find(s => s.name === 'pipelines').ttlMs), true);
  // tags TTL = 12h = 43200000ms
  assert.equal(isStale(m.entities.tags, NOW + 43200001, ENTITY_SPECS.find(s => s.name === 'tags').ttlMs), true);
  assert.equal(isStale(m.entities.tags, NOW + 43199999, ENTITY_SPECS.find(s => s.name === 'tags').ttlMs), false);
  rmSync(dir, { recursive: true });
});

test('syncModel with only= syncs subset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'm-'));
  const fetched = [];
  const http = {
    get: async (path) => {
      fetched.push(path);
      return { code: 200, ok: true, j: { tags: [{ id: 't1', name: 'lead' }] } };
    },
  };
  const m = await syncModel({ http, loc: 'L1', dir, now: () => 1, only: ['tags'] });
  assert.ok(fetched.some(p => p.includes('/tags')));
  assert.ok(m.entities.tags.items.length >= 0);
  rmSync(dir, { recursive: true });
});
