// commands/field.mjs — create a custom field on the location.
// Scope required: locations/customFields.write
// NEVER fires without --confirm. No-confirm → exit 5 (CONFIRM) + envelope.
// 401/403 → exit 3 with scope guidance. No money moves.
import { requireConfirm } from '../lib/confirm.mjs';
import { GhlError, EXIT } from '../lib/errors.mjs';

// GHL customField dataTypes (v2). Kept as an allow-list so a typo fails locally, not after a round-trip.
const DATA_TYPES = new Set([
  'TEXT', 'LARGE_TEXT', 'NUMERICAL', 'PHONE', 'MONETORY', 'CHECKBOX',
  'SINGLE_OPTIONS', 'MULTIPLE_OPTIONS', 'DATE', 'TEXTBOX_LIST', 'FILE_UPLOAD', 'RADIO',
]);

export const meta = {
  name: 'field',
  summary: 'create a custom field on the location',
  flags: [
    { name: '--name',  type: 'string', desc: 'field name (required)' },
    { name: '--type',  type: 'string', desc: `data type (default TEXT): ${[...DATA_TYPES].join(', ')}` },
    { name: '--model', type: 'string', desc: 'contact (default) | opportunity' },
  ],
  readOnly: false,
};

export async function run(args, ctx) {
  const sub = args._?.[0];
  if (sub !== 'create') {
    throw new GhlError('usage: sizmo field create --name "<name>" [--type TEXT] [--model contact]', EXIT.USAGE, 'sizmo field --help');
  }
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
  if (r.code === 401 || r.code === 403) {
    throw new GhlError(
      `HTTP ${r.code} — your PIT lacks locations/customFields.write — add it in GoHighLevel → Private Integrations`,
      EXIT.AUTH,
      'GoHighLevel → Settings → Private Integrations → edit your PIT → add locations/customFields.write scope',
    );
  }
  if (!r.ok) {
    throw new GhlError(`field create failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);
  }

  const created = r.j?.customField ?? r.j ?? {};
  const id = created.id || created._id || null;
  ctx.out.data({ status: 'ok', command: 'field create', fieldId: id, dataType, model });
  ctx.out.line(`  custom field "${name}" created · id ${id ?? '(see response)'}`);
  return EXIT.OK;
}
