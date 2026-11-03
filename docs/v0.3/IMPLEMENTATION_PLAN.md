# JsonParseWeb V0.3 — Executable implementation plan

**Status:** Implementation plan only. The V0.3 parser/virtualization code is **not** implemented in this docs-only branch.
**Base branch:** `feat/v0.2-local-first-rebuild`. Scope excludes legacy `main` until V0.2 PR #1 is merged.

## A. Delivery strategy and module order

Only advance to the next module when the current module has code + golden tests + independent checks + GitHub commit + reviewable diff.

| Milestone | Scope | Files / outputs | Blocking gate |
|---|---|---|---|
| M00 | Freeze V0.2 and establish behavior fixtures | `tests/fixtures/v02/*`, baseline script, `docs/v0.3/BASELINE.md` | Existing 19 JS tests and Django/pytest CI pass; known differences recorded |
| M01 | Strict tokenizer and source maps | `packages/json-core/src/{tokenizer,source-map,diagnostics}.ts` | JSON grammar/offset/UTF-8/BOM corpus pass |
| M02 | Lossless AST and number semantics | `{parser,ast,number,statistics,pointer}.ts` | Lossless round-trip + duplicate-key + bounded-depth/property counts pass |
| M03 | Formatter, query and Worker protocol | `{formatter,projection}.ts`, `src/worker/*` | Format idempotence; latest-revision wins; hard cancellation test |
| M04 | Virtualized tree, raw/table integration | `src/views/tree/*`, `src/app/*` | Browser E2E navigation and DOM-row cap pass |
| M05 | Independent release validation and docs | `tests/{contract,browser,benchmark}/*`, CI and version docs | Reproducible build, security + performance report, rollout/rollback instructions |

Suggested **PRs**: PR-A M00+M01; PR-B M02; PR-C M03; PR-D M04; PR-E M05. All target the same V0.3 integration branch and are merged sequentially; no parallel edits to shared parser files. The doc branch can be reviewed separately.

## B. M00 — Baselines and prerequisites

### Tasks
- Preserve V0.2 test report and `ci.yml` status in baseline doc with commit SHA.
- Capture real `JSON.parse` semantics for root scalar values, duplicate keys, large integers, string escapes and object member order.
- Generate deterministic datasets with fixed seeds and expected node counts; do not check in large binary blobs.
- Decide package manager and TypeScript build pipeline; keep `npm ci` reproducible with a lockfile. Migrate progressively from ES Modules to TypeScript with compatibility adapters.
- Add a benchmark harness that logs environment details (runtime, browser build, CPU model if available) without user data.
- Record UI behavior for parse/clear/import/export/view switching as golden E2E expectations.

### Gate
- No V0.2 behavior accidentally removed except documented precision/duplicate-key improvements.
- Baseline metrics are recorded, not guessed.

## C. M01 — Lexer/source diagnostics

### Interface
```ts
export interface Token {type: TokenKind; span: Span}
export function tokenize(source: string, policy: LexPolicy): Iterable<Token>
export function sourceLocation(sourceMap: LineIndex, utf16Offset: number):
  {line: number; column: number}
```

### Work items
- UTF-16 range invariants and newline index; binary search for line/column.
- Finite-state string scanning with escaped slash, quote, backslash, control escapes and Unicode `\\uXXXX`.
- Numeric scanner verifies leading zero, fraction, exponent sign/digits; never calls JS Number to classify token grammar.
- CRLF handling and Unicode astral characters tested for source positions.
- Strict rejection: comments, trailing commas, single quotes, NaN, Infinity, extra tokens after root.
- Bounded error messages; never echo complete user source in diagnostics.

### Gate
- Differential syntax acceptance against `JSON.parse` where relevant, with explicit exceptions for interoperability warnings and configured resource caps.
- Golden token spans reconstruct original non-whitespace token sequence.

## D. M02 — AST, lossless numbers and pointer

### Work items
- Iterative parser frames; container-start/container-end validation without recursive stack overflow.
- Preserve source order and duplicate members through ordered MemberRecords.
- Decode key escapes before duplicate detection; `{"a":1,"\\u0061":2}` => duplicate.
- Ensure string `"__proto__"` has no prototype side-effects.
- Do not convert raw numbers into floating-point values during parse, tree or output.
- Store fixed-size node records; lazy long-string decode; numeric raw source slices.
- O(N) statistics with counters for type, depth, keys and nodes, including duplicate members.
- RFC 6901 escaping (`~` → `~0`, `/` → `~1`); ambiguous duplicate-key paths return an explicit error.

### Gate
- `-0`, `1.00`, `1e+9999`, `1e-9999`, `9007199254740993` retained exactly.
- 100k nodes/depth 128/key 50k limits reject deterministically **during** parse.
- Schema-free numeric comparison: expose `rawNumber`; no coerced numeric equality assumption.

## E. M03 — Formatter + Worker

### Formatter
- Stable indentation settings (2/4 spaces or tab).
- Reconstruct output only from authoritative token records and structural whitespace.
- Preserve token lexemes and duplicate member occurrences.
- Idempotence and reparse structural equality mandatory.

