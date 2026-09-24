# Portal Workflow

This document is the operational guide for working on the FastNEAR docs generation pipeline and the local standalone verification runtime in this repo. `builder-docs` is the public presentation runtime at `https://docs.fastnear.com`.

If you are adding a brand-new REST API service, pair this guide with [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md).

## What Lives Where

- `rpcs/` is owned here and generated from `../nearcore`.
- `apis/<service>/` is vendored here, but owned in sibling service repos:
  - `../fn/fastnear-api-server-rs/openapi`
  - `../fn/explorer-api/openapi`
  - `../fn/transfers-api/openapi`
  - `../fn/kv-fastdata-server/openapi`
  - `../fn/neardata-server/openapi`
- `enhancements/<service>/manifest.yaml` is owned here for the portal-side docs enhancement layer.
- `builder-docs` vendors generated page models from this repo and renders the public docs pages directly.

## The Normal Workflow

1. Edit the source-of-truth spec in the owning repo (`../nearcore` for RPC, `../fn/<service>/src/openapi.rs` for REST).
2. Edit `enhancements/<service>/manifest.yaml` in this repo when an operation needs portal-side preset or interaction behavior.
3. Run `npm run check:external-openapi` when the sibling service repos are available.
4. Run `npm run lint` (sync + OpenAPI validation), then `npm run standalone:build` (static verification bundle), then `npm run verify:workspace` for the full 14-step gate.
5. Smoke-test representative canonical routes with `npm run smoke:operations` (start `npm run standalone:dev` first; it serves on `http://127.0.0.1:4010`).
6. Push to `main` or onto a feature branch per the cross-repo workflow in `CLAUDE.md`.
7. For live-site impact, vendor the regenerated page models into `builder-docs` and publish there.

## Local Environment

Optional env var:

- `FASTNEAR_API_KEY=<key>` for authenticated `/metrics` checks in the RPC example audit.

## Commands

- `npm run sync:apis`
  Sync all service-owned aggregate specs into `apis/<service>/`, split them into per-operation leaf files, and rebuild the generated enhancements and page-model artifacts.
- `npm run check:external-openapi`
  Run `cargo run --features openapi --bin generate-openapi -- --check` across sibling service repos when the workspace is present.
- `npm run lint`
  Run `check:external-openapi` and `sync:apis` in sequence. OpenAPI validation is now handled by the upstream `cargo run --features openapi` check in each owning service repo.
- `npm run standalone:dev`
  Start the local standalone verification runtime on `http://127.0.0.1:4010` for canonical `/rpcs/...` and `/apis/...` pretty routes.
- `npm run standalone:build`
  Build the standalone runtime statically into `standalone-dist/`.
- `npm run refresh-examples`
  Fetch fresh chain data and update several `rpcs/*.yaml` files with current block, chunk, tx, and receipt examples. Mutates tracked files.
- `npm run verify:workspace`
  Run `lint`, `standalone:build`, and the 12 audits as a single gate: `page-model-routes`, `structured-graph`, `rpc-example-placeholders`, `rpc-examples:all`, the five service-default audits (`fastnear`, `transfers`, `kv-fastdata`, `neardata`, `transactions`), `description-quality:strict`, `description-drift`, and `parameter-descriptions:strict`.
- `npm run audit:rpc-examples`
  Run the fast curated subset of live RPC example checks.
- `npm run audit:rpc-examples:all`
  Run the full live audit for every non-mutating RPC example.
- `npm run audit:rpc-example-placeholders`
  Run the static placeholder audit so generic generator defaults like `example.near` or `ExampleCodeHash` never quietly slip back into tracked RPC examples.
- `npm run audit:fastnear-defaults`
  Run the live FastNEAR API default audit using network-aware account, token, and public-key defaults.
- `npm run audit:transfers-defaults`
  Run the live Transfers API default audit for the current mainnet-only surface.
