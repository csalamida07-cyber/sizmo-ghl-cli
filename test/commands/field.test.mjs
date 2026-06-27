// test/commands/field.test.mjs — create custom field (confirm-gated).
import { test } from 'node:test';
import assert from 'node:assert';
import { run } from '../../commands/field.mjs';
import { makeFakeCtx } from '../_helpers.mjs';
import { EXIT } from '../../lib/errors.mjs';

const PATH = 'POST /locations/L-TEST/customFields';

test('field create: --confirm → POST customFields fires once, exit 0', async () => {
  const fixture = { [PATH]: { status: 200, j: { customField: { id: 'f-1' } } } };
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ confirmed: true, fixture });
  const code = await run({ _: ['create'], name: 'Lead Source', type: 'TEXT' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.OK);
  assert.equal(getCalledWrites().filter(w => w === PATH).length, 1);
  assert.equal(JSON.parse(getPrinted()).data.fieldId, 'f-1');
});

test('field create: no --confirm → CONFIRM (5), no write', async () => {
  const { ctx, getCalledWrites } = makeFakeCtx({ confirmed: false });
  const code = await run({ _: ['create'], name: 'Lead Source' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.CONFIRM);
  assert.equal(getCalledWrites().length, 0);
});

test('field create: unknown --type → USAGE (caught locally, no round-trip)', async () => {
  const { ctx } = makeFakeCtx({ confirmed: true });
  await assert.rejects(() => run({ _: ['create'], name: 'X', type: 'BOGUS' }, ctx), /unknown --type/i);
});

test('field create: no --name → USAGE', async () => {
  const { ctx } = makeFakeCtx({ confirmed: true });
  await assert.rejects(() => run({ _: ['create'] }, ctx), /--name/i);
});

test('field create: 403 → AUTH + customFields.write guidance', async () => {
  const fixture = { [PATH]: { status: 403, j: {} } };
  const { ctx } = makeFakeCtx({ confirmed: true, fixture });
  await assert.rejects(() => run({ _: ['create'], name: 'X' }, ctx),
    (e) => { assert.equal(e.code, EXIT.AUTH); assert.match(e.message, /customFields\.write/); return true; });
});

// ── delete (single-target, never bulk) ─────────────────────────────────────────
const LIST = 'GET /locations/L-TEST/customFields';
const listFixture = { [LIST]: { status: 200, j: { customFields: [{ id: 'f-1', name: 'Lead Source' }] } } };

test('field delete: no id → USAGE (never bulk)', async () => {
  const { ctx } = makeFakeCtx({ confirmed: true });
  await assert.rejects(() => run({ _: ['delete'] }, ctx),
    (e) => { assert.equal(e.code, EXIT.USAGE); assert.match(e.message, /one id, never bulk/i); return true; });
});

test('field delete: unknown id → NOTFOUND, no DELETE fired', async () => {
  const { ctx, getCalledWrites } = makeFakeCtx({ confirmed: true, fixture: listFixture });
  await assert.rejects(() => run({ _: ['delete', 'f-NOPE'] }, ctx),
    (e) => { assert.equal(e.code, EXIT.NOTFOUND); assert.match(e.message, /nothing deleted/i); return true; });
  assert.equal(getCalledWrites().length, 0, 'no DELETE for a non-existent id');
});

test('field delete: no --confirm → CONFIRM (5), names the exact target, no DELETE', async () => {
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ confirmed: false, fixture: listFixture });
  const code = await run({ _: ['delete', 'f-1'] }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.CONFIRM);
  assert.equal(getCalledWrites().length, 0, 'no DELETE without --confirm');
  const env = JSON.parse(getPrinted());
  assert.ok(env.data.changes.some(c => /Delete custom field "Lead Source" \(id f-1\)/.test(c)), 'preview names the exact field');
  assert.ok(env.data.changes.some(c => /never in bulk/i.test(c)), 'preview states single-target safety');
});

test('field delete: --confirm → DELETEs exactly that one resource, exit 0', async () => {
  const fixture = { ...listFixture, 'DELETE /locations/L-TEST/customFields/f-1': { status: 200, j: { succeeded: true } } };
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ confirmed: true, fixture });
  const code = await run({ _: ['delete', 'f-1'] }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.OK);
  const dels = getCalledWrites().filter(w => w.startsWith('DELETE'));
  assert.deepEqual(dels, ['DELETE /locations/L-TEST/customFields/f-1'], 'exactly the one single-resource DELETE');
  assert.equal(JSON.parse(getPrinted()).data.name, 'Lead Source');
});
