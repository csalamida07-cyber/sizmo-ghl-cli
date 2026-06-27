// test/commands/contact.test.mjs — create-contact write command (confirm-gated).
import { test } from 'node:test';
import assert from 'node:assert';
import { run } from '../../commands/contact.mjs';
import { makeFakeCtx } from '../_helpers.mjs';
import { EXIT } from '../../lib/errors.mjs';

test('contact create: no --confirm → CONFIRM (5), no write fired', async () => {
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ confirmed: false });
  const code = await run({ _: ['create'], email: 'a@b.co', name: 'Acme Co' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.CONFIRM);
  assert.equal(getCalledWrites().length, 0, 'no write without --confirm');
  const env = JSON.parse(getPrinted());
  assert.equal(env.data.status, 'confirmation_required');
  assert.ok(env.data.changes.some(c => /Create contact/.test(c)));
  assert.ok(env.data.confirmCommand.includes('--confirm'));
});

test('contact create: --confirm → POST /contacts/ fires once, exit 0', async () => {
  const fixture = { 'POST /contacts/': { status: 200, j: { contact: { id: 'new-1' } } } };
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ confirmed: true, fixture });
  const code = await run({ _: ['create'], email: 'a@b.co' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.OK);
  const writes = getCalledWrites().filter(w => w.startsWith('POST /contacts/'));
  assert.equal(writes.length, 1, 'exactly one POST /contacts/');
  assert.equal(JSON.parse(getPrinted()).data.contactId, 'new-1');
});

test('contact create: 401 → AUTH + contacts.write guidance', async () => {
  const fixture = { 'POST /contacts/': { status: 401, j: {} } };
  const { ctx } = makeFakeCtx({ confirmed: true, fixture });
  await assert.rejects(() => run({ _: ['create'], email: 'a@b.co' }, ctx),
    (e) => { assert.equal(e.code, EXIT.AUTH); assert.match(e.message, /contacts\.write/); return true; });
});

test('contact create: --dry-run → no write, exit 0', async () => {
  const { ctx, getPrinted, getCalledWrites } = makeFakeCtx({ dryRun: true });
  const code = await run({ _: ['create'], email: 'a@b.co' }, ctx);
  ctx.out.flush();
  assert.equal(code, EXIT.OK);
  assert.equal(getCalledWrites().length, 0);
  assert.equal(JSON.parse(getPrinted()).data.status, 'dry_run');
});

test('contact create: missing subcommand → USAGE', async () => {
  const { ctx } = makeFakeCtx();
  await assert.rejects(() => run({ _: [] }, ctx), /usage/i);
});

test('contact create: no identifying field → USAGE', async () => {
  const { ctx } = makeFakeCtx({ confirmed: true });
  await assert.rejects(() => run({ _: ['create'] }, ctx), /at least one of/i);
});
