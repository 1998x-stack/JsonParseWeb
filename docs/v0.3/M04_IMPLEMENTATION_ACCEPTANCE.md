# V0.3 M04 — Delivery plan, independent evaluation and acceptance matrix

**Deliverable:** staged implementation of Virtual JSON Explorer. This file describes future tests and targets, not passed results.

## Phased PR plan

| Batch | Target modules | Contract delivered | Required gate |
|---|---|---|---|
| M04-A | `packages/json-core/visible-index.mjs`; unit tests | Pure DFS visible order, expand/collapse, epochs, reveal by nodeId, visible slice | 10k randomized operations + oracle; no duplicate/hidden descendants |
| M04-B | `src/worker/runtime.mjs` and `src/worker/client.mjs` | TREE_INIT, TREE_SET_EXPANDED, GET_TREE_WINDOW, TREE_REVEAL; bounded preview | Node worker-thread tests; race, epoch conflicts; payload size cap |
| M04-C | `src/ui/virtual-tree.mjs`, `src/document/controller.mjs`, `src/app.mjs` | Fixed-height scroll viewport, bounded rows, progressive window fetch, UI fallback | Playwright on 100k nodes; no blanking/focus regression |
| M04-D | `src/ui/node-details.mjs`, pointer navigation | Path search, source span highlighting, copy number/raw, duplicate occurrence | Pointer/UTF-16 tests; E2E keyboard + copy exact data |
| M04-E | `packages/json-core/table-projection.mjs`, `src/ui/virtual-table.mjs` | Object-array column union, scalar/mixed fallback, virtual rows/columns | 100k row array, sparse keys, duplicate keys, missing vs null |
| M04-F | CI, independent evaluator, docs | Final browser matrix, performance data, release and rollback report | All gates complete; explicit result table |

**Merge discipline:** Feature PRs merge into the V0.3 integration branch sequentially (M04-A → ... → F). The documentation PR should target the integration branch; never commit partially tested M04 to `main` while integration differs.

## A. Data invariants (mandatory unit tests)

- `flatVisibleIds` exactly equals independent recursive reference preorder when expanded set applied (for small bounded trees; reference implementation must not reuse production logic).
- Every rendered row ID exists in the immutable AST and occurs once.
- For collapsed parent, no descendant row appears.
- Every visible node except root has at least one expanded ancestor path.
- Source member order, duplicate keys and original numeric token spelling are preserved in projection.
- After expanding a parent, visible row count increases by number of newly visible descendants (not necessarily just direct children if expansion state persists).
- After collapsing, count decreases by size of currently visible descendant interval.
- `treeEpoch` increments exactly once for a state-changing operation; no-op expansion has stable epoch (choose and document).
- `GET_TREE_WINDOW` rejects mismatched epoch and invalid offset/limit rather than returning mixed state.
- Reparse resets `expandedIds`, epoch, selection, row window cache; old document queries rejected.
- Roving active focus, selection and scroll anchor preserve identity or move to explicitly documented fallback node.

## B. Core fixtures

| Fixture | Shape | Purpose |
|---|---|---|
| F01 | `{"a":[1,{"b":true}],"c":null}` | visible preorder, depth, pointer, collapse |
| F02 | `{"a":1,"a":2}` | duplicate occurrence rows and pointer ambiguity |
| F03 | `{"a/b":[{"m~n":9007199254740993}]}` | escaped Pointer and exact number |
| F04 | long escaped and unescaped unicode strings | preview truncation, source spans, no surrogate split |
| F05 | array of 100k zeroes within 2MiB | max node count boundary; visible 100k only after expand |
| F06 | narrow-deep JSON with 128 levels | deepest navigation and stack safety |
| F07 | object array with union keys and null/missing | table schema and cell semantics |
| F08 | heterogeneous array with nested array/object | mixed fallback and detail panel |
| F09 | 2MiB source with very large object/raw string | no eager full-node slice, projection payload cap |
| F10 | malformed JSON and invalid UTF-8 | invalid state, no orphan virtual rows |
| F11 | 50k distinct object keys | column schema pagination, no thousands of DOM headers |

For F05, choose exactly 99,999 zero elements plus root array = 100k nodes. F11 key count = 50k, values minimal; record byte count and check size cap first so resource tests exercise intended limits.

## C. Deterministic property and stress tests

- Seeded random small trees (>=1000 cases): generate random expanded sets, compute reference preorder, compare production visible index, compare all page windows and leaf-parent invariant.
- Seeded action traces (>=10k transitions across test run): randomized expand/collapse/reveal/scroll, ensure epoch and row counts consistent. Keep traces bounded.
- Verify `pointerFor` isn't called in each `GET_TREE_WINDOW` row; instrumentation counts explicit pointer actions, not O(N) during scroll.
- Repeated high-level expand/collapse of 100k-node array: measure P50/P95 and memory; no main-thread hang (worker computation may vary).
- Worker stress: 100 rapid window requests followed by expansion; replies from prior epoch are ignored; pending queue capped. Parse while requests in flight causes `STALE_DOCUMENT`.
- Strings containing HTML-looking data and keys like `__proto__` must remain inert text.
- Max projected response size and max row count enforced regardless of malicious `limit`.

