# V0.3 M04 — Virtual JSON Explorer: Detailed Architecture RFC

**State:** Design only, no M04 runtime features implemented by this PR.
**Source baseline:** `feat/v0.3-m00-m02-lossless-core`, which already contains merged M03 (PR #4).
**Primary goals:** truly windowed tree, path-to-row reveal, accessible keyboard navigation, virtualized table.
**Explicit non-goals:** arbitrary JSON edits/undo, full schema/JSONPath, persistence, 10+MiB streaming, generic data grid framework rewrite.

## 0. Source review / root-cause inventory

Files reviewed: `src/worker/runtime.mjs`, `src/worker/client.mjs`, `src/document/controller.mjs`, `src/ui/lossless-render.mjs`, `src/app.mjs`, `packages/json-core/{parser,pointer}.mjs`, `tests/v03/worker.test.mjs`, `tests/e2e/m03_playwright.py`.

- **P0: no windowed list.** M03 `lossless-render.mjs` appends nested `details` and stops at 500 mounted rows; pagination != virtualization.
- **P0: no visible preorder index.** `GET_CHILDREN` returns a page for one parent but cannot answer logical visible row 50,000.
- **P0: projection CPU/memory risk.** `runtime.project()` slices complete source node (`source.slice(start,end)`) even for object/array; then `pointerFor(doc,id)` walks all ancestors on *every* projection.
- **P1: expansion and query state.** `DocumentController.revision` tracks source but there is no independent view/expansion epoch. Stale query replies require a second epoch guard.
- **P1: no virtual table schema/rows.** Current table only index/kind/preview with appended 40-row pages.
- **P1: keyboard/ARIA incomplete.** M03 nested `details` is not a roving/selectable ARIA tree.
- **P2: source retrieval cap.** `GET_SOURCE_SLICE` rejects spans over 64KiB; M04 detail/copy must access local source via validated span or add bounded range reads.

## 1. Architecture / ownership

```text
DocumentController(docId, revision)
  -> WorkerClient (requestId, bounded pending, terminate/restart)
       -> WorkerRuntime
            - Lossless AST, immutable for doc revision
            - TreeSession: expanded Set<NodeId>, epoch, flatVisibleIds[]
            - Tree projector: get window [start,end) with bounded previews
            - Pointer/Reveal resolver: atomic ancestor expansion + visible rank
            - TableSession: column model and row projection
       <- bounded rows + epoch + totalCount + span
  -> M04 ViewSession (view type, selectedId, activeId, scrollAnchor, epoch)
       -> VirtualTree (fixed-height rows, DOM only visible+overscan)
       -> VirtualTable (row + column windows)
       -> DetailPanel (source span, number lexeme, duplicate occurrence)
```

**Only the Worker owns AST and authoritative expansion tree.** Main thread holds source text already present in textarea, bounded row projections, focus selection, scroll and a small revision-tagged cache. No remote network path is introduced.

Separate revision scopes:
1. `documentRevision`: increments on source change/reimport; all old AST/index/query results invalid.
2. `treeEpoch`: increments on expansion/collapse/reveal changes within a parsed revision. Stale window replies ignored even if document revision remains unchanged.
3. `uiWindowRequestId`: monotonic request number to suppress out-of-order scroll window responses for the **same** epoch.

Identity: AST `nodeId` is stable only within one `documentRevision`. Visual `rowIndex` is stable only within one `treeEpoch`. Never persist or reuse either across revisions.

## 2. Visible Tree Index — recommended phased algorithm

### Minimal deterministic implementation (ship M04 first)

Worker maintains:
```ts
interface TreeSession {
  docId: string;
  documentRevision: number;
  treeEpoch: number;
  expandedIds: Set<number>;
  visibleNodeIds: number[];         // DFS preorder of *currently visible* AST nodes
}
```

Initialization: `visibleNodeIds = [rootId]` and root collapsed (optionally explicitly expand once to match M03 UX). No eager DOM allocation.

**Expand node N**:
1. Locate its visible row (using a cached lookup map or a one-shot linear scan).
2. Collect **direct children**, or the visible expanded subtrees if retaining expansion memory, in DFS order from the Worker-owned AST.
3. Splice their IDs directly after N; set expanded, increment treeEpoch, return totalVisible and new epoch.
4. Preserve pre-existing descendant expansion state across a parent's collapse only if documented and fully tested. Suggested UX: preserve expansion, collect descendant rows on re-expand.
5. If the user requests expand-all, impose a bounded operation and give feedback; do not block on unbounded mass expansion.

**Collapse node N**:
1. Find contiguous following IDs with depth greater than depth(N), remove that span from visible index.
2. Clear N's expanded flag (leave descendants' flags intact only if preserve-expansion policy is used).
3. Increment epoch; keep scroll anchor and selected node valid (if selected descendant is now hidden, select N).

