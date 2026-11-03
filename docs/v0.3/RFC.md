# JsonParseWeb V0.3 — Lossless JSON Core & Advanced Visualization

- **Status:** Proposed implementation RFC, not delivered code
- **Base:** `feat/v0.2-local-first-rebuild` at `c475a0f9ef9c934078f2210a3d67ab5c7f015e5f`
- **Owner/track:** Core parser → Worker transport → virtual tree → diagnostics/search → integration
- **Mission:** Browser-local first, token-preserving inspection and formatting, bounded resource consumption, responsive large-tree exploration

## 1. What is wrong with V0.2, concretely?

| Current file/function | Observed | Impact |
| --- | --- | --- |
| `src/core/json.mjs:parseDocument` | `JSON.parse` produces native JS numbers/objects | Numeric precision and duplicate members are no longer recoverable from the object |
| `inspectNumbers` | Detects unsafe integer substrings only | Arbitrary decimal/exponent spelling not preserved in semantic view |
| `prettyPrint` | Calls `JSON.stringify`; blocks unsafe integers | Formatting cannot be both general and lossless |
| `src/ui/render.mjs:renderTree` | Recursive DOM creation until node cap; folded groups still allocate descendants | Not actual viewport virtualization |
| `src/app.mjs:analyze` | Synchronous parsing + stats + rendering on main thread | Long frames and blocking interaction |
| `server/processor/service.py` | Rejects duplicate keys, maps floats to Python float | Different acceptance/fidelity policy from browser |
| `server/processor/views.py` | JSON-native API response | Large numeric tokens may round in downstream JavaScript clients |

### Non-negotiable invariants

1. **Lexical fidelity:** For each token, its raw characters and half-open UTF-16 span can be recovered from the unchanged source. Long integers, `-0`, `1.00`, `1e+9999`, escaped strings retain their original spelling.
2. **Structural fidelity:** Object members retain original order, *including duplicate names*. The parser never silently deletes or rewrites a member.
3. **No implicit network:** All browser operations remain local by default; no telemetry, storage or uploads without an explicit user action.
4. **Safe rendering:** The UI inserts data via text nodes/textContent, never user-provided HTML.
5. **Bounded resources:** Parse, flatten, projection and file-import paths all enforce budgets. Worker cancellation is hard-stop capable.
6. **No stale rendering:** Response revision must exactly match the active document revision.
7. **Separation:** Strict validator is authoritative. Error-recovering editor parser is advisory only and must never turn invalid source into `valid`.

## 2. Scope / non-scope

**In V0.3:** Strict RFC 8259 lexer/parser; SourceSpan-backed AST; lossless numbers; duplicate-key diagnostics; JSON Pointer for unambiguous paths; source-position diagnostics; lossless whitespace formatter; Worker-owned parsing and indexed child projection; viewport-virtualized tree; numeric/boolean/null/table previews; staged browser E2E, differential and performance tests.

**Deferred:** Full schema validation, JSONPath language, multi-file diff, editing AST transformations / undo-redo, huge-file streaming over tens of megabytes, WASM engine, server-side user storage, collaborative sync, remote API tester, full editor IDE.

## 3. Proposed layered architecture

```text
apps/web/
  src/app/                 # controller, document revisions, toolbar commands
  src/editor/              # optional CodeMirror/Lezer integration; not authoritative
  src/worker/parser.worker.ts
  src/worker/client.ts
  src/views/tree/          # virtualized rows, disclosure, navigation
  src/views/raw/
  src/views/table/
packages/json-core/src/
  tokenizer.ts             # strict scanner, UTF-16 source spans
  parser.ts                # iterative frames, ordered members, bounds
  ast.ts                   # normalized records, parent/child index
  diagnostics.ts           # codes, location and duplicate names
  source-map.ts            # line-offset binary search
  number.ts                # raw lexemes, opt-in safe conversions
  statistics.ts            # single-pass AST metrics
  pointer.ts               # RFC 6901 unique-path projection
  formatter.ts             # token-preserving whitespace-only rewrite
  projection.ts            # windowed tree projection from expanded node IDs
  index.ts                 # public typed API
services/api/              # retain opt-in Django from V0.2
tests/{fixtures,unit,contract,browser,benchmark}/
```

