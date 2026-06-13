# CRM model — how it works

`sizmo` keeps a local copy of your CRM's structure — pipelines + stages, calendars, tags, custom fields, users, and location info. Recipes read from this cache instead of re-fetching on every run.

## What is cached

| Entity | Endpoint | TTL | Key fields |
|--------|----------|-----|-----------|
| pipelines + stages | `GET /opportunities/pipelines` | 24h | pipeline `{id,name}`, stages `[{id,name,position}]` |
| calendars | `GET /calendars/` | 24h | `{id,name,calendarType,isActive}` |
| tags | `GET /locations/{loc}/tags` | 12h | `{id,name}` |
| customFields | `GET /locations/{loc}/customFields` | 12h | `{id,name,fieldKey,dataType}` |
| users | `GET /users/` | 24h | `{id,firstName,lastName,email}` |
| location | `GET /locations/{loc}` | 24h | `{name,timezone,currency,country}` |

Stored at `~/.config/sizmo/model/<locationId>.json`. Written atomically (temp + rename), permissions 0600.

## First run

The model is synced automatically the first time a command needs it. Nothing to do.

## Keeping the model fresh

Run `sizmo sync` after:
- Adding or renaming a pipeline stage
- Adding or removing a calendar
- Adding custom fields or tags
- Onboarding a new user

```sh
sizmo sync              # full refresh (6 single-page calls, rate-safe)
sizmo sync tags         # refresh one entity
sizmo sync customFields
```

Valid entity names: `pipelines`, `calendars`, `tags`, `customFields` (or `fields`), `users`, `location`.

## Querying the model

```sh
sizmo crm                   # overview: count + age per entity
sizmo crm pipelines         # list pipelines + stages
sizmo crm calendars         # list calendars
sizmo crm tags              # list tags (first 20)
sizmo crm tags --all        # list all tags
sizmo crm fields            # list custom fields
sizmo crm users             # list users
sizmo crm location          # timezone / currency / country

# Machine output:
sizmo crm pipelines --json  # includes _meta with source/syncedAt/ageMs/stale
```

## Honest staleness

Every model read shows the age of the data. Stale means the entity has passed its TTL (24h or 12h).

- Fresh (under TTL): no special marker
- Stale (past TTL): `⚠ STALE — run sizmo sync` banner; served anyway
- Blocked (scope missing): `✖ needs <scope>`; other entities still served

The CLI **never** auto-syncs mid-recipe when stale — it serves the cache and warns. This avoids surprise network calls and rate-limit hits. Use `sizmo sync` to force a refresh.

The `--json` output includes `_meta` so agents can branch without parsing prose:

```json
{
  "_meta": {
    "source": "cache",
    "syncedAt": 1718000000000,
    "ageMs": 3600000,
    "stale": false,
    "offline": false
  }
}
```

## Name resolution

Recipes use names (not IDs) in output when the model is available. If an ID is not found in the model (renamed stage, deleted calendar), the output shows:

```
<unknown:<id> — run sizmo sync>
```

This is the resolver's miss path. It never fabricates a name. Run `sizmo sync` to refresh the model after structural changes.

## Partial sync (missing scopes)

A 401 or 403 on one entity marks it blocked and stores what succeeded. `sizmo crm` shows blocked entities with `✖ needs <scope>`. Other entities are unaffected.

Required scopes for a full sync:

```
opportunities.readonly
calendars.readonly
locations/tags.readonly
locations/customFields.readonly
users.readonly
locations.readonly
```

## Schema versioning

The model blob has a `schemaVersion` field. A format change bumps this version and invalidates the cached file (treated as missing, triggering a re-sync on next use).
