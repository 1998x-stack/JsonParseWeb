# PRODUCT-03 — Schema Drift Explorer

**Status:** Implemented in a stacked feature branch; CI browser gates must pass before merge.
**Depends on:** Product V1 PRODUCT-01/02 PR #11 (which itself depends on V0.3 M04 PR #9).
**Scope:** user-supplied JSON object arrays and up to five extra local JSON documents; observed distributions and linked evidence only.

## The user-facing outcome

Users can inspect an object array or select related local `.json` files, click **Analyze supplied samples**, and see:

1. Field presence and missing counts over **eligible object records**, never over all JSON values.
2. Type distributions (number/string/null/boolean/object/array) with counts, including `null` distinct from missing.
3. Observations for **mixed types**, **missing fields**, **mixed null/non-null** only with at least three object records.
4. A source-linked occurrence (sample ID, UTF-16 span, line, RFC 6901 Pointer when unambiguous) for each finding. Clicking the evidence highlights either the original editor or a read-only local sample viewer.
5. An explicit caution: observations in the supplied sample are **not proof of an invalid API contract**.

The landing page additionally offers a real Schema Drift demo with 5 records.

## Core semantics and rules

File: `packages/json-core/schema-drift.mjs`.

- The engine iterates the existing lossless AST nodes and object `members`, never `JSON.parse()` or Number coercion of authoritative JSON.
- Field identity is the pair **decoded key + occurrence index**; the second duplicate field is a distinct observed column. Escaped equivalent names are still grouped as decoded names, and an ambiguous RFC 6901 pointer is `null`, not a made-up path suffix.
- Eligible records: root object = one record; root array = its *direct* object elements. Non-object values are counted as excluded, not included in denominators. Additional samples are not implicitly assumed to share an actual production schema; users explicitly select them for comparison.
- Type-variance, missing-field and null-variance are independent **informational observations** (`basis: sample_observation`, `severity: info`). They do not make a claim about the production API specification.
- A supplied sample set with fewer than 3 eligible records shows distributions only. It never emits an anomaly verdict.
- Missing examples point to the containing object (there is no missing node to point to); present examples point to actual value source spans. UTF-16 spans are validated against each original source string before any browser selection.
- The current input is immutable during inspection; new Worker analysis is invalidated by document revision; additional sample choices have a UI sequence guard; analysis-result paging checks a `runId`.

## Worker request protocol

`INSPECT_SCHEMA_DRIFT {samples?: [{id,source}]}` analyzes current valid source plus optional additional samples. It returns bounded initial metadata, up to 16 field distributions and 12 observations, with `runId`.

`GET_SCHEMA_DRIFT_PAGE {runId,kind:'fields'|'observations',offset,limit<=30}` returns bounded retained records only. Old run IDs fail with `STALE_ANALYSIS`; a changed document fails with `STALE_DOCUMENT`.

Per-session limits: **2 MiB total source text** (primary + additional), **100,000 combined AST nodes**, **50,000 combined object members**, **at most 5 additional files**, **160 retained fields**, **100 retained observations**. Counts report the full number seen; results explicitly flag truncation. Limits and preview caps are enforced in the Worker, not only in the UI.

Uploaded files are read via `file.arrayBuffer()` and the existing fatal UTF-8 decoder; invalid UTF-8 and BOM are rejected. File contents are never stored by the application, passed into URL parameters, or transferred to a backend API.

## File-level changes

| File | Purpose |
|---|---|
| `packages/json-core/schema-drift.mjs` | Pure lossless observational field analysis and evidence references |
| `packages/json-core/index.mjs` | Export schema drift function |
| `src/worker/runtime.mjs` | Two allowlisted operations, validation, hard budgets, run-id paging |
| `src/worker/client.mjs` | Add safe operation allowlist |
| `src/ui/schema-drift-panel.mjs` | Multi-file source input, local-only presentation and evidence jump |
| `src/app.mjs` | Lifecycle hooks, source invalidation, demo and i18n refresh |
| `src/product/i18n.mjs` | English and Chinese product labels and a synthetic drift fixture |
| `index.html`, `styles.css` | Discoverable but secondary Schema Drift panel and sample tile |
| `tests/v03/schema-drift.test.mjs` | Deterministic, cross-sample, duplicate-key, fuzz, paging, Worker, resource tests |
| `tests/e2e/product_v1_schema_drift_playwright.py` | Real-browser first-value, external-file, evidence, invalid UTF-8, i18n and privacy regression |
| `.github/workflows/ci.yml` | Real Chromium E2E release gate |

## Acceptance checklist

- [x] Independent core verifies exact per-field type, null and missing counts (no source Number coercion).
- [x] Escaped duplicate keys remain separate occurrences; ambiguous pointer not invented.
- [x] Multi-sample values do not replace current DocumentController AST.
- [x] Invalid additional JSON has a bounded specific error; unchanged primary document remains available.
- [x] Combined resource budgets enforced in Worker.
- [x] Randomized counts compared with an independent oracle in Node tests.
- [x] Real Node `worker_threads` request and stale invalidation checks.
- [ ] Full Chromium E2E result must come from GitHub Actions; local Chromium blocked by host administrator policy.
- [ ] User research and false-positive validation with actual sample API failures not yet performed.

## Deliberate non-goals

No inferred JSON Schema, no HTTP endpoint fetching, no background uploads, no personal analytics, no cross-record nested-object normalization, no automatic fixing, no JSONL ingest, no >2MiB promise, no V1.0 Product Hunt launch declaration. These require separately verified capability and/or privacy approval.

## Known limitations and follow-up

- Field comparisons are top-level object-record fields only. Nested paths are still navigable via existing AST Explorer, but nested schema inference is not implemented.
- Arrays of heterogeneous primitives do not contribute to field denominators; their count is shown.
- The observations report possible variance, not incompatibility. A `price:string` can be intentional; users must judge domain semantics.
- User-submitted related documents are held only in memory for the active document session; changing current JSON invalidates the evidence panel.
- The additional-sample analysis is a foreground, synchronous Worker operation; source changes terminate its Worker. It is not a background multi-document scheduler.

**Next:** PRODUCT-04 privacy-proof UI, redacted reports and user studies; PRODUCT-05 public launch readiness. CI green is necessary but not sufficient for market readiness.