Keep `src/core/json.mjs` as a compatibility adapter for one transition release. Keep `src/app.mjs` UI behavior until feature-flagged paths pass regression. Do not rewrite Django as part of parser migration.

## 4. Data model and contracts

All ranges are **UTF-16 code-unit offsets**, half-open `[start,end)`, matching JavaScript string slicing and editor positions. Byte length is separately measured for transport/input caps.

```ts
type JsonKind = 'object'|'array'|'string'|'number'|'boolean'|'null';
type NodeId = number;
type Span = Readonly<{start: number; end: number}>;

type MemberRecord = Readonly<{
  key: string;               // decoded key, including escaped-equivalent normalization
  rawKeySpan: Span;          // exact quoted key token in source
  valueNodeId: NodeId;
  occurrence: number;        // 0-based occurrence among same decoded key in object
}>;

type JsonNode = Readonly<{
  id: NodeId;
  kind: JsonKind;
  span: Span;                // excludes outer trivia; includes quotes for strings
  parentId: NodeId | null;
  depth: number;             // root = 1, consistent with v0.2
  childIds?: readonly NodeId[];
  memberIds?: readonly number[];    // ordered MemberRecord table indices
  rawNumber?: string;        // ALWAYS present on number nodes
  decodedScalar?: string | boolean | null; // lazily computed for large strings
}>;

type Diagnostic = Readonly<{
  code: 'SYNTAX_ERROR'|'DUPLICATE_KEY'|'DEPTH_LIMIT'|'NODE_LIMIT'|
        'KEY_LIMIT'|'SIZE_LIMIT'|'INVALID_UTF8'|'UNICODE_WARNING'|'BOM_WARNING';
  severity: 'error'|'warning';
  message: string;
  span: Span;
  path?: string;             // only when unique
  nodeId?: NodeId;
}>;

type ParsedDocument = {
  revision: number;
  validSyntax: boolean;
  rootId: NodeId | null;
  diagnostics: readonly Diagnostic[];
  stats?: JsonStats;
  // Worker owns source and AST; UI receives summaries and windowed projections.
};
```

**Identity and duplicate names:** `NodeId` is unique within one document revision, not across revisions. RFC 6901 JSON Pointer can be emitted only for paths with no ambiguous object-member lookup; for duplicate names use `{nodeId, occurrence}` within the current revision. Do not append proprietary `#2` suffixes and call them JSON Pointers.

**Source and decoded values:** Object member key equality uses decoded key contents (e.g. `"a"` and `"\\u0061"` compare equal). String raw spans are never replaced with their decoded values in the original source. `"__proto__"` is a normal key in the member table, not an object-prototype assignment.

### Parse API

```ts
parseLossless(source: string, policy?: ParsePolicy): ParseResult
getNode(doc: DocHandle, id: NodeId): NodeProjection
getChildren(doc: DocHandle, id: NodeId, offset: number, limit: number): Page<NodeProjection>
getSourceSlice(doc: DocHandle, id: NodeId): string
formatLossless(doc: DocHandle, options: {indent: number | '\\t'}): string
resolvePointer(doc: DocHandle, pointer: string): NodeId | PointerError
getStatistics(doc: DocHandle): JsonStats
```

The parser's result must not expose ordinary JS `number` as authoritative JSON numeric values. An explicit `toNumberIfSafe(raw)` helper may return a checked value. `BigInt` conversion is optional and only for integral raw tokens; decimals/exponents retain raw lexeme semantics.

## 5. Tokenizer/parser algorithm

1. Read source with UTF-16 position; validate input byte cap *before* expensive allocations. JSON whitespace is only SP / TAB / LF / CR.
2. Scan punctuation, string/escape, number grammar, literals and token spans. Explicitly reject unescaped controls, trailing comma, unquoted keys, comments, NaN, Infinity, invalid number grammar and junk after root.
3. Use an **iterative state machine** (object expecting key/colon/value/comma/end; array expecting value/comma/end) and explicit stack frames. Limit nesting *during parse*, not only after materializing AST.
4. Store object members as an ordered list and maintain per-object decoded-key occurrence counts. Duplicate key yields a diagnostic with key-token span; severity defaults to warning; strict policy may elevate to error without discarding AST.
5. Build parent/child node index and accumulate counters in one pass. Do not eager-build a full string JSON Pointer for every node; derive on demand from parent links.
6. On syntax failure, expose exact offending span and location, with a bounded diagnostic count. Do not publish a partially built AST as a `validSyntax=true` document.

