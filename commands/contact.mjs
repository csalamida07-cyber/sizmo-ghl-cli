// commands/contact.mjs — create OR delete a contact.
// Scope required: contacts.write
// delete is SINGLE-TARGET ONLY: resolves the exact contact by id, names it in the preview, and
// DELETEs that one record — it can never bulk-delete.
import { requireConfirm } from '../lib/confirm.mjs';
import { GhlError, EXIT } from '../lib/errors.mjs';

export const meta = {
  name: 'contact',
  summary: 'create or delete a contact (delete is single-target, never bulk)',
  flags: [
    { name: '--name',  type: 'string', desc: 'full name (create)' },
    { name: '--first', type: 'string', desc: 'first name (create)' },
    { name: '--last',  type: 'string', desc: 'last name (create)' },
    { name: '--email', type: 'string', desc: 'email address (create)' },
    { name: '--phone', type: 'string', desc: 'phone in E.164, e.g. +14155551234 (create)' },
    { name: '--tag',   type: 'string', desc: 'tag(s) to apply on create — comma-separated' },
  ],
  readOnly: false,
};

const SCOPE_FIX = 'GoHighLevel → Settings → Private Integrations → edit your PIT → add contacts.write scope';

export async function run(args, ctx) {
  const sub = args._?.[0];
  if (sub === 'create') return createContact(args, ctx);
  if (sub === 'delete') return deleteContact(args, ctx);
  throw new GhlError('usage: sizmo contact create … | sizmo contact delete <contactId>', EXIT.USAGE, 'sizmo contact --help');
}

async function createContact(args, ctx) {
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
  if (r.code === 401 || r.code === 403) throw new GhlError(`HTTP ${r.code} — your PIT lacks contacts.write`, EXIT.AUTH, SCOPE_FIX);
  if (!r.ok) throw new GhlError(`contact create failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);

  const created = r.j?.contact ?? r.j ?? {};
  const id = created.id || created._id || null;
  ctx.out.data({ status: 'ok', command: 'contact create', contactId: id });
  ctx.out.line(`  contact created · id ${id ?? '(see response)'}`);
  return EXIT.OK;
}

async function deleteContact(args, ctx) {
  const id = args._?.[1];
  if (!id || !String(id).trim()) {
    throw new GhlError('usage: sizmo contact delete <contactId> — exactly one id, never bulk', EXIT.USAGE, 'sizmo segment …  # to find the id');
  }
  // SAFETY: fetch the single contact first so the preview names who you're deleting, and a wrong id
  // 404s here (nothing deleted) instead of touching anything.
  const got = await ctx.http.get(`/contacts/${encodeURIComponent(id)}`);
  if (got.code === 401 || got.code === 403) throw new GhlError(`HTTP ${got.code} — your PIT lacks contacts.write`, EXIT.AUTH, SCOPE_FIX);
  if (got.code === 404) throw new GhlError(`no contact with id ${id} — nothing deleted`, EXIT.NOTFOUND);
  if (!got.ok) throw new GhlError(`contact delete: could not read contact ${id} — HTTP ${got.code}`, EXIT.API);
  const c = got.j?.contact ?? got.j ?? {};
  const who = c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.phone || '(unnamed)';

  const changes = [
    `Delete contact "${who}" (id ${id})`,
    '  ⚠ removes THIS ONE contact only — sizmo deletes a single record by id, never in bulk',
  ];
  const rerunCommand = `sizmo contact delete ${id} --confirm`;
  const gate = requireConfirm({ command: 'contact delete', changes, rerunCommand }, ctx);
  if (!gate.proceed) return gate.code;

  const r = await ctx.http.delete(`/contacts/${encodeURIComponent(id)}`);
  if (r.code === 401 || r.code === 403) throw new GhlError(`HTTP ${r.code} — your PIT lacks contacts.write`, EXIT.AUTH, SCOPE_FIX);
  if (!r.ok) throw new GhlError(`contact delete failed — HTTP ${r.code}: ${(r.txt || '').slice(0, 200).replace(/\s+/g, ' ')}`, EXIT.API);

  ctx.out.data({ status: 'ok', command: 'contact delete', contactId: id, name: who });
  ctx.out.line(`  contact "${who}" (id ${id}) deleted`);
  return EXIT.OK;
}
