# V0.3 M03 — Worker runtime, document controller, bounded projections

**Scope:** Working implementation, staged/opt-in browser integration; not a completed V0.3 release.

## Code review and key repairs

| Finding from M00–M02 / V0.2 | Severity | Mitigation in M03 |
| --- | --- | --- |
| Main-thread `JSON.parse` and DOM construction can block | High | Async Worker mode selectable in UI; full lossless AST remains Worker-owned |
| Decimal and unsafe integers displayed from coerced JS values | High | Worker projections show original source lexemes; formatter operates on tokens |
| Worker cannot cancel a synchronous parser by receiving `CANCEL` | High | Terminate current Worker on parse replacement, user cancel or document edit |
| Old replies may overwrite new data | High | Request id + document id + revision, client-generation and controller-revision guards |
| Invalid UTF-8 can silently be replaced by `File.text()` | High | V0.3 imports transfer ArrayBuffer, fatal decoding in Worker; invalid error is surfaced |
| API calls may transport complete AST and source | Medium | Worker retains state, returns bounded summary and paged child projections |
| Unlimited pending projections could exhaust memory | Medium | Client pending queue cap 32, page-size cap 100, preview cap 140 characters |
| Large raw node slices may overwhelm UI | Medium | GET_SOURCE_SLICE capped at 64 KiB; malformed request fields rejected |
| V0.3 AST render may allocate all descendants | Medium | New M03 renderer loads 40 children per interaction, max 500 DOM rows; M04 still needs viewport virtualizer |
| File decode failure initially dropped error code | High | Fixed invalid document summary contract; test catches `INVALID_UTF8` |
| Browser E2E not previously executable in local container | High | Added reproducible Playwright CI job with full Chromium dependencies |

## Architecture

`Text / File → DocumentController(revision) → WorkerClient(backpressure, termination) → parser.worker → Runtime → Lossless AST`.

On parse: full AST is owned by one worker for one document revision, and a compact root/stats/diagnostics summary is posted to UI. On expansion: GET_CHILDREN(page) returns <=100 projections with *raw number previews*. On format: FORMAT returns lexically faithful output. On file import: PARSE_BYTES transfers original ArrayBuffer to worker (zero-copy ownership transfer), decodes UTF-8 strictly, and returns a source string once for editor display.

The transport has an allowlisted command set, no network fetch, no dynamic evaluation, and no secret-bearing logs. Calling `cancel()` rejects existing requests and terminates the worker; next parse starts a new worker. Workers are not allowed to mutate UI.

## Command contract (M03)

| Type | Payload | Reply |
| --- | --- | --- |
| PARSE | `{source}` | `{validSyntax,root,stats,diagnostics}` |
| PARSE_BYTES | `{buffer,bom}` | parse summary + `importedSource` where UTF-8 valid |
| GET_NODE | `{id}` | single projection |
| GET_CHILDREN | `{id,offset,limit<=100}` | bounded page; `nextOffset` |
| GET_SOURCE_SLICE | `{id}` | max 64KiB source slice and span |
| RESOLVE_POINTER | `{pointer}` | projection or ambiguity failure |
| FORMAT | `{indent}` | exact-token formatted text, bounded output |

Every message includes `requestId`, `docId`, `revision`. Only one active document revision is retained per worker. **This is not a scheduler for multiple independent simultaneous documents.** Multi-doc management is V0.5.

## Verification

- `npm test`: includes all previous 76 tests, plus at least 16 Worker/runtime/controller tests.
- `node --check`: all runtime, controller, UI and parser modules.
- Existing Python service regression: 17 tests.
- Direct real Node `worker_threads`: parse, query, hard cancel and restart, repeated rapid requests, bounded pending queue.
- Browser: Playwright spec tests exact number preservation, duplicate keys, formatting, XSS safety, stale edits, invalid UTF-8, opt-out/legacy fallback and no remote network requests.
- **Execution caveat:** local Chromium is sandbox-policy blocked from reaching every address even when HTTP serving/replaced by interception. CI job is the authoritative browser result once complete.

## Remaining before V0.3 GA

- M04 viewport virtualizer with scrolling 100k nodes, keyboard/ARIA, pointer-to-row expansion.
- M05 independent evaluator, cross-browser E2E, CI performance recording, memory and long-task inspection.
- Production errors in Worker may require actionable user-facing recovery rather than generic error.
- V0.2 legacy parser remains the default; promote only after M04/M05 gates.
- Optional Django `/api/parse/` still has a separate compatibility contract; avoid claiming all front/back semantics identical.
