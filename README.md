# esmfold-mcp-server

MCP server wrapping the [ESM Metagenomic Atlas](https://esmatlas.com) — Meta AI's open atlas of precomputed protein structure predictions.

## Tools (Code Mode)

- `esmfold_search(query)` — discover Atlas catalog endpoints
- `esmfold_execute(code)` — run JavaScript in a V8 isolate against the Atlas REST API via `api.get()` over the catalog paths
- `esmfold_get_schema(data_access_id?)` — list/describe staged tables
- `esmfold_query_data(data_access_id, sql)` — SQL over staged Atlas data (PDB text stays as TEXT)

Each tool also has its `mcp_esmfold_*` alias. Successes and errors carry both MCP
fields and a citation. Complete responses above the shared 30KiB threshold stage
with `_staging`; this also covers large SQL/schema results and composed outputs.
The `payloads` table retains the complete response for recovery and hash checks.

## Atlas-only — live folding is OUT OF SCOPE

`POST /foldSequence/v1/pdb/` (live structure prediction) is intentionally **not** routed by this server. Sequence prediction jobs take 5–60+ seconds and exceed the 30s Worker CPU budget. The catalog does not advertise it; the api-adapter returns HTTP 501 if it is requested directly.

Live folding is deferred to a future Cloudflare Workflow plan. See:

- `docs/plans/2026-04-16-life-science-expansion.md` §13.1
- `docs/adr/ADR-005-workflow-async-mcp-servers.md`

## Endpoints

`/atlas/sequence/{atlas_id}` and `/atlas/search` derive summaries from PDB text. They are not
native Atlas metadata records: the sequence can omit unmodeled residues, the model label comes
from TITLE, and `plddt_mean` is an atom B-factor average on the supplied scale. `/atlas/about`
returns raw page HTML, not parsed release fields.

Reads require GET without a body and only the documented parameters. MGYP IDs
must be a single accession. Reads have a 30-second deadline covering headers and
body, an 8MiB byte limit, strict UTF-8 decoding, and no redirect following. HTTP
errors retain their bounded native body and source hash; partial responses and
HTML/JSON masquerading as a PDB fail explicitly. Returned PDB text preserves
decoded source bytes, including a UTF-8 BOM, with a byte count and SHA-256. These
checks establish response integrity, not a historical snapshot or sequence identity.

`/atlas/bulk/manifest` reads the provider's documented URL lists, preserving the selected
release, selection, artifact type, complete manifest text, source-byte SHA-256 and ETag.
Manifest reads have a separate 1MB limit. Each row is a file,
not a protein; Foldseek companion files are retained. Select `v0` or `v2023_02`, `full` or
`highquality_clust30`, and `structures`, `foldseek` or `embeddings`. The clustered high-confidence
selection supports v0 structures/Foldseek only. These documented archives do not establish a
new 2026 release. Provider background and bulk metadata links are in the
[Atlas documentation](https://github.com/facebookresearch/esm/blob/main/scripts/atlas/README.md).

```js
return await api.get('/atlas/bulk/manifest', {
  release: 'v2023_02', selection: 'full', artifact: 'foldseek'
});
```

Large manifests stage as table `data`; use the returned `data_access_id` with `esmfold_query_data`:
`SELECT release, artifact, COUNT(*) AS files FROM data GROUP BY release, artifact`.
Completeness refers to manifest rows, not successful artifact downloads or database coverage.
Download the chosen files externally and retain their checksums. Foldseek needs its companion
files and a separate search runtime; embedding archives are precomputed vectors, not a live
embedding endpoint. The Worker does not download these binaries or execute either workload.

For release-specific bulk FASTA and a UHGP exact-sequence join, see the
[local workflow](../../docs/workflows/mgnify-atlas-sequence-join.md). It preserves separate
UHGP/Atlas identifiers and input hashes; unmatched sampled records do not establish absence
from Atlas. Foldseek databases and embeddings remain separate local compute artifacts.

- Atlas API base: `https://api.esmatlas.com`
- Atlas web: <https://esmatlas.com>

## Local dev

```bash
./scripts/dev-servers.sh esmfold
```

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from ESM Metagenomic Atlas and stays under the terms of that source: CC BY 4.0.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