**Get window**: `visibleNodeIds.slice(offset, offset+limit)` and project **only those** rows; bound limit to 120.
**Scroll**: main computes first visible row index from `scrollTop / rowHeight`. This calculation must *never* ask Worker to traverse the whole tree.
**Reveal**: resolve node id or RFC 6901 pointer; collect all ancestors, expand them in one atomic Worker operation, rebuild visible index only once, locate requested node and return row index + epoch.

Complexities for the initial straightforward implementation:
- Scroll index O(1), window projection O(W * previewCost) plus bounded projection metadata.
- Expand/collapse with a flat JS array uses O(N+K) worst-case `splice`/scan; **do not claim O(logN)**.
- Batch reveal can rebuild O(N) in one Worker operation (N <= 100k).
- Memory: visible IDs O(N), bounded by existing AST node cap; no full AST clone to UI.

Because `N<=100,000` and the view model is very simple, measure flat-array performance before adding algorithmic complexity. If recorded expansion/reveal P95 becomes unacceptable, replace the internal order with a **segmented rope/order-statistic tree**; keep the Worker request schema unchanged. Do not prematurely introduce a B-tree dependency.

### Fundamental visible-order invariant

Let `Preorder(AST, expandedSet)` enumerate root and the children of expanded nodes, in source member/array order:
```
visibleNodeIds === Preorder(AST, expandedSet)
```
Each visible node appears exactly once, and descendants of a collapsed node appear zero times. This is the independent evaluator's core oracle.

## 3. Worker protocol extension

M03 operations stay supported.

```ts
type TreeWindowReq = {
  type: "GET_TREE_WINDOW";
  docId: string;
  revision: number;
  requestId: number;
  payload: {epoch:number; offset:number; limit:number};
};

type TreeRow = {
  nodeId:number;
  parentId:number|null;
  depth:number;
  kind:"object"|"array"|"string"|"number"|"boolean"|"null";
  label:string|null;           // array index or original decoded object key
  occurrence:number|null;      // duplicate key disambiguation
  hasChildren:boolean;
  expanded:boolean;
  childCount:number;
  posInSet:number;             // original sibling position, one-based
  setSize:number;              // original sibling count
  preview:string;              // <=160 display chars, source lexeme preserved
  span:{start:number;end:number};
};
type TreeWindowReply = {
  docId:string;revision:number;epoch:number;
  offset:number;totalVisible:number;items:TreeRow[];
};
```

New commands:
- `TREE_INIT {expandRoot?:boolean}` -> `{epoch,totalVisible}`
- `TREE_SET_EXPANDED {nodeId, expanded, expectedEpoch}` -> `{epoch,totalVisible,rowIndex}`; conflicting epoch gives `TREE_EPOCH_CONFLICT` and requires a fresh snapshot.
- `GET_TREE_WINDOW {epoch,offset,limit<=120}` -> bounded rows or `TREE_EPOCH_CONFLICT`.
- `TREE_REVEAL {pointer? , nodeId? , expectedEpoch}` -> `{nodeId,rowIndex,epoch,totalVisible,span}`; pointer ambiguity gives `AMBIGUOUS_MEMBER`.
- `GET_TABLE_SCHEMA {rootId,mode}` -> `{columns, rowCount, tableEpoch}` (schema bounded or paged).
- `GET_TABLE_WINDOW {tableEpoch,rowOffset,rowLimit<=100,colOffset,colLimit<=30}` -> compact cell projections, no native numeric coercion.
- Optional `GET_SOURCE_RANGE {nodeId,startOffset,length<=64KiB}` -> bounded text chunk; offset is relative to node span.

