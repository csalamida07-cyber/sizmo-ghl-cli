// commands/value.mjs — create OR delete a custom value on the location.
// Scope required: locations/customValues.write
// delete is SINGLE-TARGET ONLY: resolves the exact value by id, names it in the preview, and
// DELETEs that one resource — it can never bulk-delete.
import { requireConfirm } from '../lib/confirm.mjs';
import { GhlError, EXIT } from '../lib/errors.mjs';

export const meta = {
  name: 'value',
  summary: 'create or delete a custom value (delete is single-target, never bulk)',
  flags: [
    { name: '--name',  type: 'string', desc: 'custom value name (create)' },
    { name: '--value', type: 'string', desc: 'the value (create)' },
  ],
  readOnly: false,
};

const SCOPE_FIX = 'GoHighLevel → Settings → Private Integrations → edit your PIT → add locations/customValues.write scope';

export async function run(args, ctx) {
  const sub = args._?.[0];
  if (sub === 'create') return createValue(args, ctx);
  if (sub === 'delete') return deleteValue(args, ctx);
  throw new GhlError('usage: sizmo value create … | sizmo value delete <valueId>', EXIT.USAGE, 'sizmo value --help');
}

async function createValue(args, ctx) {
  const name = args.name;
  const value = args.value;
  if (!name || !name.trim()) throw new GhlError('value create requires --name "<name>"', EXIT.USAGE);
  if (value == null || value === '') throw new GhlError('value create requires --value "<value>"', EXIT.USAGE);

  const body = { name, value: String(value) };
  const preview = String(value).length > 60 ? String(value).slice(0, 60) + '…' : value;
  const changes = [`Create custom value "${name}" = "${preview}"`];
  const rerunCommand = `sizmo value create --name "${name.replace(/"/g, '\\"')}" --value "${String(value).replace(/"/g, '\\"')}" --confirm`;

  const gate = requireConfirm({ command: 'value create', changes, rerunCommand }, ctx);
  if (!gate.proceed) return gate.code;

  const r = await ctx.http.post(`/locations/${encodeURIComponent(ctx.cfg.loc)}/customValues`, body);
  if (r.code === 401 || r.code === 403) throw new GhlError(`HTTP ${r.code} — your PIT lacks locations/customValues.write`, EXIT.AUTH, SCOPE_FIX);
  if (!r.ok) throw new GhlError(`value create failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);

  const created = r.j?.customValue ?? r.j ?? {};
  const id = created.id || created._id || null;
  ctx.out.data({ status: 'ok', command: 'value create', valueId: id });
  ctx.out.line(`  custom value "${name}" created · id ${id ?? '(see response)'}`);
  return EXIT.OK;
}

async function deleteValue(args, ctx) {
  const id = args._?.[1];
  if (!id || !String(id).trim()) {
    throw new GhlError('usage: sizmo value delete <valueId> — exactly one id, never bulk', EXIT.USAGE, 'sizmo api "/locations/<loc>/customValues"  # to find the id');
  }
  const loc = ctx.cfg.loc;
  const list = await ctx.http.get(`/locations/${encodeURIComponent(loc)}/customValues`);
  if (list.code === 401 || list.code === 403) throw new GhlError(`HTTP ${list.code} — your PIT lacks locations/customValues.write`, EXIT.AUTH, SCOPE_FIX);
  if (!list.ok) throw new GhlError(`value delete: could not read custom values — HTTP ${list.code}`, EXIT.API);
  const values = list.j?.customValues ?? (Array.isArray(list.j) ? list.j : []);
  const target = values.find(v => (v.id || v._id) === id);
  if (!target) {
    throw new GhlError(`no custom value with id ${id} in this location — nothing deleted`, EXIT.NOTFOUND);
  }
  const name = target.name || '(unnamed)';

  const changes = [
    `Delete custom value "${name}" (id ${id})`,
    '  ⚠ removes THIS ONE value only — sizmo deletes a single resource by id, never in bulk',
  ];
  const rerunCommand = `sizmo value delete ${id} --confirm`;
  const gate = requireConfirm({ command: 'value delete', changes, rerunCommand }, ctx);
  if (!gate.proceed) return gate.code;

  const r = await ctx.http.delete(`/locations/${encodeURIComponent(loc)}/customValues/${encodeURIComponent(id)}`);
  if (r.code === 401 || r.code === 403) throw new GhlError(`HTTP ${r.code} — your PIT lacks locations/customValues.write`, EXIT.AUTH, SCOPE_FIX);
  if (!r.ok) throw new GhlError(`value delete failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);

  ctx.out.data({ status: 'ok', command: 'value delete', valueId: id, name });
  ctx.out.line(`  custom value "${name}" (id ${id}) deleted`);
  return EXIT.OK;
}
