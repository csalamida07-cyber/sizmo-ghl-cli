# API Stability

From **1.0.0** onward, `sizmo` follows [Semantic Versioning](https://semver.org). The contracts
below are what you may depend on. Within a `1.x` line they will not change in a breaking way; a
breaking change to any of them means a major bump (`2.0.0`).

This exists so you can script and pipe `sizmo` (and point an agent at it) without fear that a
patch release silently moves your output from under you.

## 1. Exit codes (frozen)

| Code | Meaning |
|------|---------|
| 0 | OK |
| 1 | API error |
| 2 | Usage error (bad flag / unknown command) |
| 3 | Auth error / no location resolved |
| 4 | Not found (unknown pipeline/stage/calendar name) |
| 5 | Confirmation required — rerun with `--confirm` |

Existing codes never change meaning within `1.x`. New codes may be **added** for genuinely new
conditions (additive — a script checking `=== 0` is unaffected); each addition is documented.

## 2. JSON output — two stable contracts

Every `--json` response carries `schemaVersion` (currently `1`).

### a) Data commands → the envelope

`brief`, `snapshot`, `triage`, `pipeline`, `noshow`, `receivables`, `reconcile`, `booked-not-paid`,
`focus`, `segment`, `crm`, `sync`, `doctor` all emit:

```json
{
  "schemaVersion": 1,
  "command": "brief",
  "location": "LOC_ID",
  "data": { },
  "degraded": false,
  "warnings": [],
  "cacheAgeMs": 0
}
```

- `data` holds the command's payload. `degraded: true` + `warnings[]` mean a source was blocked
  (treat a blocked source as **unknown**, never zero).
- `--fields a,b` projects list items to those keys (every list-bearing recipe). `--concise` returns
  a leaner payload (currently `brief` only). Both are token-lean affordances for agents and are
  stable within `1.x`. `cacheAgeMs` appears when served from cache.

### b) Router verbs → per-verb objects

`auth`, `config`, and `init` are **setup/diagnostic verbs, not data queries** — so they emit a
purpose-fit object (each with `schemaVersion` + a clear success signal), not the data envelope:

| Verb | Shape (abridged) | Success signal |
|------|------------------|----------------|
| `auth check` | `{ schemaVersion, location, lanes:[{name,scope,ok,httpCode}], summary, usable }` | `usable` |
| `config list` | `{ schemaVersion, profiles:[{name,locationId,label,default,pitAgeDays}] }` | — (PIT never included) |
| `init` | `{ schemaVersion, command, profile, location, pit (masked), created, doctor, doctorExit, ok }` | `ok` |

**Why two shapes:** data commands answer "what's in my CRM" — one uniform envelope. Router verbs
answer "is my setup healthy" — their shapes are fit to that job. Both are frozen for `1.x`. (A
single unified envelope, if ever pursued, would be a deliberate `2.0` with a migration path — it
is intentionally **not** forced into this stability release.)

The authoritative, machine-readable command + flag tree is always `sizmo schema`.

## 3. schemaVersion policy

- **Additive** (a new field appears) → **no** `schemaVersion` bump. Consumers must ignore unknown
  fields.
- **Breaking** (a field is removed/renamed, a type changes, or `data`'s structure changes) →
  `schemaVersion` bumps and the change is called out in `CHANGELOG.md`. Avoided within `1.x`
  except where security requires it.

## 4. Command and flag names

Command names and documented flags are stable within `1.x`. Removing or renaming one is a major
bump; adding new commands/flags is additive.

## 5. Credential store

`~/.config/sizmo/profiles.json` — location and shape are stable, written `0600`.
`XDG_CONFIG_HOME` is respected.

## What is NOT covered by this promise

These may change in any release — do not script against them:

- **Human (non-`--json`) output** — the brief/doctor card layout, wording, colors, spacing.
- **stderr text** — warnings, error phrasing, the update-notifier message.
- **Internal `lib/` modules** — not a public import surface. The CLI (commands + `--json`) is the API.
- **The CRM-model cache file format** under `~/.config/sizmo/model/` — an implementation detail;
  read it via `sizmo crm --json`, never by parsing the file.
