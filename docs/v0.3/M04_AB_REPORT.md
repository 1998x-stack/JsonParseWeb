# V0.3 M04-A/B — Visible Tree Index and Worker Protocol

**Implementation status:** M04-A + M04-B code implemented, locally tested. M04-C–F (actual viewport virtualizer, UI navigation, table and full browser acceptance) are not implemented by this change.

**Base:** `feat/v0.3-m00-m02-lossless-core` containing merged M03. PR #5 contains separate M04 design RFC and is not a code prerequisite.

## Delivered changes

| Change | File | Behavior |
| --- | --- | --- |
| Worker-owned visible preorder index | `packages/json-core/visible-index.mjs` | Expand, collapse, reveal, current window; preserves descendant expansion state |
| Tree session epoch | `visible-index.mjs` | Mutations bump epoch once; repeated no-op keeps epoch; rejects stale epochs |
| Large-array-safe expansion | `visible-index.mjs` | Batches splice insertions at 4,096 IDs to avoid spread argument overflow |
| Worker tree query protocol | `src/worker/runtime.mjs` | TREE_INIT, TREE_SET_EXPANDED, GET_TREE_WINDOW, TREE_REVEAL |
| Client allowlist | `src/worker/client.mjs` | Enables new operations with existing requestId/docId/revision checks |
| Source slicing optimization | `src/worker/runtime.mjs` | No full-source slice for structural nodes; scalar preview bounded to 140 UTF-16 units |
| Dense sibling order index | `src/worker/runtime.mjs` | Build O(N) once; avoid O(objectWidth × windowSize) indexOf scans |
| Long key preview bound | `src/worker/runtime.mjs` | Window label limited to 160 units, with `labelTruncated` signal |
| Regression and stress tests | `tests/v03/visible-index.test.mjs` | Random 12k actions, 100k nodes, 50k keys, real Node Worker, duplicate pointers |
| Non-gating benchmark | `benchmarks/v03/visible-index-bench.mjs` | Repeatable JSON timing report for 100k-node fixture |

### Protocol

- `TREE_INIT {expandRoot?: boolean}` → `{epoch,totalVisible,rootId}`. **Idempotent** within a document revision; no silent reset on duplicate initialization.
- `TREE_SET_EXPANDED {nodeId, expanded, expectedEpoch}` → `{epoch,totalVisible,rowIndex,changed}`. Hidden node expansion rejected; `TREE_REVEAL` is used to open its ancestors.
- `GET_TREE_WINDOW {epoch, offset, limit<=120}` → `{epoch,totalVisible,rootId,offset,items}`. Row includes id, parent, depth, original sibling position/count, kind, limited preview, duplicate occurrence and source span. No full AST, visible IDs, rawNumber or computed Pointer is returned.
- `TREE_REVEAL {pointer | nodeId, expectedEpoch}` → `{epoch,totalVisible,rowIndex,nodeId,span,changed}`. Valid JSON Pointer ambiguity propagates `AMBIGUOUS_MEMBER`; ancestor expansion is atomic.

Each request uses the existing M03 `requestId`, `docId`, `revision` transport contract. A **tree epoch** further isolates expansion/window state within the same parsed revision. Query request ordering and late-reply suppression for the scrolling UI will be implemented in M04-C.

## Invariants

1. `visibleIds` equals independent depth-first preorder of AST, traversing children iff the corresponding parent is expanded.
2. No duplicates or descendants of a collapsed node in visible rows.
3. `nodeId` is stable only within the document revision; `rowIndex` only within the tree epoch.
4. Retain descendant-expanded flags when parent collapses; re-expand restores visible descendants.
5. Reject stale epochs (`TREE_EPOCH_CONFLICT`), invalid windows and hidden-node expand attempts without mutation.
6. Tree queries remain capped at 120 rows and do not compute a JSON Pointer for every row; copy-path is a separate operation.
7. M03 existing `GET_NODE`, `GET_CHILDREN`, `RESOLVE_POINTER`, `FORMAT` keep working.
8. Browser input stays local by default; no source network requests were added.

## Local verification (current batch)

- `npm test`: **106 JS tests passed**, including previous M03 regression tests plus 14 new M04 tests.
- `python -m pytest tests/python/test_service.py -q`: **17 tests passed**.
- `node --check` on changed MJS modules: passed.
- `npm run bench:m04`: 100k-node parse / visible-index boundary and Worker projection completed successfully. Single-run timing is **indicative only**, not a P50/P95 benchmark. Recorded one local Node 22 run: parser ~63ms; wide root expand ~16ms; Worker 120-row tail projection ~0.6ms. Results vary by machine/load.
- **Not yet demonstrated:** new M04 browser UI, DOM <=400, visual scroll FPS, ARIA keyboard and virtual table. M03 Playwright regression remains in existing CI; it cannot demonstrate M04 viewport performance.

## Known limitations and follow-up

- Flat-array `splice` / `indexOf` / full tree reveal are worst-case O(N); no logarithmic performance claim. Measure before considering a segmented order index.
- M04-A/B does **not** replace M03 paginated rendering. Until M04-C, the page still caps the paginated experimental tree at 500 mounted rows.
- `GET_CHILDREN` legacy projection may still include long `rawNumber` fields; new `GET_TREE_WINDOW` avoids this. Tighten and version source-chunk APIs in M04-D.
- No UI-side `treeEpoch` state yet; M04-C will own an epoch-aware view model, window request serial and LRU caching.
- M04-D must supply accessible keyboard navigation and distinguish selected node vs focused row.
- M04-E will build AST-preserving column unions and table windows; do not coerce numbers to `Number`.
- M04-F will run actual Chromium E2E and independent bench on pinned runner; never mark UI gates passed before then.

## Next batch: M04-C

1. Introduce fixed-row-height 30px viewport with overscan and bounded DOM (<=400 treeitems).
2. Request only visible-window rows via `GET_TREE_WINDOW`; retain the Worker-owned AST.
3. Coordinate `documentRevision`, `treeEpoch` and UI window request serial to discard stale replies.
4. Add scroll-anchor compensation on expand/collapse above viewport.
5. Integrate a reversible feature flag and keep the M03 paginated view available.
6. Run real Chromium Playwright with a 100k-node fixture; measure DOM count and scroll stability.
