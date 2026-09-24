# 01 Portal Architecture And Source Of Truth

This chapter explains what this repo owns, what it consumes from elsewhere, and which runtime is responsible for which part of the docs experience.

## Big Picture

There are three distinct layers:

1. `builder-docs` is the public-facing docs site.
2. `mike-docs` is the generation pipeline plus local verification backends for API/RPC reference pages.
3. Upstream service repos and nearcore remain the contract source of truth for most OpenAPI content.

The main production experience runs through `builder-docs` and its hosted canonical `/rpcs/...` and `/apis/...` routes. The local standalone runtime is the only in-repo verification surface.

The bespoke UI styling source of truth is `builder-docs/src/css/custom.css`. `mike-docs` stylesheets remain only as verification-oriented scaffolding for the standalone local runtime.

## Ownership Boundaries

### `rpcs/`

- Per-operation RPC leaf specs live under `rpcs/<category>/`.
- The aggregate RPC spec is `rpcs/openapi.yaml`.
- Most RPC leaf files are generated from nearcore through:
  - `scripts/nearcore-operation-map.js`
  - `scripts/generate-from-nearcore.js`
- `custom` operations in the operation map can remain hand-maintained.
- Operation descriptions resolve through `resolveDescription` in `scripts/generate-from-nearcore.js`: `simple` types use the curated override in the operation map by presence, falling through to the schemars description in nearcore and then to the existing leaf YAML; `decomposed` variants and `custom` ops stay curated. `PARAM_DESCRIPTIONS` + `applyParamDescriptions` backfill parameter fields nearcore does not annotate. Full precedence rules and the upstream E2E edit recipe live in `PORTAL_WORKFLOW.md` → Description Precedence.

### `apis/`

- REST specs are vendored under `apis/<service>/`.
- They are sourced from sibling repos and split into portal-owned leaf files by `scripts/sync-external-apis.js`.
- Do not hand-edit `apis/<service>/`; the sync step overwrites vendored copies.

### `enhancements/`

- Docs-only behavior for REST APIs lives under `enhancements/<service>/manifest.yaml`.
- This is intentionally separate from OpenAPI.
- Enhancements are compiled into `shared/generatedEnhancements.ts`.

## Runtime Surfaces

### Canonical pretty routes

- Example: `/rpcs/account/view_account`, `/apis/fastnear/v1/account_full`
- File-oriented; the only route family served by the standalone runtime and the public `builder-docs` host.

### Standalone runtime

- `npm run standalone:dev` — dev server at `http://127.0.0.1:4010/<route>`
- `npm run standalone:build` — static bundle at `standalone-dist/`
- Intentionally bespoke; no third-party docs renderer.

## Current Architectural Split

All docs pages are handled by the bespoke direct-render runtime in `builder-docs`, fed by the page models generated here.

## High-Value Files

- `shared/portalAuth.ts`: canonical browser auth reader/writer logic
- `shared/FastnearOperationPage.tsx`: primary bespoke interaction + reference runtime
- `builder-docs/src/css/custom.css`: canonical bespoke UI styling
- `scripts/generate-page-models.js`: shared page-model generator
- `scripts/rpc-example-config.js`: portal-owned RPC interaction metadata — curated example params, per-network overrides, live-audit exclusions, placeholder allowlist, and archival example declarations
- `scripts/nearcore-operation-map.js`: per-operation overrides for nearcore-derived specs (descriptions, example params, schema and enum corrections)
- `scripts/standalone-common.js`: standalone dev/build runtime

## Decision Guide

- If the work changes contract truth, start with OpenAPI or nearcore generation.
- If the work changes REST request defaults without changing OpenAPI, start with `enhancements/` and the page-model generation path.
- If the work changes RPC example values, the endpoint an example runs against, or a nearcore-derived schema that is wrong, start with `scripts/rpc-example-config.js` (portal-owned) or `scripts/nearcore-operation-map.js` (contract corrections). Never hand-edit a generated file under `rpcs/`; `npm run generate-rpc` rebuilds those from scratch.
- If the work changes the blockchain-native pilot UI, start with `shared/FastnearOperationPage.tsx`.
- If the work is visual polish, spacing, sizing, or layout tuning for the public docs, start with `builder-docs/src/css/custom.css` and do not mirror that work into `mike-docs` unless a verification surface becomes unreadable.
- If the work changes the standalone verification runtime, start with `standalone/` and the standalone scripts.
