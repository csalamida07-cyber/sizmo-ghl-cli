// commands/field.mjs — create OR delete a custom field on the location.
// Scope required: locations/customFields.write
// NEVER fires without --confirm. delete is SINGLE-TARGET ONLY: it resolves the exact field by id,
// names it in the preview, and DELETEs that one resource — it can never bulk-delete.
import { requireConfirm } from '../lib/confirm.mjs';
import { GhlError, EXIT } from '../lib/errors.mjs';

// GHL customField dataTypes (v2). Kept as an allow-list so a typo fails locally, not after a round-trip.
const DATA_TYPES = new Set([
  'TEXT', 'LARGE_TEXT', 'NUMERICAL', 'PHONE', 'MONETORY', 'CHECKBOX',
  'SINGLE_OPTIONS', 'MULTIPLE_OPTIONS', 'DATE', 'TEXTBOX_LIST', 'FILE_UPLOAD', 'RADIO',
]);

export const meta = {
  name: 'field',
  summary: 'create or delete a custom field (delete is single-target, never bulk)',
  flags: [
    { name: '--name',  type: 'string', desc: 'field name (create)' },
    { name: '--type',  type: 'string', desc: `data type (create, default TEXT): ${[...DATA_TYPES].join(', ')}` },
    { name: '--model', type: 'string', desc: 'create: contact (default) | opportunity' },
  ],
  readOnly: false,
};

const SCOPE_FIX = 'GoHighLevel → Settings → Private Integrations → edit your PIT → add locations/customFields.write scope';

export async function run(args, ctx) {
  const sub = args._?.[0];
  if (sub === 'create') return createField(args, ctx);
  if (sub === 'delete') return deleteField(args, ctx);
  throw new GhlError('usage: sizmo field create … | sizmo field delete <fieldId>', EXIT.USAGE, 'sizmo field --help');
}

async function createField(args, ctx) {
  const name = args.name;
  if (!name || !name.trim()) throw new GhlError('field create requires --name "<name>"', EXIT.USAGE);
  const dataType = (args.type || 'TEXT').toUpperCase();
  if (!DATA_TYPES.has(dataType)) {
    throw new GhlError(`field create: unknown --type '${args.type}' — one of: ${[...DATA_TYPES].join(', ')}`, EXIT.USAGE);
  }
  const model = (args.model || 'contact').toLowerCase();
  if (model !== 'contact' && model !== 'opportunity') {
    throw new GhlError(`field create: --model must be contact or opportunity (got '${args.model}')`, EXIT.USAGE);
  }

  const body = { name, dataType, model };
  const changes = [`Create custom field "${name}" (type ${dataType}, model ${model})`];
  const rerunCommand = `sizmo field create --name "${name.replace(/"/g, '\\"')}" --type ${dataType} --model ${model} --confirm`;

  const gate = requireConfirm({ command: 'field create', changes, rerunCommand }, ctx);
  if (!gate.proceed) return gate.code;

  const r = await ctx.http.post(`/locations/${encodeURIComponent(ctx.cfg.loc)}/customFields`, body);
  if (r.code === 401 || r.code === 403) throw new GhlError(`HTTP ${r.code} — your PIT lacks locations/customFields.write`, EXIT.AUTH, SCOPE_FIX);
  if (!r.ok) throw new GhlError(`field create failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);

  const created = r.j?.customField ?? r.j ?? {};
  const id = created.id || created._id || null;
  ctx.out.data({ status: 'ok', command: 'field create', fieldId: id, dataType, model });
  ctx.out.line(`  custom field "${name}" created · id ${id ?? '(see response)'}`);
  return EXIT.OK;
}

async function deleteField(args, ctx) {
  const id = args._?.[1];
  // SAFETY 1: exactly one id, required. An empty id must never reach the API (could hit the collection).
  if (!id || !String(id).trim()) {
    throw new GhlError('usage: sizmo field delete <fieldId> — exactly one id, never bulk', EXIT.USAGE, 'sizmo crm fields  # to find the id');
  }

  // SAFETY 2: resolve the EXACT field from the live list, so the preview names what you're deleting
  // and a wrong/nonexistent id stops here (NOTFOUND) instead of touching anything.
  const loc = ctx.cfg.loc;
  const list = await ctx.http.get(`/locations/${encodeURIComponent(loc)}/customFields`);
  if (list.code === 401 || list.code === 403) throw new GhlError(`HTTP ${list.code} — your PIT lacks locations/customFields.write`, EXIT.AUTH, SCOPE_FIX);
  if (!list.ok) throw new GhlError(`field delete: could not read custom fields — HTTP ${list.code}`, EXIT.API);
  const fields = list.j?.customFields ?? (Array.isArray(list.j) ? list.j : []);
  const target = fields.find(f => (f.id || f._id) === id);
  if (!target) {
    throw new GhlError(`no custom field with id ${id} in this location — nothing deleted`, EXIT.NOTFOUND, 'sizmo crm fields  # to see valid ids');
  }
  const name = target.name || '(unnamed)';

  const changes = [
    `Delete custom field "${name}" (id ${id})`,
    '  ⚠ removes THIS ONE field only — sizmo deletes a single resource by id, never in bulk',
  ];
  const rerunCommand = `sizmo field delete ${id} --confirm`;
  const gate = requireConfirm({ command: 'field delete', changes, rerunCommand }, ctx);
  if (!gate.proceed) return gate.code;

  // SAFETY 3: single-resource endpoint with the encoded id — never the collection path.
  const r = await ctx.http.delete(`/locations/${encodeURIComponent(loc)}/customFields/${encodeURIComponent(id)}`);
  if (r.code === 401 || r.code === 403) throw new GhlError(`HTTP ${r.code} — your PIT lacks locations/customFields.write`, EXIT.AUTH, SCOPE_FIX);
  if (!r.ok) throw new GhlError(`field delete failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);

  ctx.out.data({ status: 'ok', command: 'field delete', fieldId: id, name });
  ctx.out.line(`  custom field "${name}" (id ${id}) deleted`);
  return EXIT.OK;
}
