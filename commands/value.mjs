// commands/value.mjs — create a custom value on the location.
// Scope required: locations/customValues.write
// NEVER fires without --confirm. No-confirm → exit 5 (CONFIRM) + envelope.
// 401/403 → exit 3 with scope guidance. No money moves.
import { requireConfirm } from '../lib/confirm.mjs';
import { GhlError, EXIT } from '../lib/errors.mjs';

export const meta = {
  name: 'value',
  summary: 'create a custom value on the location',
  flags: [
    { name: '--name',  type: 'string', desc: 'custom value name (required)' },
    { name: '--value', type: 'string', desc: 'the value (required)' },
  ],
  readOnly: false,
};

export async function run(args, ctx) {
  const sub = args._?.[0];
  if (sub !== 'create') {
    throw new GhlError('usage: sizmo value create --name "<name>" --value "<value>"', EXIT.USAGE, 'sizmo value --help');
  }
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
  if (r.code === 401 || r.code === 403) {
    throw new GhlError(
      `HTTP ${r.code} — your PIT lacks locations/customValues.write — add it in GoHighLevel → Private Integrations`,
      EXIT.AUTH,
      'GoHighLevel → Settings → Private Integrations → edit your PIT → add locations/customValues.write scope',
    );
  }
  if (!r.ok) {
    throw new GhlError(`value create failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);
  }

  const created = r.j?.customValue ?? r.j ?? {};
  const id = created.id || created._id || null;
  ctx.out.data({ status: 'ok', command: 'value create', valueId: id });
  ctx.out.line(`  custom value "${name}" created · id ${id ?? '(see response)'}`);
  return EXIT.OK;
}