## D. Browser E2E test scripts (CI)

1. Enter `[0,1,2]` and select Worker mode; root initially displayed.
2. Expand root, scroll by wheels/scrollTop; assert text of row N after viewport update.
3. Load F05, expand root, set scrollTop to approximate logical end; assert last element appears, scrollHeight consistent, mounted `[role=treeitem]` <=400.
4. Expand/collapse node above viewport, confirm previously selected node identity or a documented fallback, anchor and focus remain correct.
5. Type `/a~1b/0` pointer on F03; reveal, verify `aria-selected`, numeric raw and source span selection.
6. Enter duplicated key pointer `/a`; assert specific `AMBIGUOUS_MEMBER` status, provide an occurrence-aware UI alternative.
7. Use keyboard Up, Down, Right, Left, Home, End, Enter. Assert active descendant exists in mounted DOM, no blind off-screen reference.
8. Rapid scrolling + 20 random expansions does not show stale cached rows or throw page errors.
9. Table: 100k scalar rows + object array with sparse keys and duplicate keys. Visible DOM row/cell caps, null vs missing, exact numbers.
10. Switch legacy/Worker mode during a window query, edit text, cancel parse; no stale output or uncaught errors.
11. Privacy assertion: no outgoing document transfer, no analytics, no unexpected external requests. Inspect both page and worker network activity where Playwright supports it.
12. Screenshot regression across fixed viewports 1440x900, 390x844 and zoom 200%, plus accessible text and focus assertions.

## E. Accessibility checklist

- Explicit `role=tree` label; rendered `treeitem` has level, setsize, posinset, and expanded where applicable.
- Physical focus remains on tree container using `aria-activedescendant`, which always points to mounted node; keyboard focus and selected detail node distinguished visually.
- During asynchronous navigation to an off-screen row: ensure row mounted before changing active descendant reference.
- Announce loading, count and navigation errors via non-spammy polite live region.
- Motion reduced when `prefers-reduced-motion`; pointer and keyboard both supported; no click-only affordances.
- Validate screen reader operation manually at least once on a supported desktop environment. Automated ARIA checks alone cannot prove assistive technology compatibility.

## F. Proposed performance and resource budgets

Keep V0.3 input policies: **2 MiB** UTF-8; depth <=128; object members <=50k; AST nodes <=100k.

| Metric | Candidate acceptance (measured, not yet demonstrated) |
|---|---|
| Max tree DOM nodes | <=400 treeitems at any point |
| Normal 590px viewport | ~40-60 mounted tree rows, 30px fixed-height model |
| Worker GET_TREE_WINDOW | <=120 projected rows |
| Scroll main-thread work | O(window) DOM changes only; no full AST traversal |
| Total scrollable logical height | visibleCount * 30px; test browser max range |
| Exact raw number preview | zero precision loss, no implicit Number conversion |
| Table rendered cells | <=800 at default viewport, tune if measured |
| Browser responsiveness | no task over 100ms attributable to M04 scroll/DOM on reference CI runner (measure with trace, not guessed) |
| Expand/collapse P95 | record baseline; provisional <=40ms in Worker for common operations on pinned runner; treat as soft target until measured |
| Memory | record before/after GC snapshots and max heap; compare to M03 baseline, do not invent fixed limit |
| Input format policy | no network requests triggered by ordinary local JSON browsing |

**Hard gates:** correctness, payload bounds, DOM cap, no stale results, no data exfiltration, successful actual browser E2E. **Soft budgets:** timing and heap until a reference machine is pinned.

## G. Design quality gates and rollout

- M04-A core pure tests must pass before touching DOM/Worker transport.
- M04-B contract must be compatible with M03 existing `GET_NODE`, `GET_CHILDREN`, `FORMAT`; tests run unchanged.
- M04-C must retain M03 paged view as rollback flag, no new npm library required until performance evidence justifies it.
- M04-D path ambiguity must be explicit and source spans validated against original text.
- M04-E table must use AST member records, not `JSON.parse` objects.
- M04-F must produce an evidence-backed release report with test counts, actual CI run URLs, environment, failures, limitations, and outstanding issues.

### Go / no-go

Do **not** promote M04 default until:
1. Core oracle and Worker stress checks pass;
2. Actual Chromium E2E is green;
3. Virtual row/cell limits measured under F05/F07/F11 fixtures;
4. Keyboard/ARIA accessibility checks completed;
5. No stale Worker replies, data loss, or privacy regressions;
6. M03 fallback retained for one transition release.

## H. Follow-up: V0.4 and V0.5

M04 creates stable node identity, source spans, window projections and table display semantics. Only after that foundation:
- V0.4 adds Schema, JSONPath, Diff and *transactional* node editing with undo/redo; this needs explicit duplicate-key semantics and revision-based atomic AST edits.
- V0.5 adds multi-document concurrency (dedicated or pooled Workers), large-file streaming, plugin host isolation and performance governance. Do not prematurely promise 10–100MiB files on the 2MiB baseline.
