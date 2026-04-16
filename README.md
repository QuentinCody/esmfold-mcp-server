# esmfold-mcp-server

MCP server wrapping the [ESM Metagenomic Atlas](https://esmatlas.com) — Meta AI's open atlas of ~617M precomputed protein structure predictions.

## Tools (Code Mode)

- `esmfold_search(query)` — discover Atlas catalog endpoints
- `esmfold_execute(code)` — run JavaScript in a V8 isolate against the Atlas REST API via `api.get()` / `api.post()` over the catalog paths
- `esmfold_get_schema(data_access_id?)` — list/describe staged tables
- `esmfold_query_data(data_access_id, sql)` — SQL over staged Atlas data (PDB text stays as TEXT)

## Atlas-only — live folding is OUT OF SCOPE

`POST /foldSequence/v1/pdb/` (live structure prediction) is intentionally **not** routed by this server. Sequence prediction jobs take 5–60+ seconds and exceed the 30s Worker CPU budget. The catalog does not advertise it; the api-adapter returns HTTP 501 if it is requested directly.

Live folding is deferred to a future Cloudflare Workflow plan. See:

- `docs/plans/2026-04-16-life-science-expansion.md` §13.1
- `docs/adr/ADR-005-workflow-async-mcp-servers.md`

## Endpoints

- Atlas API base: `https://api.esmatlas.com`
- Atlas web: <https://esmatlas.com>

## Local dev

```bash
./scripts/dev-servers.sh esmfold   # after the server is wired into config/server-manifest.json
```