- `npm run audit:kv-fastdata-defaults`
  Run the live KV FastData default audit using discovered contract, predecessor, and key examples when available.
- `npm run audit:neardata-defaults`
  Run the live Near Data default audit using the effective per-network load defaults.
- `npm run audit:transactions-defaults`
  Run the live Transactions API default audit using fresh block, receipt, and transaction IDs derived from recent account activity.
- `npm run audit:page-model-routes`
  Fail if the generated page-model routes diverge from the on-disk `rpcs/**` and `apis/**` leaves.
- `npm run audit:structured-graph`
  Fail if the generated structured-graph artifact drops nodes or edges that the page-model set still references.
- `npm run audit:description-quality`
  Warnings-only report against every page-model description using the R1–R8 / S / W rule set in `scripts/audit-description-quality.js`.
- `npm run audit:description-quality:report`
  Same rule set, emitted as a Markdown triage report for upstream/override/allowlist sorting.
- `npm run audit:description-quality:strict`
  Same rule set, exits non-zero on any R* failure — the CI gate.
- `npm run audit:description-drift`
  Verify every `docs/api/**` and `docs/rpc/**` MDX page in `builder-docs` resolves to `UPSTREAM_DIRECT` — no `MDX_ONLY` authored descriptions, no uncovered `UPSTREAM_ONLY` pages.
- `npm run audit:parameter-descriptions`
  Warnings-only audit of every page model's `interaction.fields[].description` using rules F1 (present), F2 (≥10 chars), F3 (not a name echo).
- `npm run audit:parameter-descriptions:strict`
  Same rules, exits non-zero on any F* failure — the CI gate.
- `npm run discover:fastnear-context`
  Print the live FastNEAR API context used for account, token, and public-key defaults.
- `npm run discover:transfers-context`
  Print the live Transfers API context currently used for the mainnet defaults.
- `npm run discover:kv-fastdata-context`
  Print the live KV FastData context used for contract, predecessor, and key defaults.
- `npm run discover:rpc-context`
  Print the live block/chunk/transaction context used to refresh volatile RPC examples.
- `npm run discover:neardata-context`
  Print the latest finalized and optimistic Near Data block context for mainnet and testnet.
- `npm run discover:transactions-context`
  Print recent Transactions API context such as the latest block height, tx hashes, and receipt ID used for load-time defaults.
- `npm run smoke:operations`
  Smoke-tests representative canonical bespoke pretty routes against the standalone runtime (defaults to port 4010).

## Description Precedence

Operation descriptions resolve as follows:

- **REST services** (`apis/<service>/...`): upstream Rust in `src/openapi.rs` of each owning service repo is the single source of truth. `scripts/generate-page-models.js` uses `operation.description || document.info?.description` when building page models — enhancement manifests do not override descriptions today.
- **RPC methods** (`rpcs/...`): `scripts/generate-from-nearcore.js` resolves descriptions in this order (see `resolveDescription`):
  - `type: 'simple'` — `op.description` in `scripts/nearcore-operation-map.js` wins by presence (curated override); otherwise the schemars-authored `paths.<nearcorePath>.post.description` from `../nearcore/chain/jsonrpc/openapi/openapi.json` is used; existing YAML is the final fallback.
  - Decomposed variants (`query`, `block_variant`, `chunk_variant`, `gas_variant`, `validators_variant`) — `op.description` only; schemars covers many variants with a single generic line, so upstream is too coarse to use.
  - `type: 'custom'` (e.g. `latest_block`, `metrics`) — `op.description` only; nearcore has no source.
- To defer a simple-type RPC description back to nearcore upstream, delete its `description` field from the operation-map entry. The generator will pick up the schemars text and warn if schemars is missing.
- The generator emits three classes of warning at the end of a run: `dead-override` (curated byte-equal to schemars), `gap` (no source produced a description), and `schemars-missing` (simple op with no upstream description — likely a nearcore regression or newly-added path).

Field-level (parameter and response) descriptions resolve on a separate axis from the operation description:

