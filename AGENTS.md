# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

FastNEAR docs generation and verification repo. It owns the OpenAPI sync pipeline, per-operation leaf specs, enhancement manifests, generated page models, and the local standalone verification runtime.

The consumer-facing site is [builder-docs](https://github.com/fastnear/builder-docs), which renders public API and RPC pages directly at [docs.fastnear.com](https://docs.fastnear.com).

## Common Commands

```bash
npm run standalone:dev       # Serve canonical /rpcs/... and /apis/... on http://127.0.0.1:4010
npm run standalone:build     # Static build of the standalone verification runtime
npm run check:external-openapi # Run aggregate-spec freshness checks across sibling service repos when present (called by lint)
npm run lint                 # check:external-openapi + sync:apis
npm run verify:workspace     # lint + standalone:build + 12 audits (stale-spec, page-model, structured-graph, RPC examples, 5 service-default audits, description-quality, description-drift, parameter-descriptions)
npm run smoke:operations     # Smoke test canonical pretty routes against standalone:dev (port 4010)
npm run generate-rpc         # Regenerate rpcs/*.yaml from nearcore OpenAPI spec
```

## Architecture

### Per-Operation YAML Files (`rpcs/`)

Each RPC method has its own self-contained OpenAPI YAML file under `rpcs/<category>/`. There are 40 operations across 6 categories: account, block, contract, protocol, transaction, validators.

The aggregate spec `rpcs/openapi.yaml` uses `$ref` to reference all individual operations.

### REST API Specs (`apis/`)

REST API definitions are vendored under `apis/<service>/openapi.yaml`, but owned in sibling service repos as aggregate specs. `scripts/sync-external-apis.js` reads:

- `../fn/fastnear-api-server-rs/openapi`
- `../fn/explorer-api/openapi`
- `../fn/transfers-api/openapi`
- `../fn/kv-fastdata-server/openapi`
- `../fn/neardata-server/openapi`

When those sibling repos are not available, `scripts/sync-external-apis.js` keeps the committed vendored copies in place instead of failing. When they are available, the script splits each aggregate spec into the portal-owned per-operation leaf files under `apis/<service>/`. `npm run lint` calls `scripts/check-external-openapi.js` first, which runs `cargo run --features openapi --bin generate-openapi -- --check` across the sibling service repos when the workspace is present.

### Docs Enhancement Manifests (`enhancements/`)

The docs-enhancement layer is portal-owned in this repo under `enhancements/<service>/manifest.yaml`, and `scripts/sync-external-apis.js` compiles those manifests into `shared/generatedEnhancements.ts`.

This layer is intentionally separate from OpenAPI:
- OpenAPI remains the contract truth.
- `enhancements/<service>/manifest.yaml` handles interaction-only concerns such as preset path params and network-aware defaults.

### Standalone Verification Runtime (`standalone/`, `scripts/standalone-*.js`)

The standalone runtime is a bespoke verification surface: `scripts/standalone-dev.js` serves the canonical `/rpcs/...` and `/apis/...` routes from generated page models on `http://127.0.0.1:4010`, and `scripts/standalone-build.js` emits a static bundle to `standalone-dist/`.

### URL Patterns

Operations are served at canonical pretty routes that mirror the YAML layout, for example `/rpcs/account/view_account` or `/apis/fastnear/v1/account_full`. `builder-docs` and the standalone runtime both use these canonical routes directly; there is no separate `/reference/operation/...` family anymore.

### Server Endpoints

Four RPC server URLs are configured in `rpcs/openapi.yaml`:
- `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com`
- `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com`

## The nearcore Generator Pipeline

```
nearcore/chain/jsonrpc/openapi/openapi.json    (source of truth)
    ↓
scripts/nearcore-operation-map.js              (declarative mapping)
    ↓
scripts/generate-from-nearcore.js              (generator script)
    ↓
rpcs/<category>/<operation>.yaml               (per-operation specs)
rpcs/openapi.yaml                              (aggregate spec)
```

### Key files

- **`scripts/nearcore-operation-map.js`** — Exports `OPERATIONS` array (40 entries), `LEAF_TYPE_MAP` (type simplifications), `DEPRECATED_METHODS`, `PARAM_DESCRIPTIONS`, and schema constants. Each operation entry has: `type`, `file`, `category`, `operationId`, `summary`, `description`, and type-specific fields.
- **`scripts/generate-from-nearcore.js`** — Reads the nearcore OpenAPI spec + operation map, decomposes compound endpoints (e.g., `/query` → `view_account`, `view_code`, etc.), flattens nearcore schemas to self-contained definitions, writes per-operation YAML files. Custom YAML serializer (no external deps).

### Operation types

| Type | Description | Example |
|------|-------------|---------|
| `query` | Decomposed from nearcore's `/query` by `request_type` | `view_account`, `view_code` |
| `block_variant` | Block operations by height or hash | `block_by_height`, `block_by_id` |
| `chunk_variant` | Chunk operations | `chunk_by_hash`, `chunk_by_block_shard` |
| `gas_variant` | Gas price operations | `gas_price`, `gas_price_by_block` |
| `validators_variant` | Validator operations | `validators_current`, `validators_by_epoch` |
| `simple` | 1:1 nearcore path to YAML | `tx_status`, `send_tx` |
| `custom` | Not in nearcore, hand-written | `metrics`, `latest_block` |

### Description resolution

- `resolveDescription` in `scripts/generate-from-nearcore.js` picks the operation description: `simple` types use the curated `op.description` in `scripts/nearcore-operation-map.js` by presence (override), falling through to the schemars-authored description in `../nearcore/chain/jsonrpc/openapi/openapi.json` and then to the existing leaf YAML; `decomposed` (`query`, `block_variant`, `chunk_variant`, `gas_variant`, `validators_variant`) and `custom` ops stay curated because schemars is too generic or absent.
- `PARAM_DESCRIPTIONS` + `applyParamDescriptions` backfill parameter-field descriptions nearcore does not annotate (`method_name`, `include_proof`, light-client-proof `type`) — global, request-only, applied only where the field is still empty.
- `op.fieldDescriptions.{request,response}` + `applyFieldDescriptions` are per-operation field overrides that win by presence — the only local layer that reaches a field already filled by a `LEAF_TYPE_MAP` type description, or a **response** field (`PARAM_DESCRIPTIONS` touches neither). Used to curate the `view_state` pagination fields (`after_key_base64`, `limit`, `last_key`) nearcore 2.13.0 shipped without `///` docs; delete an entry to defer back to nearcore once it annotates the field upstream.
- The generator emits `dead-override`, `gap`, and `schemars-missing` warnings so stale overrides and silent regressions surface at build time.
- Full rules and the upstream E2E edit recipe live in `PORTAL_WORKFLOW.md` → Description Precedence.

### Adding a new RPC operation

1. Add an entry to `OPERATIONS` in `scripts/nearcore-operation-map.js`
2. Run `npm run generate-rpc`
3. Review generated YAML under `rpcs/<category>/`
4. Add the corresponding MDX wrapper in `builder-docs` (see its CLAUDE.md for the `FastnearDirectOperation` pattern)

### Regenerating after nearcore changes

```bash
# Default path: ../nearcore/chain/jsonrpc/openapi/openapi.json
npm run generate-rpc

# Custom path
node scripts/generate-from-nearcore.js /path/to/openapi.json
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `rpcs/openapi.yaml` | Aggregate RPC spec (auto-generated, `$ref`s to all operations) |
| `apis/<service>/openapi.yaml` | Vendored per-service REST API specs |
| `enhancements/<service>/manifest.yaml` | Portal-owned docs enhancement manifests for preset-driven request defaults |
| `shared/generatedEnhancements.ts` | Auto-generated enhancement bundle consumed by shared helpers and the standalone runtime |
| `shared/generatedFastnearPageModels.json` | Generated page-model registry (vendored into builder-docs) |
| `shared/generatedFastnearStructuredGraph.json` | Generated structured-graph metadata (vendored into builder-docs) |
| `scripts/generate-from-nearcore.js` | nearcore → YAML generator |
| `scripts/sync-external-apis.js` | Sync sibling service specs into `apis/<service>/` |
| `scripts/nearcore-operation-map.js` | Declarative operation mapping (includes `PARAM_DESCRIPTIONS`) |
| `scripts/generate-page-models.js` | Builds the shared page-model + structured-graph artifacts; enforces the `canonicalPath` / `pageModelId` / `request.examples[].id` stability contract via `auditPageModelCompatibility` + `reconcileRequestExampleIds` |
| `scripts/standalone-{dev,build,common}.js` | Standalone verification runtime (serve, build, shared logic) |
| `scripts/test-operations.js` | Smoke test canonical pretty routes against the standalone runtime |
| `scripts/audit-description-quality.js` | R1–R8 / S / W rules for operation-level descriptions (warnings + `:strict` CI gate) |
| `scripts/audit-description-drift.js` | Enforce every `docs/api/**` and `docs/rpc/**` MDX page resolves to `UPSTREAM_DIRECT` |
| `scripts/audit-parameter-descriptions.js` | F1/F2/F3 rules for every page-model `interaction.fields[].description` |
| `INTEGRATION_GUIDE.md` | Integration reference for embedding in builder-docs |
| `PORTAL_WORKFLOW.md` | Working agreement for sync, validation, deployment, and limitations |

## Development Notes

- `custom` type operations in the operation map are not overwritten by the generator.
- Do not hand-edit `apis/<service>/`; the sync step overwrites vendored copies.
- Pushing to GitHub does not by itself describe the deploy target; if production `/apis/...` routes still 404, the deployed `builder-docs` site likely has not republished this revision yet.

### External iframe consumers

Consumers that embed hosted `docs.fastnear.com/rpcs/...` or `/apis/...` pages can receive resize messages via `postMessage` from `FastnearHostedOperationPage` in `builder-docs`.