### Worker
- Worker holds `DocHandle` and AST, main receives only bounded summaries.
- Request IDs monotonic; each reply includes document ID and revision.
- Drop stale replies deterministically.
- Prevent request queue inflation: at most one active parse and latest pending parse.
- If old worker is busy, hard-cancel via terminate/restart; benchmark restart overhead.
- File input uses fatal UTF-8 decode, then parser; no backend calls.
- Worker crash, timeout, oversize response and reinitialization have explicit UI states.

### Gate
- 100 rapid edits cannot show output from an older revision.
- Force-stop during heavy parsing produces no stale UI update.
- Worker message size remains bounded except intentional source payload or file buffer.

## F. M04 — Tree and table

### UI behavior
- Tree row: disclosure, key/index, kind, short text, optional pointer, diagnostic indicators.
- Expansion cache keyed by (document revision, node ID), reset on new revision.
- Scroll virtualizer creates at most 400 DOM treeitems even with 100k expanded AST nodes.
- A user opening a node with thousands of descendants initially requests only one viewport/child page.
- Tab/focus and ARIA: keyboard up/down, left/right, Home/End and expand/collapse, `aria-level`, `aria-expanded`, `role=tree`/`treeitem`.
- Raw source slice and full-value preview are read from Worker on demand.
- Path navigation works with special keys `/a~1b`, `/m~0n`, empty-string key `/`.
- Table supports array of objects/primitives through virtual rows; nested values display safe previews.
- Never render untrusted data with `innerHTML`, including diagnostic messages and copied-path notifications.

### Gate
- UI remains responsive on 100k-node fixture under 2 MiB cap.
- Tree selection and pointer navigation match source spans.
- Frontend smoke E2E runs in CI on Chromium/Playwright, **not merely present as an HTML smoke page**.
- User-visible basic actions remain accessible without mouse.

## G. M05 — Quality, security and release

### CI jobs (mandatory)
1. `lint-typecheck`: formatter + static lint + TS strict typecheck.
2. `unit`: lexer/parser/AST/formatter/pointer/worker-client tests.
3. `backend`: existing Django checks + pytest contract.
4. `browser-e2e`: Playwright launches actual static frontend via local HTTP server.
5. `independent-evaluator`: compare snapshots, parse results, error severity, numeric lexemes and known regressions; report failure diff.
6. `bench`: dedicated, pinned reference runner (or nightly, with non-flaky budget); fail release on correctness/resource bounds, not noisy timing alone.
7. `security`: dependency audit and selected oversized/malformed malicious JSON probes.

### Metrics
```json
{
  "case": "object-array-100k-nodes",
  "inputBytes": 1900000,
  "nodes": 100000,
  "parseMsP50": null,
  "parseMsP95": null,
  "uiLongTaskMsMax": null,
  "peakHeapMiB": null,
  "renderedTreeItemsMax": null,
  "browserVersion": null,
  "runner": null
}
```
These are fields to **measure**, not claimed performance results.

### Explicit release gate
- 100% golden correctness and source-token fidelity.
- All backend/browser/worker integration checks green.
- Memory, task latency and scroll traces captured against a stable reference environment.
- No selected security regression and no accidental network requests on local parser path.
- Same document input generates the same results across supported browsers except documented editor rendering differences.
- Maintained rollback switch for V0.2 parser/render paths.

## H. Risks and response

| Risk | Response |
| --- | --- |
| Custom parser misreads edge-case JSON grammar | Differential syntax corpus vs native parser + RFC 8259 golden vectors + fuzz testing |
| Duplicate keys break ordinary JSON Pointer | Node ID + occurrence index for ambiguous members; pointer only when unambiguous |
| Exact decimal lexemes differ from semantic numeric equality | Raw lexical fidelity is authoritative; numeric calculations are opt-in |
| AST allocation too heavy at 100k nodes | Memory-profile fixed-size node records, source slices, lazy decoding and projection |
| Main thread blocked by structured clone | Worker retains AST, only bounded projections cross boundary; transfer file buffers |
| Sync Worker ignores cancel messages | Terminate/recreate or implement cooperative yielding; test hard cancel |
| V0.2 Django API returns precision-losing numbers to browser | Keep v1 contract; design optional v2 with raw string numeric projections |
| Virtual tree loses keyboard focus | Roving tabindex, stable row anchor and ARIA E2E |
| Format reorders or destroys duplicate members | Formatter emits ordered AST member list rather than object keys |
| Runtime library change raises bundle size | Record dependency + compressed bundle delta, pin versions and audit |

## I. GitHub operating rules

- Branch each feature from latest V0.3 integration branch, never from stale main while V0.2 PR #1 is open.
- One task / one owned module / one PR; tests and docs included in same PR.
- Do not publish performance or E2E success unless a real command/log supports it.
- All compatibility-breaking changes carry a migration note and golden fixture.
- Do not merge architecture-only commits as if V0.3 features were implemented.
