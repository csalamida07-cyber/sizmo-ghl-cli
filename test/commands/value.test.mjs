// test/commands/value.test.mjs — create custom value (confirm-gated).
import { test } from 'node:test';
import assert from 'node:assert';
import { run } from '../../commands/value.mjs';
import { makeFakeCtx } from '../_helpers.mjs';
import { EXIT } from '../../lib/errors.mjs';

const PATH = 'POST /locations/L-TEST/customValues';

test('value create: --confirm → POST customValues fires once, exit 0', async () => {
  const fixture = { [PATH]: { status: 200, j: { customValue: { id: 'v-1' } } } };
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ confirmed: true, fixture });
  const code = await run({ _: ['create'], name: 'Booking Link', value: 'https://cal.me/x' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.OK);
  assert.equal(getCalledWrites().filter(w => w === PATH).length, 1);
  assert.equal(JSON.parse(getPrinted()).data.valueId, 'v-1');
});

test('value create: no --confirm → CONFIRM (5), no write', async () => {
  const { ctx, getCalledWrites } = makeFakeCtx({ confirmed: false });
  const code = await run({ _: ['create'], name: 'X', value: 'y' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.CONFIRM);
  assert.equal(getCalledWrites().length, 0);
});

test('value create: missing --value → USAGE', async () => {
  const { ctx } = makeFakeCtx({ confirmed: true });
  await assert.rejects(() => run({ _: ['create'], name: 'X' }, ctx), /--value/i);
});

test('value create: missing --name → USAGE', async () => {
  const { ctx } = makeFakeCtx({ confirmed: true });
  await assert.rejects(() => run({ _: ['create'], value: 'y' }, ctx), /--name/i);
});

test('value create: 401 → AUTH + customValues.write guidance', async () => {
  const fixture = { [PATH]: { status: 401, j: {} } };
  const { ctx } = makeFakeCtx({ confirmed: true, fixture });
  await assert.rejects(() => run({ _: ['create'], name: 'X', value: 'y' }, ctx),
    (e) => { assert.equal(e.code, EXIT.AUTH); assert.match(e.message, /customValues\.write/); return true; });
});
