# JSONParseWeb v0.3 alpha.2 — local-first JSON Developer Workbench

JSONParseWeb is a standalone browser application for JSON validation and exploration with an optional Django API. **Pasted or uploaded JSON remains in the browser by default.** No bundler, frontend dependency, database, account or analytics service is necessary.

## Start frontend

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

The page supports JSON top-level primitives (`false`, `0`, `null`, `""`), tree/raw/table views, formatting, export, drag/drop, keyboard shortcut `Ctrl/⌘ + Enter`, structural counters and warnings on unsafe integer precision. Format is blocked on unsafe integers; raw view and download preserve the source.

## Run checks

```bash
node --version  # >=20
npm test
python3 -m pytest tests/python/test_service.py -q
```

Optional Django backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export DJANGO_DEBUG=1 # supply secrets through your runtime environment
DJANGO_DEBUG=1 python manage.py check
DJANGO_DEBUG=1 pytest -q
DJANGO_DEBUG=1 python manage.py runserver 127.0.0.1:8000
```

The browser UI does **not** call Django. Opt-in example: `curl -s -H 'Content-Type: application/json' -d '{"source":"{\"ok\":true}"}' http://127.0.0.1:8000/api/parse/`.

### Backend endpoints

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/parse/` | POST | Parse and analyze JSON text |
| `/api/upload/` | POST | Process an uploaded `.json` file without persisting |
| `/api/sample/` | GET | Small public example |
| `/api/health/` | GET | Basic process liveness |

## Project layout

- `src/core`: independent JSON analyzer and sample data
- `src/ui`: DOM-safe visualizations
- `src/app.mjs`: browser controller and revision-based state invalidation
- `server/config`: standard Django project entrypoints and settings
- `server/processor`: optional backend API and pure Python JSON processor
- `tests/js`, `tests/python`: regression and contract tests
- `.github/workflows/ci.yml`: CI quality gates
- `docs/architecture.md`: ADRs, limits and V0.3 scope

## Limitations and privacy

- Native JavaScript parsing is not lossless for some decimal and large numeric literals. V0.2 explicitly warns on unsafe integer literals and preserves their original text; a complete lossless AST is planned for V0.3.
- Browser output is bounded to 2,500 tree nodes and 500 table rows. This is a preview, not a virtualized large-dataset viewer.
- The anonymous optional API is not intended for unbounded internet exposure. For production use configure a reverse proxy with request/time limits, authentication if needed, and distributed throttling. Set `DJANGO_SECRET_KEY` and `DJANGO_ALLOWED_HOSTS`; `DEBUG` defaults to false.
- Browser E2E should be run on a local HTTP server; the core Node tests and Django integration tests are exercised in CI.

## V0.3-alpha.1 development track (M00–M02)

A new independent lossless core is available in `packages/json-core/`; it is intentionally **not** the browser's active engine yet. This staged migration preserves V0.2 UI while validating syntax and source-fidelity invariants.

```bash
npm test                 # legacy + v0.3 strict-core regression tests
npm run test:core        # strict tokenizer / AST / pointer / format only
npm run bench:core       # deterministic benchmark, no performance SLO implied
```

Example:

```javascript
import {parseLossless, formatLossless, resolvePointer} from './packages/json-core/index.mjs';
const document = parseLossless('{"id":9007199254740993,"id":1.00}');
console.log(document.stats, document.diagnostics);
console.log(formatLossless(document)); // preserves both `id` members and exact numbers
// resolvePointer(document, '/id') intentionally throws AMBIGUOUS_MEMBER.
```

See `docs/v0.3/REVIEW_AND_ROADMAP.md` and `docs/v0.3/M00-M02_REPORT.md` for the migration, limitations, actual test scope and next deliverables. Full V0.3 Worker and virtualized UI are planned, **not delivered by this batch**.

## V0.3 M03 experimental browser Worker mode

- Enable **V0.3 无损解析（Worker 实验模式）** or load `/?engine=v03`.
- This is a staged migration: the default view still uses V0.2 for rollback. V0.3 Worker mode keeps the AST inside the worker and requests bounded child projections (40 entries per UI page, 100 per protocol page).
- V0.3 numeric previews and formatter retain the exact original source lexemes including `9007199254740993`, `1.00`, `-0`, and large exponents. Duplicate properties remain distinct and produce diagnostics.
- Editing or canceling terminates the current Worker; request/revision checks prevent late responses from overwriting the current document.
- File imports in V0.3 are transferred as ArrayBuffers and decoded with strict UTF-8 validation in the Worker; malformed encoding is rejected.
- The tree currently uses **paged expansion** (maximum 500 mounted rows), **not true viewport virtualization**. M04 will replace it with a virtualized tree and indexed navigation.
- The experimental table renders a paged array preview (index, type, raw preview); rich column handling remains M04.
- No browser code automatically contacts the optional Django backend. Worker initialization and all parsing remain same-origin and local.

### M03 checks

```bash
npm test                         # V0.2, strict core, Worker threads, controller
npm run test:worker
npm run bench:core
python -m http.server 8765       # separate terminal for browser E2E
python tests/e2e/m03_playwright.py  # requires pip install playwright + playwright install chromium
```

Browser E2E with Chromium was prevented by local environment network policy in the development container; it runs as a dedicated job in GitHub Actions. Do not mark E2E passed unless its CI job reports success.

See `docs/v0.3/M03_REPORT.md` for the review, operating model and outstanding M04 work.

## V0.3 M04-A/B — visible index and Worker window protocol (headless core)

The next foundation for viewport virtualization is implemented **inside the Worker**, not yet in the browser tree component. `VisibleTreeIndex` maintains the current expanded preorder, rejecting stale tree epochs. After parsing a document with the M03 `WorkerClient`, call:

```js
const tree = await client.query('TREE_INIT', {expandRoot: true});
const page = await client.query('GET_TREE_WINDOW', {epoch: tree.epoch, offset: 0, limit: 60});
const changed = await client.query('TREE_SET_EXPANDED', {
  nodeId: page.items[1].nodeId,
  expanded: true,
  expectedEpoch: tree.epoch
});
const nextPage = await client.query('GET_TREE_WINDOW', {epoch: changed.epoch, offset: 0, limit: 60});
```

Additional command: `TREE_REVEAL` accepts `{pointer, expectedEpoch}` or `{nodeId, expectedEpoch}`, expands ancestors once and returns the target visible row index. Repeated `TREE_INIT` is idempotent for the active document revision. Existing M03 commands remain unchanged.

Run `npm test` and `npm run bench:m04` to exercise randomized tree traces, 100k-node boundaries, 50k object keys, and actual Node Worker threads. Benchmarks are indicative; they are not UI latency measurements. The main browser tree remains paginated until M04-C virtual viewport integration. See [`docs/v0.3/M04_AB_REPORT.md`](docs/v0.3/M04_AB_REPORT.md).


## V0.3 M04-C experimental virtual tree

Enable the browser Worker mode and **M04 viewport virtual tree** checkbox, or open `http://localhost:8080/?engine=v03&virtual=1`. The AST and expanded visible preorder stay in the Worker; the view requests windows of at most 120 rows and mounts only current viewport rows. Keyboard: Up/Down, Home/End, Right expand or next child, Left collapse or go to parent. The M03 paginated tree is available by unchecking the virtual tree option. The virtual tree is not enabled in legacy mode.

