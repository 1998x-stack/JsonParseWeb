# M04-D — AST Navigation & Node Details implementation report

**Scope:** implementation, not a plan. Based on M04-C branch; earlier stacked PRs #6/#7 must be integrated in order.

## Delivered

- RFC 6901 pointer entry with `TREE_REVEAL`: resolves target, atomically expands ancestors, returns logical row index, scrolls to center and selects the node.
- Source-backed node details (`GET_NODE`): type, depth, original property label and duplicate occurrence, source UTF-16 span, pointer where unique, bounded preview, full raw copy, source highlight.
- Correct duplicate-key handling: `/a` is ambiguous for `{"a":1,"a":2}` and copy-pointer stays disabled; individual occurrences remain selectable in the virtual tree.
- Exact raw copied from the **unchanged local editor source** via AST span. No transfer of large slices over Worker, bypassing prior 64KiB GET_SOURCE_SLICE cap without removing the cap on that API.
- Selection invalidation: reparse/revision change, mode toggle, view switch and clear destroy old node details. Async `GET_NODE` callbacks are revision and selection-sequence checked.
- Details preview bounded at 1,800 UTF-16 code units; surrogate pairs not split. Large copies are explicitly user-triggered and respect existing 2MiB document cap.
- Existing M03 paged rendering and M04-C virtual tree functionality remain fallback options. No library added.

## Source audit and boundaries

| Area | Decision |
| --- | --- |
| Pointer | Existing strict RFC 6901 resolver, `AMBIGUOUS_MEMBER` remains hard failure for ambiguous paths |
| Identity | NodeId belongs to one document revision; pointer reveal returns epoch and row index; never reuse a row index across epochs |
| Text | SourceSpan uses UTF-16 `[start,end)` to match textarea selection; raw copy intentionally avoids JS Number conversion |
| Rendering | DOM textContent only; no innerHTML or JSON-driven markup |
| Clipboard | `navigator.clipboard.writeText()` requires compatible browser permissions; otherwise show failure, never claim success |
| Huge content | bounded details preview, exact raw copied locally; 2MiB source cap remains |
| Accessibility | pointer input labeled, live status, action buttons labeled and disabled appropriately; M04-F manual screen-reader verification pending |
| Scope | M04-E virtual data table, M04-F full performance/independent evaluation not delivered |

## Quality gates

- Run `npm test` (previous M04-C tests + M04-D span and pointer tests).
- Run `node --check` on all .mjs files; run Django pytest and system checks.
- Browser E2E `tests/e2e/m04d_playwright.py` in GitHub Actions: pointer reveal, number fidelity, source highlighting, copy of long raw object, duplicate ambiguity, source revision reset, mode fallback, no remote requests.
- Do not claim local Chromium success if environment restrictions prevent the browser test. GitHub Actions status must be verified after push.

## Remaining

M04-E: virtual tables with source-ordered member union and missing/null semantics; M04-F: multi-browser/a11y and independent performance evidence. The new component's keyboard and clipboard usability should also receive manual accessibility review before the V0.3 default switches from legacy mode.
