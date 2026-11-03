# V0.3 M04-C — Virtual Tree UI Implementation Report

**Stage:** M04-C implementation / PR. **Not yet** M04-D navigation/source-detail, M04-E advanced table, or M04-F complete cross-browser/performance release.

**Based on:** M04-A/B implementation branch `feat/v0.3-m04-ab-visible-index-worker` (PR #6 currently open). **Integration:** M04-C PR targets that branch; preserve code dependencies until sequential merge.

## Source review summary

M03 `src/ui/lossless-render.mjs` appends nested `<details>` rows until a hard limit of 500. M04-A/B exposes a Worker-side visible-node index with epoch, bounded `GET_TREE_WINDOW` and expand/collapse. This change adds viewport-driven DOM windows without moving AST into the main thread.

## Delivered files and semantics

| File | Responsibility |
| --- | --- |
| `src/ui/virtual-tree.mjs` | Independent fixed-height geometry, scroll viewport, Worker windows, bounded DOM, expansion, selection, keyboard focus and request sequencing |
| `src/app.mjs` | Feature-flagged M04 view routing, new view lifetime disposal; older M03 UI remains selectable |
| `index.html` | M04 virtual tree opt-in checkbox |
| `styles.css` | 30px fixed rows, ellipsis previews, independent scroll viewport, selected/active visualization |
| `tests/v03/virtual-tree.test.mjs` | Geometry window oracle: 10k positions, invalid sizes, Worker 20k projection and stale epoch rejection |
| `tests/e2e/m04_playwright.py` | Chromium tree expansion/collapse, keyboard parent navigation, 100k AST nodes and bounded DOM, End/Home, safe rendering, fallback, reparsing and privacy |
| `.github/workflows/ci.yml` | Run M04 browser E2E after M03 regression in dedicated GitHub-hosted Chromium runner |

Worker holds the full AST and visible index. UI only requests `GET_TREE_WINDOW(epoch,offset,limit)` and receives up to 120 rows; viewport usually mounts fewer than 60 rows at the existing 480px height. No JSON source is uploaded by the new path.

## Design constraints

- Row height **30px**; overscan **10**; max Worker window **120**. The Tree UI uses `role=tree`, `role=treeitem`, explicit `aria-level/aria-posinset/aria-setsize`, `aria-selected`, and `aria-expanded`. Offscreen nodes are not referenced by `aria-activedescendant`.
- `documentRevision` is checked by `DocumentController`; Worker `treeEpoch` is checked on every mutation/window. UI `requestSeq` discards older responses even within the same epoch. In-flight windows are coalesced rather than queued without limit.
- Updating source / switching views / switching engine calls `destroy` and drops stale results. Worker itself is retained until the document revision changes, per M03 lifecycle.
- Scroll position is adjusted by visible-count delta when an expansion above the viewport changes the logical row offsets; if a collapse hides the active node, focus and selection move to its parent.
- `TREE_REVEAL` is only used for ArrowLeft parent navigation during this stage. Full input-by-JSON-Pointer, source code selection, and copy-source are M04-D.
- Tree UI is **opt-in** (`?engine=v03&virtual=1`, or check `V0.3 无损解析` and `M04 视口虚拟树`). Disable M04 checkbox in legacy mode. Existing M03 pagination remains as rollback.

## Reproduction

```bash
npm test
python -m pytest tests/python/test_service.py -q
python -m http.server 8765 --bind 127.0.0.1 &
python -m playwright install chromium
python tests/e2e/m03_playwright.py
python tests/e2e/m04_playwright.py
```

The browser tests are in CI. The local container may not permit localhost navigation in Chromium (`ERR_BLOCKED_BY_ADMINISTRATOR`), in which case the GitHub-hosted browser test results must be checked before claiming E2E passes. Geometry and Node Worker tests run locally.

## Acceptance status

| Gate | Status |
| --- | --- |
| Core parser, visible index and Worker regression | Node tests exercised locally |
| Python core regression | Exercised locally |
| Fixed-height viewport, bounded projections, DOM cap | Implemented; Chromium script included |
| 100k AST nodes scrolled to tail | Browser E2E test included; run GitHub CI to verify |
| Full path navigation and source highlighting | Deferred to M04-D |
| Table virtualization and column union | Deferred to M04-E |
| Cross-browser accessibility/manual screen reader | Deferred to M04-F |

## Known risks

- The flat array `visibleIds` has O(N) worst-case mutation even though viewport queries remain bounded; measure on a reference runner.
- Keyboard-driven focus in a virtual list depends on the target row being mounted before assigning `aria-activedescendant`; dynamic-height rows are deliberately out of scope.
- Table mode still uses M03 pagination. It is not a virtualized table yet.
- No user data is stored by default. Standard source export semantics remain unchanged.