Run `npm test` and `python tests/e2e/m04_playwright.py` with the local HTTP server on port 8765 (install Playwright Chromium as indicated in `.github/workflows/ci.yml`). M04-D JSON Pointer search/detail view and M04-E virtual table are future stages.


## M04-D AST Navigation & Node Details (experimental)

Open `/?engine=v03&virtual=1` after starting the local static server. Enter an RFC 6901 JSON Pointer (empty input means the root), click **定位节点** to atomically expand ancestors and select the node. Clicking a virtual tree row also updates the detail panel. **复制 JSON Pointer** is disabled for any ambiguous duplicate-member path; **复制完整原文** uses the immutable parsed source span against the current local textarea text (not an additional Worker transfer), preserving exact unsafe-number spelling and whitespace even beyond 64 KiB. **定位源码** selects the exact UTF-16 span in the textarea. The preview is capped at 1,800 UTF-16 code units while exact copy retains the full source span. Browser clipboard permission is required for copying.

The M04 navigation and detail panel is only available in Worker + virtual-tree mode. No document content is sent to a backend. M04-E virtual table and M04-F independent evaluation are future work.


## V0.3 M04-E/F — Lossless virtual table and independent quality gates

Run `python3 -m http.server 8080` and open `http://localhost:8080/?engine=v03&virtual=1`.
Select **表格视图** with **V0.3 无损解析** and **M04 虚拟树 / 表格** enabled.
The table uses the *ordered AST*, not a native JavaScript object: duplicate object keys
produce separate occurrence-aware columns, `null` remains distinct from missing values,
and unsafe integers, decimals and exponents keep their original number lexemes.
Top-level arrays of objects expose ordered union columns. Mixed/scalar arrays expose
类型 and 值 columns. Only viewport row/column windows are transferred from the Worker;
its projections are bounded to 80 rows / 24 columns / 800 cells per message (the UI uses
smaller limits, capped at 48 rows and 16 columns).

