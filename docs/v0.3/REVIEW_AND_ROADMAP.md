# Deep architectural review — V0.2 → V0.5

**Base reviewed**: `feat/v0.2-local-first-rebuild` at `c475a0f9`; **review date**: 2026-11-03.
**Implementation track**: `feat/v0.3-m00-m02-lossless-core` is based on V0.3 RFC branch. The initial batch is **not** a finished V0.3 browser release.

## Executive decisions

1. **A JSON developer tool must not alter values on read or export.** The ordinary JS `Number` model is not an authoritative representation of raw JSON numbers. Lexemes + ordered members + source offsets are the primary data model.
2. **Strict syntax validation is distinct from tolerant editing**. Lezer/CodeMirror can offer partial editor recovery, but its recovered tree cannot silently satisfy the validity gate.
3. **The client handles standard parsing locally**. The optional Django REST service is not on the primary path; model security, rate-limits, privacy and deployment separately.
4. **The Worker owns AST and source**. UI receives bounded projections; it must not clone 100k nodes into browser React/DOM state on each parse.
5. **The “big file” goal comes after measurements**. Preserve the 2 MiB/128-depth/50k-members/100k-nodes caps in V0.3; gradually add streaming and file-backed indexing in V0.5.
6. **Version APIs before changing semantics**. V0.2 `/api/parse/` ambiguously treats any request with a string-valued `source` field as a wrapper; introduce an explicit `/api/v2/...` contract later, never silently mutate V0.2.
7. **No data-losing transformations without a warning or rejection**: JSON Schema adapters, YAML/CSV export, patches and numeric comparisons must document precision and duplicate-key limitations.

## Findings by source (confirmed by code inspection)

| Priority | Source | Issue | Response |
|---|---|---|---|
| P0 | `src/core/json.mjs` | Native `JSON.parse` creates lossy JS numbers and discards duplicate object members | V0.3 indexed lossless AST; maintain old adapter until E2E migration |
| P0 | `src/app.mjs` | Main-thread parsing / synchronous tree rendering | M03 Worker + revision semantics, M04 windowed DOM |
| P0 | `src/ui/render.mjs` | Folded descendants still allocated; 2500 cap is not virtualization | M04 lazy projection and viewport virtualizer |
| P1 | `src/app.mjs:importFile` | `file.text()` may replace bad UTF-8 silently | V0.3 fatal byte decoder; integrate in M03 |
| P1 | `server/processor/service.py` | Python duplicate-key policy differs from browser V0.2 | Shared golden contract; allow warning/strict mode in versioned API |
| P1 | `server/processor/views.py` | API `/parse/` wrapper with `source` collides with valid raw object | Explicit `/api/v2/inspect/` envelope, tests and deprecation plan |
| P1 | `server/processor/views.py` | JSON-native huge numeric literals may round in clients | Return `rawNumber` as string in v2 projections |
| P1 | `src/ui/render.mjs` | Nested table cells call `JSON.stringify` and lose numeric fidelity | M04 AST-based cell previews |
| P1 | `src/app.mjs` | `setView` can invoke synchronous parse during switching | Worker state + latest revision and worker failures |
| P1 | `.github/workflows/ci.yml` | Tests core only; no true browser automation, no quality evaluator | M05 E2E + evaluator + benchmark artifacts |
| P2 | `requirements.txt` | Floating major-range dependency versions | Pin exact build environment/lock and audit at release |
| P2 | `docs/architecture.md` | Good ADRs but no formal versioned contracts | V0.3 RFC and typed interfaces |

## V0.3 — Data semantics first, UI second

- **M00** capture previous behavior and deterministic corpus; benchmark commands in `benchmarks/v03/bench.mjs`.
- **M01** strict tokenizer, UTF-16 source mapping, structured diagnostics and input byte/token caps.
- **M02** iterative ordered AST, arbitrary numeric lexemes, duplicate-key policies, member index, RFC 6901 pointer resolution, lossless formatter and fatal UTF-8 decoder.
- **M03** Worker-only AST document owner, cancellation/terminate, request ID, revision rules, binary import. Browser UI must never turn a stale worker response into the current document.
- **M04** windowed tree/table, search/pointer navigation and accessible keyboard behavior with bounded mounted DOM.
- **M05** independent checker + Playwright E2E + fixed environment performance baselines; verify no network request from local-only commands.