- `LEAF_TYPE_MAP` gives leaf types a concise type-level description (e.g. `StoreKey` → "Base64-encoded storage key"), so a field nearcore leaves undocumented falls back to its *type's* wire-format text rather than its role.
- `PARAM_DESCRIPTIONS` + `applyParamDescriptions` backfill **request** fields by global field name, but only where the field description is still empty.
- `op.fieldDescriptions.{request,response}` + `applyFieldDescriptions` are explicit **per-operation** overrides that win by presence. This is the only local layer that can override a leaf-type-filled field or annotate a **response** field (`PARAM_DESCRIPTIONS` reaches neither). First use: the `view_state` pagination fields (`after_key_base64`, `limit`, `last_key`) that nearcore 2.13.0 shipped without `///` docs. Delete an entry to defer back to upstream once nearcore annotates the field. Draft upstream ask: `drafts/nearcore-openapi-field-descriptions-issue.md`.

## Changing a Description Upstream (E2E Recipe)

Works for any of the 5 Rust service repos (`fastnear-api-server-rs`, `explorer-api`, `transfers-api`, `kv-fastdata-server`, `neardata-server`):

```bash
# 1. Edit the inline description string in the owning repo:
#    ../fn/<service>/src/openapi.rs

# 2. Regenerate the upstream openapi.yaml:
cd ../fn/<service> && cargo run --features openapi --bin generate-openapi

# 3. Back in mike-docs: sync and regenerate page models.
cd -
npm run sync:apis

# 4. Confirm the new text flowed through:
node -e "const m=require('./shared/generatedFastnearPageModels.json');\
 const op=m.find(x=>x.info?.operationId==='<operationId>');\
 console.log(op.info.description);"
```

The vendored copy at `../fn/builder-docs/src/data/generatedFastnearPageModels.json` is updated by the same `npm run sync:apis` run. Commit upstream and mike-docs as a coordinated pair per the feature-branch workflow in `CLAUDE.md`.

## Tracked RPC Example Follow-Ups

- `metrics` on mainnet and testnet is modeled as HTTP `GET /metrics`, not JSON-RPC.
  It requires `FASTNEAR_API_KEY` for live validation, so unauthenticated audit runs will continue to report it as a tracked skip.
- `light_client_proof` and `EXPERIMENTAL_light_client_proof` examples use `type: transaction`, matching their `transaction_hash` + `sender_id` fields (`type: receipt` would require `receipt_id` + `receiver_id`).
  Nearcore's schemars annotation states the enum more narrowly than the running node accepts, so `PARAM_ENUM_OVERRIDES` in `scripts/nearcore-operation-map.js` widens it to `[transaction, receipt]`; without that the generated schema forbids the value its own example sends. Delete that entry once nearcore widens the enum upstream.
- `view_global_contract_code` and `view_global_contract_code_by_account_id` on mainnet still need a curated account/hash pair.
  Testnet examples are verified; mainnet remains intentionally tracked until we confirm a real example that succeeds on load.
- `scripts/rpc-example-config.js` is the shared source for curated static RPC params (`CURATED_RPC_EXAMPLE_PARAMS`), manual per-network overrides (`MANUAL_RPC_EXAMPLE_OVERRIDES`), tracked follow-ups (`TRACKED_RPC_EXAMPLE_FOLLOWUPS`), live-audit exclusions (`AUDIT_SKIPS`), the allowlist of known placeholder gaps (`ALLOWED_RPC_PLACEHOLDERS`), and the per-operation archival declarations (`ARCHIVAL_EXAMPLES`) described below.
- `broadcast_tx_async`, `broadcast_tx_commit`, and `send_tx` are intentionally excluded from the live audit.
  They require a freshly signed transaction, so the automated audit keeps them out of CI and treats them as manual-only validation.

## Archival Examples

