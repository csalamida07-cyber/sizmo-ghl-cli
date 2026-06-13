# Auth: PIT vs GoHighLevel MCP

Two ways to authenticate with GoHighLevel from external tooling. `sizmo` uses one; here is why, and when you might want the other.

---

## What sizmo uses: PIT (Private Integration Token)

A Private Integration Token is a scoped API credential you create inside your GoHighLevel account under **Settings → Integrations → Private Integrations**. When you create one you choose exactly which API scopes it carries. The token is a long string starting with `pit-`.

Why `sizmo` uses it:

- **Precise scope control.** You decide which scopes are granted — `sizmo` requests read-only scopes only (`contacts.readonly`, `conversations.readonly`, etc.). The token cannot do anything beyond what you explicitly allowed.
- **Deterministic.** The token is stable and usable in any headless environment — scripts, cron jobs, CI, terminal aliases. No browser, no interactive login flow, no per-session refresh.
- **Least-privilege.** A read-only PIT cannot create contacts, send messages, charge invoices, or modify workflows. If the token is ever compromised, the blast radius is limited to read access.
- **No token server required.** The CLI resolves the token from a local profile file or an environment variable. There is no OAuth callback server to run.

**PIT = more control** over what the credential can do.

---

## GoHighLevel also offers an official MCP server

GoHighLevel provides an official MCP (Model Context Protocol) server — the LeadConnector MCP server — as a sanctioned, public feature you can enable inside your GoHighLevel account. Once enabled, MCP clients (such as AI assistants like Claude) can connect to it and perform CRM operations through the MCP protocol.

Key characteristics of GHL's MCP server:

- It is OAuth-connected. Authorization goes through GoHighLevel's standard OAuth flow.
- It is designed for AI agent and LLM use cases — giving an AI assistant the ability to read and write CRM data through natural language requests.
- It exposes a broader surface area of CRM operations compared to a scoped read-only PIT.

For information on enabling GoHighLevel's MCP server, refer to [GoHighLevel's official MCP documentation](https://help.gohighlevel.com) (search for "MCP" or "Model Context Protocol" in their help center).

---

## When to use which

| | PIT (what sizmo uses) | GHL MCP server |
|---|---|---|
| **Use case** | CLI tools, shell scripts, cron jobs, precise read-only reporting | AI assistants / LLM agents that need to read or write CRM data via natural language |
| **Auth mechanism** | Static token in local profile or env var | OAuth flow |
| **Scope control** | Explicit, per-scope — grant only what you need | Managed by the MCP server and OAuth grant |
| **Headless / scriptable** | Yes — no browser required | Requires initial OAuth browser flow |
| **Write operations** | Not applicable for sizmo (read-only tool) | Yes — MCP can expose write operations |
| **Setup** | Create PIT in GHL settings, save with `sizmo config set` | Enable MCP in GHL settings, connect an MCP-capable client |

**Use a PIT** when you want a CLI tool, shell automation, or any situation where you need deterministic, headless, read-only access with explicit scope control. That is what `sizmo auth check` validates.

**Use GHL's MCP server** when you are wiring GoHighLevel into an AI assistant or agent that communicates via the MCP protocol and you want the AI to be able to interact with your CRM through natural language.

The two are not mutually exclusive — you can use `sizmo` for terminal-based reporting alongside an MCP-connected AI assistant in the same GoHighLevel location.

---

## Checking which scopes your PIT has

After setting up a profile, run:

```sh
sizmo auth check
```

This probes all six read lanes and reports which scopes are present and which are missing:

```
auth check: probing 6 GoHighLevel API scopes...
  ✅ contacts
  ✅ conversations
  ✖ opportunities — add scope opportunities.readonly
  ✅ calendars
  ✅ invoices
  ✅ payments

5/6 lanes readable — `brief` will show ⚠ on opportunities until you add: opportunities.readonly
```

Add the missing scope in your GoHighLevel Private Integration settings, then re-run `sizmo auth check` to confirm.