Validation:

```bash
npm test                 # legacy, lossless core, Worker, tree, table, navigation
npm run evaluate:m04     # independent black-box synthetic golden / resource evaluator
npm run bench:m04        # existing visible-index benchmark
python3 -m http.server 8765
python tests/e2e/m04e_playwright.py  # separate terminal, Playwright Chromium installed
```

GitHub Actions runs separate frontend/backend/real Chromium/independent evaluation jobs,
with the independent evaluator's synthetic P50/P95 timings uploaded as an artifact.
These timings are **not** browser UX guarantees; the Release Gate records actual CI
results for each commit. Chromium E2E and screen-reader manual checks are distinct.

The V0.2 browser engine and M03 paged views remain available as rollback paths.
This M04 delivery does **not** implement JSON Schema, JSONPath query language, edit/undo,
large-file streaming, multi-document concurrency or a plugin runtime (future V0.4/V0.5).


## PRODUCT-01/02 beta: issue-first, local-only JSON inspection

This integration branch adds a public, English-first landing experience with three
synthetic one-click demonstrations and optional Chinese translation. At `/`, the
lossless Web Worker and virtual explorer are enabled by default when available.
The previous `?engine=v03` and `?engine=v03&virtual=1` URLs remain supported
for compatibility and can still be used to test the older paged UI. The advanced
engine menu contains a manual opt-out to legacy mode.

**The findings engine currently supports two deterministic checks only:**

- `JSON.UNSAFE_INTEGER`: integer number literals outside JavaScript's safe
  integer range. Original numeric text is retained; a warning is not proof of an
  actual downstream rounding bug.
- `JSON.DUPLICATE_KEY`: repeated decoded object property names including `"a"`
  versus `"\\u0061"`. The evidence includes the key-token spans of both
  occurrences; a standard JSON Pointer may be ambiguous.

The Worker returns a bounded summary and paginated findings. Issue cards can
locate precise source spans and copy exact text. `No findings` does not assert
that the JSON or API is valid beyond the two enabled checks. No content is
automatically uploaded or persisted. A 2 MiB input cap still applies.

```bash
python3 -m http.server 8080
# visit http://localhost:8080/ and click a synthetic demo
npm test
# Browser E2E needs Playwright Chromium + a local server on port 8765:
python tests/e2e/product_v1_playwright.py
```

See `docs/product/PRODUCT_01_02_IMPLEMENTATION.md` for feature boundaries,
security assumptions and verification. PRODUCT-03 multi-sample Schema Drift,
full i18n, public deployment and Product Hunt release are not delivered yet.


## PRODUCT-03 — Schema Drift Explorer (observational)

Enable the default lossless Worker engine. Use the **Schema Drift Explorer** disclosure below the findings to inspect the current JSON **array of objects**, or choose up to five related local `.json` files. The landing page **Schema drift** sample demonstrates field-type variation, missing fields, and `null` observations.

Schema observations preserve duplicate-key occurrences and exact source evidence; they are **not normative API Schema violations**. Results only include field distributions for fewer than three eligible object records. Each evidence reference opens its originating local source (current editor or read-only additional sample).

Strict resource limits: 2 MiB aggregate text, 100,000 combined AST nodes, 50,000 object members, 5 supplemental documents, 160 retained field entries, 100 retained observations. Counts and truncation are disclosed. Uploaded samples remain in browser memory only, with strict UTF-8 validation and no network upload.

Run `npm test` (including independent field-count oracle and actual Worker-thread tests). The CI browser job runs `tests/e2e/product_v1_schema_drift_playwright.py`; local browser testing can be constrained by container policies. See `docs/product/PRODUCT_03_IMPLEMENTATION.md` for the exact semantics and remaining limitations.