Keep every message keyed by `requestId/docId/revision`. UI must also match `epoch` and latest window request sequence. No complete `visibleNodeIds` or AST is sent to main thread.

### CPU/memory fix in existing `runtime.project()`

Replace eager full-node slice with type-first projection:
```js
if (node.kind === 'object') preview = `Object (${node.members.length})`;
else if (node.kind === 'array') preview = `Array (${node.children.length})`;
else preview = boundedPreview(doc.source, node.start, node.end, 160);
```
Never call `pointerFor` for every row. Resolve Pointer on explicit Copy Pointer or Reveal only; the optional detail panel can fetch a selected node's pointer once. Do not clip original raw JSON when copying or formatting.

## 4. Viewport virtualizer

**Initial default:** fixed row height 30px (configure in a single constant), no wrapping, ellipsis/shortened previews. Full text belongs to a separate detail panel. This makes exact offsets deterministic:
```ts
const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
const visible = Math.ceil(viewportHeight / ROW_HEIGHT);
const start = first;
const end = Math.min(totalVisible, Math.floor(scrollTop/ROW_HEIGHT) + visible + OVERSCAN);
const translateY = start * ROW_HEIGHT;
const totalHeight = totalVisible * ROW_HEIGHT;
```

Initial overscan: 8–12 rows on each side; measure scroll blanking before adjustment. At 100k rows, 30px * 100k = ~3 million CSS px, within ordinary desktop scroll-space limits; actual supported-browser verification is mandatory.

Render DOM structure as one scroll viewport + spacer of total logical height + one positioned window of `items`. Avoid nesting a `details` subtree for every row. Use **event delegation** on viewport rather than attaching thousands of per-row listeners. Reuse DOM elements keyed by `nodeId` across scroll windows when possible; never use row index as a persistent identity across expand/collapse.

Use `requestAnimationFrame` to coalesce scroll notifications. If the requested window is not cached, show bounded loading placeholders and issue only the latest needed request; keep previous rows until replacement is ready where possible to prevent blank flashes. Discard late responses from old epochs/request sequences. Cache at most 4-8 windows with a strict byte budget; clear on new document revision.

**Main-thread mounted tree rows <=400**, including overscan and any hidden accessibility helpers. Normal viewport of 590px should mount only ~40-60.

Dynamic row heights and inline wrapped value editing are **deferred**. If needed later, introduce measured row sizes + prefix sums/Fenwick tree; do not mix them into fixed-height M04 initial rollout.

## 5. Navigation, selection and accessibility

The tree is **single-select**. Separate:
- `activeId`: keyboard focus/navigation target
- `selectedId`: node whose detail pane is shown
- `expandedIds`: authoritative worker view state

WAI-ARIA APG Tree pattern:
- The outer interactive region uses `role="tree"` and a clear `aria-label`.
- Each rendered row uses `role="treeitem"`, explicit `aria-level`, `aria-setsize`, `aria-posinset` because not all sibling nodes exist in DOM.
- Expandable nodes expose `aria-expanded`; selectable nodes use `aria-selected` appropriately.
- Keyboard: Up/Down moves active row; Right opens or selects first child; Left closes or goes to parent; Home/End to first/last; Enter selects/opens; optional type-to-find keys.
- **Focus strategy:** keep DOM focus on tree container and use `aria-activedescendant`; ensure active descendant is *mounted* before updating the ID, including scroll-to-index. Do not point ARIA to unmounted rows.
- If collapse hides active/selected descendant, move both to the collapsed parent or preserve selection in detail panel with explicit “hidden” state; choose one policy and test.
- Focus and selection are distinct concepts. Provide visible active outline and selected background separately.

Reference: https://www.w3.org/WAI/ARIA/apg/patterns/treeview/

### Pointer-to-row reveal

1. User enters a JSON Pointer or selects a diagnostic.
2. Worker `TREE_REVEAL` uses existing strict `resolvePointer` or nodeId.
3. Resolve duplicate-name ambiguity explicitly. The UI must offer selecting an occurrence by document-specific `nodeId` without inventing a non-standard RFC 6901 suffix.
4. Worker expands all ancestors atomically, bumps treeEpoch once, computes rowIndex.
5. Main requests the right window, scrolls to `rowIndex*rowHeight`, mounts row, then updates selected/active state, and highlights source span in textarea (`setSelectionRange`) when user requests source jump.
6. If source changes during this sequence, discard the entire operation.

