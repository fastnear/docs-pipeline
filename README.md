# FastNEAR Docs Backend

`mike-docs` is the docs backend and generation workspace for FastNEAR API and RPC docs. The public docs runtime lives in `builder-docs` at [docs.fastnear.com](https://docs.fastnear.com); this repo owns spec sync, enhancement manifests, page-model generation, and the local standalone verification runtime.

## Repository Structure

```
mike-docs/
├── rpcs/                       # Per-operation YAML files (auto-generated + hand-tuned)
│   ├── openapi.yaml            # Aggregate spec referencing all operations
│   ├── account/                # 3 operations (view_account, view_access_key, view_access_key_list)
│   ├── block/                  # 3 operations (block_by_height, block_by_id, block_effects)
│   ├── contract/               # 5 operations (call, view_code, view_state, ...)
│   ├── protocol/               # 20 operations (status, health, gas_price, genesis_config, EXPERIMENTAL_*, ...)
│   ├── transaction/            # 6 operations (tx_status, send_tx, broadcast_tx_async, ...)
│   └── validators/             # 3 operations (validators_current, validators_by_epoch, ...)
├── apis/                       # Portal-owned per-operation REST API pages, split from sibling aggregate specs
│   ├── fastnear/
│   ├── transactions/
│   ├── transfers/
│   ├── kv-fastdata/
│   └── neardata/
├── enhancements/               # Portal-owned docs enhancement manifests for request presets and overrides
│   ├── fastnear/
│   ├── kv-fastdata/
│   ├── neardata/
│   ├── transactions/
│   └── transfers/
├── shared/                     # Shared generated registries, page-models, and runtime helpers
├── standalone/                 # Local standalone verification runtime (bespoke)
├── scripts/
│   ├── check-external-openapi.js   # Workspace stale-spec check for sibling service repos
│   ├── sync-external-apis.js       # Syncs aggregate specs, splits portal leaf files, regenerates page-model artifacts
│   ├── generate-from-nearcore.js   # Generator: nearcore openapi.json → rpcs/*.yaml
│   ├── nearcore-operation-map.js   # Declarative mapping of nearcore paths → output files
│   ├── standalone-{dev,build,common}.js # Standalone verification runtime (serve, static build, shared logic)
│   └── test-operations.js          # Smoke test for canonical pretty routes
├── docs/
│   └── snapshots.md            # Validator snapshot documentation
├── .github/workflows/
│   └── portal-build.yml        # CI: sync, lint, standalone:build, upload standalone artifact
├── PORTAL_WORKFLOW.md          # How to work on, validate, and publish the docs pipeline
└── package.json                # Scripts: lint, standalone:dev, standalone:build, verify:workspace, audits
```

## Quick Start

```bash
npm install

# Serve the standalone verification runtime on http://127.0.0.1:4010
npm run standalone:dev

# Static build of the standalone runtime into standalone-dist/
npm run standalone:build

# Sync vendored REST specs (workspace stale-spec check + split)
npm run lint

# Workspace stale-spec check for sibling service repos (called by lint)
npm run check:external-openapi

# Full local validation before publish: lint + standalone:build + 12 audits
npm run verify:workspace
```

## Running Locally

### Generation and verification in this repo

```bash
npm install
npm run sync:apis
npm run lint
npm run standalone:build
npm run verify:workspace
```

### Local runtime preview

```bash
npm run standalone:dev      # http://127.0.0.1:4010
```

### Public docs UI

For the full local experience, run `builder-docs` separately:

```bash
cd /Users/mikepurvis/near/fn/builder-docs
yarn install
yarn start
```

Then open `http://localhost:3000`.

### Smoke

```bash
npm run standalone:dev       # leave running in one terminal
npm run smoke:operations     # from another terminal
```

`npm run lint` resyncs the vendored REST specs and regenerates `shared/generatedEnhancements.ts` and the page-model artifacts from the portal-owned manifests under `enhancements/<service>/manifest.yaml`. The source of truth for aggregate REST specs lives in sibling repos under `../fn/*/openapi/openapi.yaml`, not in `apis/<service>/`.

`npm run lint` calls `npm run check:external-openapi` first. In a multi-repo workspace, that executes `cargo run --features openapi --bin generate-openapi -- --check` in each converted service repo so stale aggregate specs fail before the portal syncs and splits them. In a standalone `mike-docs` checkout, the check skips missing sibling repos and falls back to the committed vendored copies under `apis/<service>/`.

Start with [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md) for the full day-to-day workflow, validation sequence, and deployment caveats in one place.

If you are onboarding another REST API service, use [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md) as the canonical rollout checklist.

## Production Validation

```bash
npm run verify:workspace
```

Important production caveat:

- this repo validates generation and the standalone verification surface; the public docs host ships from `builder-docs`.
- if `docs.fastnear.com` is stale after the local checks are green, the missing step is a `builder-docs` publish, not a `mike-docs` change.

## Docs Enhancement Layer

For pages that need more interaction polish than raw OpenAPI can provide, the portal supports a docs-enhancement layer:

- `mike-docs` owns the enhancement manifests under `enhancements/<service>/manifest.yaml`.
- `scripts/sync-external-apis.js` compiles those manifests into `shared/generatedEnhancements.ts`.
- the generated page-model runtime in `builder-docs` consumes those defaults directly for native pages.
- the standalone verification runtime in this repo reads the same artifacts.

Compatibility note:

- `canonicalPath` and `pageModelId` are treated as stable contract data for existing generated operations.
- `request.examples[].id` in generated page models is a public contract, not throwaway metadata.
- `builder-docs` uses those ids in shareable example URLs via `requestExample=<id>`.
- `scripts/generate-page-models.js` now fails if an existing canonical page disappears or changes `pageModelId`, and it preserves prior example ids across safe regenerations while failing when an old example id would be lost ambiguously or silently repurposed.

Current supported request-shaping inputs in this repo:

- `preset`: chooses a named manifest preset for the current operation.
- `network`: selects network-scoped preset values like mainnet/testnet block heights.
- `server`: forwards a server hint into the portal environment variables on canonical `/apis/...` routes.
- `body`: forwards a full request-body override as URL-encoded JSON.
- `path.<name>` / `query.<name>` / `header.<name>`: explicit override values that win over preset defaults.

Priority order is:

1. explicit URL overrides
2. selected preset values
3. manifest defaults
4. raw OpenAPI examples

Canonical `/rpcs/...` and `/apis/...` routes are the only supported public route families.

## Generating RPC Specs from nearcore

The `rpcs/` YAML files are generated from nearcore's OpenAPI spec using a two-part pipeline:

```
nearcore/chain/jsonrpc/openapi/openapi.json
    ↓
scripts/nearcore-operation-map.js    (declarative mapping: nearcore paths → output files)
    ↓
scripts/generate-from-nearcore.js    (reads map + spec, writes YAML files)
    ↓
rpcs/*.yaml                          (per-operation specs + aggregate openapi.yaml)
```

### Running the generator

```bash
# Default: reads from ../nearcore/chain/jsonrpc/openapi/openapi.json
npm run generate-rpc

# Or specify a custom path
node scripts/generate-from-nearcore.js /path/to/openapi.json
```

The generator:
- Reads the nearcore OpenAPI spec and the operation map
- Decomposes compound endpoints (e.g., `/query` → separate `view_account`, `view_code`, etc.)
- Produces self-contained per-operation YAML files under `rpcs/`
- Regenerates `rpcs/openapi.yaml` (aggregate spec with `$ref`s to all operations)
- Reports counts: created, updated, unchanged, skipped

### Adding a new RPC operation

1. Add an entry to the `OPERATIONS` array in `scripts/nearcore-operation-map.js`
2. If the operation's example must pin a historical record (a past block, chunk, tx, receipt, or epoch), add it to `ARCHIVAL_EXAMPLES` in `scripts/rpc-example-config.js` with a one-line reason. Do not point `servers:` at `archival-rpc` — that is contract data and the generator overwrites it.
3. Run `npm run generate-rpc`
4. Review the generated YAML under `rpcs/<category>/`
5. Run `npm run standalone:dev` and load the canonical route in the browser to verify the page renders correctly.

Some operations are `custom` type (not derived from nearcore), such as `metrics` and `latest_block`. These have hand-written YAML files that the generator preserves.

## Relationship with builder-docs

`builder-docs` is the public presentation runtime. This repo feeds it generated artifacts and the standalone verification runtime:

1. `mike-docs` syncs aggregate REST specs and generates per-operation leaf files.
2. `mike-docs` compiles portal-owned enhancements, page models, and structured graph metadata.
3. Generated page models are vendored into `builder-docs/src/data/generatedFastnearPageModels.json`.
4. Generated structured graph metadata is vendored into `builder-docs/src/data/generatedFastnearStructuredGraph.json`.
   Published OpenAPI documents (`shared/openapi/`: an index, one bundle per spec family, one document per operation) are vendored into `builder-docs/static/openapi/` by the same run.
5. `builder-docs` renders the root-mounted public wrapper routes natively with `FastnearDirectOperation`, including `/rpc/**`, `/api/**`, `/tx/**`, `/transfers/**`, `/neardata/**`, `/fastdata/kv/**`, `/auth/**`, and `/agents/**`.
6. `builder-docs` also generates canonical hosted `/rpcs/**` and `/apis/**` pages from the same models.
7. `builder-docs` emits centralized JSON-LD and a public `/structured-data/site-graph.json` artifact from the same shared graph.

## REST API Rollout Model

The non-RPC APIs follow the same per-operation pattern as the RPC docs, but with service-specific namespaces:

- `/apis/fastnear/...`
- `/apis/transactions/...`
- `/apis/transfers/...`
- `/apis/kv-fastdata/...`
- `/apis/neardata/...`

Each service owns its own `openapi/` directory in its own repo. This repo vendors those specs locally, splits them into canonical `/apis/...` leaf pages, and generates the shared page-model data consumed by `builder-docs`.

Canonical public docs data lives under `/apis/<service>/...`.

Do not edit the vendored copies under `apis/<service>/` by hand unless you are intentionally making a temporary experiment; the sync step overwrites them.

## URL Parameters Supported By The Page Models

| Param | Effect |
|-------|--------|
| `?apiKey=KEY` | Forwarded to the page runtime and code-sample `{{API_KEY}}` variable. Translates to `Authorization: Bearer ...` for live browser requests that require auth. |
| `?token=TOKEN` | Forwarded as `Authorization: Bearer TOKEN` and the `{{ACCESS_TOKEN}}` code-sample variable. |
| `?body=JSON` | URL-encoded JSON body; the full envelope is required (no recursive merge). |
| `?preset=`, `?network=`, `?path.*=`, `?query.*=`, `?header.*=` | Shape requests from enhancement manifests plus explicit overrides (see chapter 06). |
| `?colorSchema=dark\|light` | Used by hosted pages in `builder-docs` for embedded iframes. |

Auth resolution order:

1. API key: URL param `?apiKey=` > localStorage `fastnear:apiKey` > legacy localStorage `fastnear_api_key`.
2. Bearer token: URL param `?token=` > localStorage `fastnear:bearer`.

## URL Patterns

Operations are accessible at canonical pretty routes that mirror the YAML file layout, e.g. `/rpcs/account/view_account` and `/apis/fastnear/v1/account_full`. `builder-docs` renders the public docs pages directly from the generated page models and hosts the same canonical paths.

## Server Endpoints

All four RPC server URLs are declared by `DEFAULT_SERVERS` in `scripts/generate-from-nearcore.js`, which feeds both the aggregate `rpcs/openapi.yaml` and every generated leaf spec:
- `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com`
- `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com`

Archival is an additional endpoint, not a replacement — every method is served by the standard RPC for recent data. Operations whose *examples* pin a record older than the standard RPC's ~29 hour retention window are listed in `ARCHIVAL_EXAMPLES` in `scripts/rpc-example-config.js`; that is what points the docs widget and the live audit at `archival-rpc`. See PORTAL_WORKFLOW.md → Archival Examples.

## Testing

- `INTEGRATION_GUIDE.md` — Current contract between generation in `mike-docs` and rendering in `builder-docs`
- `npm run check:external-openapi` — Run `cargo run --features openapi --bin generate-openapi -- --check` across sibling service repos when they are present
- `npm run smoke:operations` — Smoke test representative local pretty routes

## Known Limitations

- This repo validates generation and builds the standalone verification runtime, but it does not publish the public docs site. If `docs.fastnear.com` is stale after a push, the missing step is usually a `builder-docs` deployment, not anything in the generated `mike-docs` output.
- Workspace stale-spec enforcement depends on the sibling service repos being present. In a standalone `mike-docs` checkout, `npm run check:external-openapi` skips those checks and CI validates the committed vendored `apis/<service>/` trees instead.
- `npm run refresh-examples` mutates current-chain example values in several `rpcs/*.yaml` files. Those diffs are expected.
- `scripts/rpc-example-config.js` is the shared source for curated static RPC params, manual per-network overrides, live-audit exclusions, the allowlisted placeholder follow-ups that still need real examples, and the per-operation archival declarations.
- Docs-only or ingestion-only repos without a public HTTP surface are out of scope for the OpenAPI flow.

## Other Commands

```bash
npm run check:external-openapi              # Verify sibling service specs are not stale (called by lint)
npm run lint                                # check:external-openapi + sync:apis
npm run standalone:dev                      # Serve canonical /rpcs/... and /apis/... on http://127.0.0.1:4010
npm run standalone:build                    # Static build of the standalone runtime to standalone-dist/
npm run audit:rpc-example-placeholders      # Fail if generic RPC placeholders slip back into tracked examples
npm run audit:description-quality:strict    # Fail on R1–R8 / S / W description-quality rules
npm run audit:description-drift             # Fail if docs/api/** or docs/rpc/** MDX drifts from page-model descriptions
npm run audit:parameter-descriptions:strict # Fail on F1–F3 field-level parameter-description rules
npm run verify:workspace                    # lint + standalone:build + 12 audits
npm run smoke:operations                    # Smoke test canonical pretty routes against standalone:dev (port 4010)
```