Sixteen RPC operations document a *historical lookup*: their examples pin a
specific past block, chunk, transaction, receipt, or epoch. The standard RPC
retains roughly 113,750 blocks (~29 hours) and then drops them, so those pinned
examples return `UNKNOWN_*` — or, for `tx_status`, hang for 50+ seconds rather
than erroring. They are therefore executed against `archival-rpc`.

This is declared in `ARCHIVAL_EXAMPLES` in `scripts/rpc-example-config.js`, not
in the specs. The distinction matters:

- **`servers:` is contract data.** It says where an operation lives, and every
  one of these methods is served correctly by the standard RPC for recent data.
  Leaf specs therefore declare all four endpoints, labelled `Mainnet`,
  `Testnet`, `Mainnet Archival`, `Testnet Archival` — archival as an
  *additional* endpoint, never as a replacement. Putting the archival host in
  `servers:` alone would tell SDK generators, MCP tools, and agents reading the
  spec that the method requires archival, which is false.
- **The archival requirement belongs to the example**, so it is portal-owned.
  `scripts/generate-page-models.js` applies it to `networks[].url` and adds
  additive `archival` / `archivalReason` fields, which both runtimes surface as
  a note under the endpoint. `scripts/audit-rpc-examples.js` applies the same
  declaration when resolving its endpoint, so the live audit and the docs widget
  never diverge.

To add or remove one, edit `ARCHIVAL_EXAMPLES` and regenerate the page models.
Do not touch `servers:` in a leaf spec.

## What Will Not Work

- Hand-editing `servers:` (or any other top-level key) in `rpcs/<category>/*.yaml` is not durable.
  `scripts/generate-from-nearcore.js` rebuilds each leaf spec from a fresh object literal, consulting the existing file only for `info.description`, `info.version`, the `JsonRpcResponse` schema, and the examples. Everything else is overwritten on the next `npm run generate-rpc`. Server declarations belong in `DEFAULT_SERVERS`; per-operation schema corrections belong in `scripts/nearcore-operation-map.js`.

- Hand-editing vendored files under `apis/<service>/` is not durable.
  `npm run sync:apis` and `npm run lint` overwrite them from the owning service repo.
- Hand-editing `shared/generatedEnhancements.ts` is not durable.
  Update the portal-owned manifest at `enhancements/<service>/manifest.yaml` instead.
- `npm run check:external-openapi` is workspace-aware, not standalone-repo magic.
  It expects the sibling service repos; when those are absent, it skips and the portal uses the committed vendored `apis/<service>/` trees instead.
- Pushing to GitHub does not guarantee the public site updates immediately.
  If production still returns stale pages, the missing step is a `builder-docs` publish rather than a problem in this repo.
- `npm run refresh-examples` mutates tracked RPC example values.
  `scripts/refresh-examples.js` fetches fresh chain data and updates several `rpcs/*.yaml` files with current block, chunk, tx, and receipt examples.
- `server=` is currently only a docs-enhancement hint; page models consume it but the public runtime does not expose a server-dropdown URL API.
- Near Data block-height defaults are a fallback, not the only source of truth.
  The manifest still keeps stable genesis presets, but the custom runtime now upgrades Near Data block pages to fresh finalized or optimistic heights on load when the live service responds.
- Transactions API block, receipt, and hash defaults are also upgraded at runtime.
  Stable manifest presets remain as fallbacks, but the custom runtime now prefers recent account activity so block lookups, block ranges, receipt lookups, and transaction-hash pages feel current on load.
- Transfers API is currently mainnet-only.
  The docs now audit that surface explicitly, but we should not imply testnet support until a real `transfers.test.fastnear.com`-style host exists and resolves.
- Docs-only or ingestion-only repos without a public HTTP surface are intentionally out of scope for this OpenAPI flow.

## Production Verification

When rollout changes are published correctly:

- `builder-docs` serves fresh canonical `/rpcs/...` and `/apis/...` pages.
- The local `standalone:build` artifact is fine, and
- the missing step is usually publication of the updated public site from `builder-docs`.