**Numbers:** Strict grammar is `-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?`. Do not invoke `Number` to decide lexical validity. Treat `1e9999`, `1e-9999`, `1.0000000000000000000001` as syntactically valid numeric tokens even though they cannot be faithfully represented as JS Number. Enforce maximum token length to limit resource use.

**Unicode and import:** `TextDecoder('utf-8', {fatal:true})` on imported file bytes; reject malformed UTF-8 rather than silently replacing it. A leading BOM is normalized only under an explicit policy with a warning; original bytes/source remain available for raw export. JSON `\\uXXXX` sequences must be validated; lone surrogate escapes receive an interoperability warning rather than being automatically rewritten.

## 6. Formatter semantics

Two distinct actions:
- **Source export:** Returns exactly the input text as imported/typed, no edits, ever.
- **Lossless pretty:** Replaces only insignificant JSON whitespace outside string tokens; must preserve all raw numeric tokens, quoted string/key tokens, object member order and duplicate members. `-0`, `1.00` and `1e+9999` remain identical spellings.

Do not present this whitespace-only formatter as RFC 8785 JCS canonicalization. JCS has different rules, including IEEE 754 numeric representation and duplicate-name constraints. Do not introduce JCS in V0.3.

Required properties:
- `stripJsonWhitespace(formatLossless(x)) === stripJsonWhitespace(x)` for every valid text, where stripping is token-aware (not a naive regex).
- `parseLossless(formatLossless(x))` has identical ordered token values and member occurrences as `parseLossless(x)`.
- `formatLossless(formatLossless(x)) === formatLossless(x)` for fixed options.

## 7. Worker architecture

```ts
type WorkerRequest =
 | {requestId:number; docId:string; revision:number; type:'PARSE'; payload:{source:string}}
 | {requestId:number; docId:string; revision:number; type:'GET_CHILDREN'; payload:{id:number; offset:number; limit:number}}
 | {requestId:number; docId:string; revision:number; type:'TREE_WINDOW'; payload:{expanded:number[]; start:number; count:number}}
 | {requestId:number; docId:string; revision:number; type:'FORMAT'; payload:{indent:number}}
 | {requestId:number; docId:string; revision:number; type:'RESOLVE_POINTER'; payload:{pointer:string}};
type WorkerReply = {requestId:number; docId:string; revision:number; ok:boolean; payload?:unknown; error?:{code:string;message:string}};
```

- One active parse per document, latest-revision wins, older replies dropped.
- Source transfer via string is acceptable for 2 MiB baseline; for file imports use transferable `ArrayBuffer` and UTF-8 decoding in worker when practical. Large ASTs stay **worker-owned**; return bounded row/child projections to main thread.
- **Cancellation caveat:** `postMessage('CANCEL')` does not interrupt a synchronous busy worker. Use `worker.terminate()` and recreate for hard cancellation, or a deliberately chunked yielding parser with cooperative checkpoints. Benchmark both before choosing.
- Main UI state: `idle|parsing|ready|invalid|cancelled`, `activeRevision`, `selectedNodeId`, `expandedIds`. Invalidate selection and expansion state on new parse unless explicitly remapped.
- Never send secrets or full JSON into logs, errors, analytics or worker timing traces.

## 8. Virtualized tree and navigation

