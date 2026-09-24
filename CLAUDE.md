# CLAUDE.md

This file is the front door for repo continuity. Keep it short, high-signal, and current. Put deeper operational knowledge in `md-CLAUDE-chapters/`.

## What This Repo Is

FastNEAR docs backend and generation repo. Public docs now render in `builder-docs` at `docs.fastnear.com`; this repo owns spec sync, enhancement manifests, page-model generation, and the local verification runtimes that support the shipped experience.

The local verification surface is the standalone bespoke runtime in this repo.

## Quick Start

```bash
npm run standalone:dev        # Standalone bespoke runtime on canonical /rpcs/... and /apis/... paths
npm run standalone:build      # Static build for the standalone runtime
npm run lint                  # Workspace-aware sync (check:external-openapi + sync:apis)
npm run verify:workspace      # Broad repo verification (lint + standalone:build + 12 audits)
npm run smoke:operations      # Smoke-check representative canonical routes against standalone:dev
```

## Current State Snapshot

- The full public RPC and REST docs surface is now bespoke and direct-rendered in `builder-docs`.
- This repo remains the source of truth for:
  - RPC generation from nearcore
  - REST spec sync and leaf splitting
  - portal-owned enhancement manifests
  - generated page models vendored into `builder-docs`
  - the local standalone verification runtime
- The public canonical host is `https://docs.fastnear.com`.
- Auth precedence remains `?apiKey=` first, then `fastnear:apiKey`, with `fastnear_api_key` migrated away automatically.
- The shared runtime uses `Authorization: Bearer ...` when the page model calls for bearer transport, while preserving the public `?apiKey=` input contract.

## Ongoing Work

- Keep portal-owned interaction metadata out of the upstream contract and out of sibling service repos. REST services use `enhancements/<service>/manifest.yaml`; RPC operations use `scripts/rpc-example-config.js` (RPC cannot use enhancement manifests today — the two page-spec lists are disjoint).
- Endpoints are contract, but *which* endpoint a docs example executes against is portal-owned. Declare servers via `DEFAULT_SERVERS` in `scripts/generate-from-nearcore.js`; declare an example's archival requirement in `ARCHIVAL_EXAMPLES`. Never hand-edit `servers:` in a generated leaf spec — `npm run generate-rpc` rebuilds those files from scratch and will silently revert it.
- Prefer upstream contract-quality improvements only: descriptions, examples, enum clarity, nullable semantics, and stable `operationId`s.
- If a docs-quality improvement is common to multiple repos, prefer changing the shared OpenAPI generator once instead of hand-tuning each service repo.

## Feature Branch Workflow

- Treat `builder-docs` as the main product branch and deployment repo.
- Start in `builder-docs` when the change is user-facing only: layout, wording, navigation, theming, direct-render behavior, or native docs UX.
- Create a matching `mike-docs` branch only when the change needs generation or shared-runtime work: spec sync, enhancement manifests, page-model generation, nearcore mapping, or shared logic.
- When both repos are involved, use the same suffix in both repos, for example `codex/call-function-args-adapter`.
- Preferred order:
  1. change and validate generation/shared logic in `mike-docs`
  2. sync or vendor the generated artifacts into `builder-docs`
  3. finish the user-facing work in `builder-docs`
  4. open the `builder-docs` PR as the main PR and link the supporting `mike-docs` PR
- Keep branches single-purpose. Avoid mixing rollout, architecture cleanup, and UI polish in one branch unless they are tightly coupled.
- For live-site impact, `builder-docs` is the repo that must be deployed. `mike-docs` changes matter only after their generated outputs are brought into `builder-docs`.

## Reading Order

1. [01 Portal Architecture And Source Of Truth](md-CLAUDE-chapters/01-portal-architecture-and-source-of-truth.md)  
   What the repo owns, what is vendored, and how generation in `mike-docs` feeds the public runtime in `builder-docs`. For the RPC description-precedence rules, build-time warnings (`dead-override` / `gap` / `schemars-missing`), and the upstream E2E edit recipe, see [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md) → Description Precedence.

2. [02 Auth, URL Params, And Embed Contract](md-CLAUDE-chapters/02-auth-url-and-embed-contract.md)  
   The canonical auth precedence, localStorage keys, hosted-route query params, and the browser-vs-contract distinction for API-key transport.

3. [03 Browser Automation And Verification](md-CLAUDE-chapters/03-browser-automation-and-verification.md)  
   The working pattern for Playwright/browser-assisted validation, including auth flows, screenshots, clipboard checks, and route comparisons.

4. [06 REST Enhancements And Preset Injection](md-CLAUDE-chapters/06-rest-enhancements-and-preset-injection.md)  
   How portal-owned enhancement manifests shape REST request defaults without changing upstream OpenAPI contracts.

5. [07 Build, Publish, And Troubleshooting](md-CLAUDE-chapters/07-build-publish-and-troubleshooting.md)  
   The practical rules for lint/build, external spec sync, and "why is production still 404ing?" debugging.

## Companion Docs

- [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md): operational checklist for sync, lint, standalone build, and publication.
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md): current contract between generation in `mike-docs` and rendering in `builder-docs`.
- [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md): canonical checklist for onboarding a new REST API service into the docs stack.

## Continuity Rules

- If auth precedence, storage keys, or hosted-page query params change, update Chapter 02.
- If the preferred browser-verification workflow changes, update Chapter 03.
- If REST preset behavior changes, update Chapter 06.
- If lint/build/publish expectations change, update Chapter 07.
- If the cross-repo feature branch workflow changes, update this file and the `builder-docs` continuity docs together.
- Keep this file concise; move detail into the chapters rather than letting `CLAUDE.md` turn into a second operations manual.
