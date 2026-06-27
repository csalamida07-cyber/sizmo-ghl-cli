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