- Render **only visible window + overscan**, not all descendant DOM. Collapse/expand is an indexed-tree projection operation.
- Rows are compact, fixed-height by default; long strings truncate visually (never mutate underlying data) with detail pane for full text. If variable row height later introduced, measure heights and preserve scroll anchors.
- Row projection: `{nodeId, kind, depth, label, preview, hasChildren, expanded, pointer?}`.
- First render only root. Expand requests child projections in pages. For full expand/search, flatten visible node IDs once per expansion-state revision; avoid re-traversing 100k nodes on each scroll frame. Max UI DOM rows = 400 as initial budget, independent of full tree size.
- Keyboard: up/down, left collapse/parent, right expand/first child, home/end and enter/select; standard ARIA tree roles and `aria-level`, `aria-expanded`.
- Copy actions: JSON Pointer only if unambiguous; copy selected raw source slice; copy decoded scalar only via explicit command.
- Scroll-to-pointer: resolve ID in worker, expand ancestors, project row index, request virtualization scroll.
- Table view uses row virtualization or paged data instead of hard-stop `maxRows=500`. Arrays with mixed content remain explorable; nested cells show compact JSON preview.

Optional dependencies: `lossless-json` as differential test oracle for numeric value behavior; `@lezer/json` + CodeMirror for future tolerant editor diagnostics; `@tanstack/virtual-core` only if DOM and bundle budget warrant it. Do **not** rely on a recovering editor parser to validate JSON or on `JSON.parse` reviver `context.source` for ordered duplicate members and full source spans.

## 9. Resource policy and measurable performance

**Guaranteed V0.3 baseline retains V0.2 budgets:** 2 MiB UTF-8 input, depth 128, object members 50,000, AST nodes 100,000. Limit additional token length and diagnostic count (proposed 1 MiB token, 100 diagnostics; tune by tests). This avoids claiming 10 MiB performance without evidence.

**Release candidates (must be measured on pinned browser + reference machine):**
- 2 MiB / up to 100k nodes: successful bounded parsing, accurate AST and responsive UI.
- Main thread should avoid tasks over 100ms during parse; no UI freeze due to synchronous AST construction.
- Virtual tree DOM `[role=treeitem]` count <= 400 and scroll interaction should feel continuous.
- Per-operation peak memory and P50/P95 duration recorded against V0.2; do not mandate an absolute millisecond threshold until baseline device and CI hardware are pinned.
- 5/10 MiB experiment is exploratory only; report `LIMIT_EXCEEDED` under current policy, not a false success.

**Backpressure:** Maximum one active parse and bounded queued request count; stale revision responses dropped; size/depth/count caps enforced before or during AST construction.

## 10. Backend contract

Maintain V0.2 `/api/parse/` unchanged during the migration. A later optional `/api/v2/inspect/` may return only JSON-safe projections:
```json
{
  "version": "0.3",
  "validSyntax": true,
  "statistics": {"nodes": 2, "total_keys": 1},
  "numericTokens": [{"pointer": "/id", "raw": "9007199254740993"}],
  "diagnostics": []
}
```
No large numeric JSON literals can be sent in `data` as authoritative lossless values. Duplicate-key policy must be explicit. Keep this endpoint optional and off by default; prioritize matching golden fixtures before implementing Python AST duplication.

## 11. Migration and rollback

1. Freeze V0.2 golden fixtures and capture baselines.
2. Introduce `packages/json-core` with pure tests; no UI writes yet.
3. Wire `parser.worker` behind `V03_ENGINE` feature flag and compare results with V0.2 only where semantics are compatible.
4. Replace tree view with virtualized projection, retain legacy renderer for rollback.
5. Enable parser by default after golden/differential/E2E tests. Remove old core only in a separate cleanup PR.
6. Preserve V0.2 branch and PR #1 until integration; new V0.3 changes branch from V0.2, not from legacy main.

## 12. References and decisions

- RFC 8259: https://www.rfc-editor.org/rfc/rfc8259.html
- RFC 6901: https://www.rfc-editor.org/rfc/rfc6901.html
- RFC 8785 (not equivalent to lossless whitespace formatting): https://www.rfc-editor.org/rfc/rfc8785.html
- MDN JSON.parse reviver source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
- MDN transferable Worker messages: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- Lezer error recovery: https://lezer.codemirror.net/docs/guide/
- Numeric oracle: https://github.com/josdejong/lossless-json
- Virtualization reference: https://tanstack.com/virtual/latest/docs/api/virtualizer

The main recommendation is **one strict token-preserving JSON authority with ordered members**, and UI/editor recovery as a clearly separated secondary concern.