### This batch delivered

M00/M01/M02 **independent ESM prototype** shipped under `packages/json-core/` with pure Node tests; 2 MiB, 128 depth, 50k member and 100k node budgets. It is intentionally **not wired into the V0.2 production UI yet**. The RFC's long-term TypeScript package boundaries are preserved; ESM/JSDoc lets this phase run on Node 22 without introducing a new build tool or lockfile prematurely. The UI must be upgraded with Worker transport before enabling it by default.

### Current limitations (do not claim otherwise)

- No incremental syntax-aware editing parser; one strict full-document parse per request.
- No Worker protocol, hard cancellation, viewport virtualization, large-file support or integrated browser E2E yet.
- Decode path can strip an UTF-8 BOM only when the caller requests that behavior; original imported bytes must be separately retained by the future document controller if exact binary roundtrip (including BOM) is required.
- Unpaired surrogate escapes are accepted as JSON syntax with interoperability warning; unpaired unescaped surrogate code units are rejected in JS source to avoid UTF-8 encoding ambiguity.
- Formatter is **lexeme-preserving pretty print**, not JCS/RFC 8785 canonical JSON.
- JSON Pointer with duplicate member names is ambiguous; use node IDs for internal UI navigation. Node IDs are stable only within one parsed revision.
- The `tokenize()` debug helper materializes tokens, but the parser consumes tokens lazily. `formatLossless()` re-tokenizes the document and currently materializes a temporary token list.
- `parseLossless()` holds AST in current thread in this batch; M03 must move ownership into Worker before UI integration.
- Import of raw JSON from server with extremely large JSON-native numbers is not lossless; new versioned API must expose text/lexemes, not numeric literals.

## V0.4 — Developer tools: preserve semantics across operations

| Feature | Design prerequisite | Non-obvious issue |
|---|---|---|
| JSON Schema (2020-12) | Typed AST adapter, schema dialect/version | Standard JS validators may coerce/drop arbitrary precision; fail-safe adapter policy required |
| JSONPath (RFC 9535) | AST navigator, selector budgets | Duplicate-key semantics and ordering must be specified, path search must be cancellable |
| JSON Diff | Ordered AST + stable source ranges | Diff should distinguish lexical vs semantic comparison and duplicate names |
| JSON Patch (RFC 6902) | Transactional source edits + precondition | Ambiguous JSON Pointer cannot target duplicate members safely |
| YAML/CSV converters | Explicit conversion contract | Type coercion, ordered members, comments, anchors, numbers may be irreversibly changed |
| Node editing/undo | ChangeSet and AST revision mapping | Mutable model and DOM state cannot diverge; edits must be atomic and validated |

A V0.4 milestone should not be called complete until operations have inverse/rollback behavior or explicit lossy-operation warnings and regression fixtures.

## V0.5 — Advanced workbench (scale + plugins)

1. First evaluate whether virtual UI + memory-indexed AST suffices for 2/5/10 MiB. Avoid raising caps without a memory budget.
2. For larger files, evaluate chunked ingestion, IndexedDB/file-backed byte ranges and sparse indexes, not merely increasing Node heap or adopting WASM by default.
3. Multi-document isolation by `documentId`, revision, per-document Worker ownership, bounded concurrency and protected shared resources.
4. Plugin SDK must have capability declarations, strict sandbox/CSP, size & CPU budgets, versioned compatibility and no default access to user input or network.
5. Benchmarks must pin environment; track P50/P95 parse, UI long tasks, scroll metrics, memory and correctness separately.
6. Production API auth and distributed throttling only if remote features are actually enabled; do not turn a private local tool into an unbounded public JSON relay.

## Non-negotiable release gate

- Golden corpus and differential tests green; original numeric lexemes and duplicate counts/order preserved.
- Resource limits enforced early and deterministically.
- Worker revision safety and cancellation tested.
- Browser E2E and accessible keyboard paths tested on real Chromium in CI.
- No unrequested backend transfer of input.
- Any optional API backward incompatibility has a versioned endpoint, documented migration and rollback.
