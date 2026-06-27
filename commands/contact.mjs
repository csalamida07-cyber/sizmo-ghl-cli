// commands/contact.mjs — create a contact.
// Scope required: contacts.write
// NEVER fires without --confirm. No-confirm → exit 5 (CONFIRM) + envelope.
// 401/403 → exit 3 with scope guidance. No money moves.
import { requireConfirm } from '../lib/confirm.mjs';
import { GhlError, EXIT } from '../lib/errors.mjs';

export const meta = {
  name: 'contact',
  summary: 'create a contact',
  flags: [
    { name: '--name',  type: 'string', desc: 'full name' },
    { name: '--first', type: 'string', desc: 'first name' },
    { name: '--last',  type: 'string', desc: 'last name' },
    { name: '--email', type: 'string', desc: 'email address' },
    { name: '--phone', type: 'string', desc: 'phone in E.164, e.g. +14155551234' },
    { name: '--tag',   type: 'string', desc: 'tag(s) to apply on create — comma-separated' },
  ],
  readOnly: false,
};

export async function run(args, ctx) {
  const sub = args._?.[0];
  if (sub !== 'create') {
    throw new GhlError(
      'usage: sizmo contact create [--email --phone --name --first --last --tag]',
      EXIT.USAGE, 'sizmo contact --help',
    );
  }
  const { name, first, last, email, phone } = args;
  if (!email && !phone && !name && !first && !last) {
    throw new GhlError('contact create needs at least one of --email / --phone / --name / --first / --last', EXIT.USAGE);
  }
  const tags = args.tag ? String(args.tag).split(',').map(s => s.trim()).filter(Boolean) : undefined;

  const body = {
    locationId: ctx.cfg.loc,
    ...(name  ? { name } : {}),
    ...(first ? { firstName: first } : {}),
    ...(last  ? { lastName: last } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(tags  ? { tags } : {}),
  };

  const who = [email, phone, name || [first, last].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const changes = [`Create contact: ${who || '(no identifying field)'}`, ...(tags ? [`  tags: ${tags.join(', ')}`] : [])];
  const parts = ['sizmo contact create'];
  for (const [flag, v] of [['--name', name], ['--first', first], ['--last', last], ['--email', email], ['--phone', phone], ['--tag', args.tag]]) {
    if (v) parts.push(`${flag} "${String(v).replace(/"/g, '\\"')}"`);
  }
  const rerunCommand = parts.join(' ') + ' --confirm';

  const gate = requireConfirm({ command: 'contact create', changes, rerunCommand }, ctx);
  if (!gate.proceed) return gate.code;

  const r = await ctx.http.post('/contacts/', body);
  if (r.code === 401 || r.code === 403) {
    throw new GhlError(
      `HTTP ${r.code} — your PIT lacks contacts.write — add it in GoHighLevel → Private Integrations`,
      EXIT.AUTH,
      'GoHighLevel → Settings → Private Integrations → edit your PIT → add contacts.write scope',
    );
  }
  if (!r.ok) {
    // GHL returns 400 on a duplicate (email/phone already exists) — surface the body so the user sees it.
    throw new GhlError(`contact create failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);
  }

  const created = r.j?.contact ?? r.j ?? {};
  const id = created.id || created._id || null;
  ctx.out.data({ status: 'ok', command: 'contact create', contactId: id });
  ctx.out.line(`  contact created · id ${id ?? '(see response)'}`);
  return EXIT.OK;
}