## 6. Advanced Table — virtualization contract

Only activate table when top-level root is an array. Support:
- Array of plain objects: build **ordered union of object member labels** in Worker (not `Object.keys(JSON.parse(...))`); duplicate occurrences represented as distinct **display columns** with internal unique IDs.
- Array of scalars or mixed JSON values: Index / Kind / Value preview mode.
- Nested object/array cell: structural preview plus NodeId for detail drill-down.
- Keep missing property `MISSING` distinct from `null`, and `-0` / high-precision numbers as original lexemes.
- Row virtualization + limited visible columns; use one frozen index column if UI budget allows.
- Worker table projection `GET_TABLE_WINDOW` returns bounded `rows × columns` cell descriptors, not huge JSON rows.

Table positioning: initial row height 34px, max 100 row projections per request, max 30 column projections per request, render only viewport + overscan. Column discovery scanning all AST members is O(N) and may be deferred until table tab activation; do not block main thread. If full union has 50k distinct keys, use column paging/search, not 50k DOM headers.

**No row editing in M04**; editing with undo/redo belongs to V0.4.

## 7. Implementation location

```text
packages/json-core/
  visible-index.mjs            # pure state/order algorithm, Node-testable
  table-projection.mjs         # source-preserving cell/index projection
src/worker/
  runtime.mjs                  # add window, mutation and reveal commands
  client.mjs                   # allowlist new commands, epoch semantics
src/document/
  controller.mjs               # add TreeSession view epoch and navigation state
src/ui/
  virtual-tree.mjs             # viewport geometry, DOM row recycling
  virtual-table.mjs            # row/column windows
  node-details.mjs             # full value/source, copy path
  lossless-render.mjs          # compatibility adapter / fallback
src/
  app.mjs                      # feature flag + view integration
  styles.css / index.html     # accessible responsive layout
tests/v03/
  visible-index.test.mjs
  table-projection.test.mjs
  tree-worker.test.mjs
tests/e2e/
  m04_playwright.py
benchmarks/v03/
  virtual-tree-bench.mjs
docs/v0.3/
  M04_DESIGN_RFC.md
  M04_ACCEPTANCE.md
```

Keep old M03 paginated view behind an explicit UI fallback until the browser E2E + performance gates pass.

## 8. Rollout and risk management

- `V03_M04_VIRTUAL_TREE=1` feature flag, default off during development. After acceptance, default on for V0.3 Worker mode, legacy V0.2 still selectable.
- Do not activate M04 table simultaneously with incomplete accessibility; integrate tree first, table second.
- If `GET_TREE_WINDOW` times out or Worker restarts, retain source input and offer reparse; no silent data loss.
- Preserve current 2 MiB/128 depth/50k member/100k AST-node limits.
- Privacy: no analytics or automatic network uploads; no full JSON in logs or diagnostic traces.
- Browser E2E on actual Chromium, Firefox and WebKit where runner environments support them; do not mark a browser passed without observed runs.

## 9. Decisions needing verification

1. Flat-array visible preorder at 100k nodes must be measured for repeated random expand/collapse, not assumed cheap.
2. Source-span highlighting in a large textarea may be slow; benchmark before introducing CodeMirror.
3. Screen-reader virtualization must be manually sanity checked as well as automated ARIA assertions.
4. Column union must preserve duplicate occurrence semantics; a display label like `key #2` is not a JSON Pointer.
5. Keyboard scroll during inflight Worker window fetch needs a deterministic active-index state.
6. Preserve cursor/scroll anchor after expansion above viewport; otherwise rows visibly jump.

## References
- WAI-ARIA APG Tree View: https://www.w3.org/WAI/ARIA/apg/patterns/treeview/
- TanStack Virtual: https://tanstack.com/virtual/latest/docs/api/virtualizer
- RFC 6901 JSON Pointer: https://www.rfc-editor.org/rfc/rfc6901
