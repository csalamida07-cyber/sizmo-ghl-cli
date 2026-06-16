# Maintainer notes — GHL API versions & runtime floor

Two things here rot silently if nobody watches them: the **pinned GoHighLevel API date-versions**
and the **supported Node floor**. This is the one place that documents both and how to move them.

## GoHighLevel API date-versions (the pins)

GoHighLevel versions its API by date (`Version:` header). We pin specific dates so a server-side
default change can't silently alter responses. When GHL deprecates a date-version, calls can start
failing or — worse — quietly behave differently. There is **no test that catches this** (the suite
runs against mocked HTTP), so it must be watched.

### Where the pins live (the only two places)

| File | Pin | Applies to |
|------|-----|------------|
| `lib/http.mjs` | `version = '2021-07-28'` (default for every request) | all endpoints unless overridden |
| `lib/model.mjs` → `ENTITY_SPECS` | `'2021-04-15'` on **calendars** only; `'2021-07-28'` on the rest | per-entity model sync |

`lib/model.mjs` sends a per-entity version only when it differs from the default:
`spec.version !== '2021-07-28' ? { version: spec.version } : undefined`. So today the only
non-default pin actually transmitted is calendars' `2021-04-15` (GHL's calendars endpoints have
historically lagged the newer date-version).

### Deprecation watch

- Check the GoHighLevel API changelog / developer docs periodically (and whenever live calls start
  returning unexpected `4xx`s or shapes).
- The symptom of drift is usually a `400`/`422` on a previously-working call, or a response whose
  fields moved — not always a clean error, since GHL may fall back to a newer default.

### Bumping a date-version (procedure)

1. Read the GHL changelog for the new date-version; note any field/shape changes.
2. Change the pin in the table above (one or both files).
3. Run the live smoke against a throwaway/test location (the test suite is mocked and will **not**
   catch a real API shape change): `sizmo doctor`, `sizmo sync`, `sizmo brief` against a real PIT.
4. Update any extractors in `ENTITY_SPECS` whose response shape changed.
5. `node --test` green → follow the release ritual (CHANGELOG → commit → tag → publish).

## Runtime floor (Node)

- **Floor: Node 22** (`engines.node: ">=22"`), the current Active LTS as of the 1.0 line.
- CI matrix: **22 (floor) + 24 (current)** — see `.github/workflows/ci.yml`.
- Policy: the floor tracks the lowest **non-EOL** LTS. When 22 reaches end-of-life, raise the floor
  to the next LTS in a minor release and update the CI matrix in lockstep.
- Verify EOL/LTS dates against the authoritative schedule (nodejs.org → Releases) before moving the
  floor — do not bump from memory.
- `engines` is advisory: a user below the floor gets an npm warning, not a hard failure. Raising the
  floor is therefore a soft signal, safe within a minor.
