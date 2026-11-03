# V0.3 implementation batch M00–M02 — verification report

**Status:** implemented in a standalone ESM core; does **not** enable V0.3 in the browser UI.
**Code:** `packages/json-core/*.mjs`; tests: `tests/v03/lossless.test.mjs`.

## Actual checks (local container, 2026-11-03)

- Node 22.16.0, `npm test`: 76 tests passed (19 V0.2 regression cases + 57 V0.3 cases).
- Python 3.13.5, `python -m pytest tests/python/test_service.py -q`: 17 tests passed.
- `npm run bench:core`: deterministic 1,000 / 10,000 / 40,000-element arrays; results are printed as JSON with runtime details and no claims of broad device guarantees.
- `node --check` applied to all core modules.
- Django API integration: not executed locally (Django package unavailable in container); check GitHub CI after push.
- Browser E2E: not executed for V0.3; no V0.3 UI integration included in this batch.

## Verified invariants

- All valid primitive root types, objects and arrays.
- Lossless raw lexemes for `-0`, `1.00`, `1e+9999`, `1e-9999`, `9007199254740993`.
- Duplicate members retained, including escaped-equivalent member names; warning capped but exact duplicate count retained.
- Explicit duplicate rejection policy, with validSyntax error only when strict policy is requested.
- JSON Pointer escapes / ambiguous members; `__proto__` treated as ordinary key.
- Unicode source offsets, malformed escapes, unescaped surrogate rejection, escaped-surrogate compatibility warnings.
- Fatal UTF-8 decoder, explicit BOM policy, byte cap before decoding.
- Format idempotence and source token order preservation on 500 generated grammars.
- Exactly 100,000 nodes accepted, 100,001 rejected; exactly 50,000 members accepted, 50,001 rejected when other caps allow.

## Follow-up priority

1. M03: move parse and source ownership to Web Worker; enforce `docId/revision/requestId`, hard cancellation, controlled transport sizes, and importFile fatal decoder.
2. M04: viewport row virtualizer (not just `<details>` collapse) and source navigation using the AST index.
3. M05: browser end-to-end tests, independent evaluator, pinned dependencies and reproducible performance artifacts.

## Important boundary

Do **not** treat this branch as a finished V0.3 release. Its purpose is to validate the new data model independently before rewriting the UI. V0.2 remains available and unchanged for rollback.
