# V0.3 — Golden corpus, independent evaluator and performance matrix

This file is a **test plan**, not an execution report. Every expected value below describes future assertions. All fixtures must be deterministic and source-controlled or generated from a pinned seed.

## 1. Golden fixture format

```json
{
  "caseId": "numbers/unsafe-integer",
  "source": "{\"id\":9007199254740993}",
  "acceptSyntax": true,
  "expected": {
    "nodes": 2,
    "keys": 1,
    "numericLexemes": ["9007199254740993"],
    "duplicateKeyCount": 0
  },
  "diagnosticCodes": []
}
```

Golden inputs also store expected `tokens: [{kind,start,end,raw}]`, ordered members, pointer resolution, and formatter output hash. Source hashes ensure a fixture cannot change without reviewing its expectations. `source` may instead specify a generator `{id, seed, parameters}` for large cases.

## 2. JSON syntax and numeric fidelity vectors

| Case ID | Input | Syntax | Expected |
| --- | --- | --- | --- |
| T01 | `null` | valid | one null root node |
| T02 | `false` / `0` / `""` | valid | distinct root scalar kinds |
| T03 | `{"id":9007199254740993}` | valid | exact raw numeric text retained |
| T04 | `[-0,1.00,1e+9999,1e-9999]` | valid | token spelling remains unchanged after format |
| T05 | `{"a":1,"a":2}` | valid + warning | two ordered members, duplicate diagnostic |
| T06 | `{"a":1,"\\u0061":2}` | valid + warning | duplicate detected after decoded key comparison |
| T07 | `{"__proto__":{"x":1}}` | valid | no prototype mutation |
| T08 | `{"a/b":1,"m~n":2,"":3}` | valid | pointers `/a~1b`, `/m~0n`, `/` |
| T09 | `[true,null,{"n":1.2e3}]` | valid | ordered AST with exact numeric raw |
| T10 | `{"bad":01}` | invalid | leading zero diagnostic |
| T11 | `{"bad":1.}` | invalid | missing fractional digit |
| T12 | `{"bad":1e+}` | invalid | missing exponent digit |
| T13 | `{"bad":NaN}` | invalid | unknown token |
| T14 | `{"bad":Infinity}` | invalid | unknown token |
| T15 | `{"bad":1,}` | invalid | trailing comma |
| T16 | `// comment\n{}` | invalid | comments unsupported |
| T17 | `{"a":"line\\nfeed"}` | valid | quoted string raw and decoded forms distinguished |
| T18 | `{"a":"raw<TAB>control"}` | invalid | unescaped control char |
| T19 | `{"x":"\\uD800"}` | syntax-valid, interoperability warning | raw token retained |
| T20 | UTF-8 bytes with an invalid sequence | invalid input | fatal file decoding error |
| T21 | UTF-8 BOM + `{}` | policy-based | warning and explicit allowed/denied behavior |
| T22 | `{} 123` | invalid | trailing token diagnostic |
| T23 | nested array at depth 129 | resource error | depth cap during parser |
| T24 | object with 50,001 total members | resource error | key cap during parser |
| T25 | document with 100,001 nodes | resource error | node cap during parser |

**Special note:** Empty-key `/` is different from root `""` pointer. Duplicate key `/a` is ambiguous; `resolvePointer` must return `AMBIGUOUS_MEMBER` rather than arbitrary first/last member.

## 3. Token positions, Unicode and exactness

- UTF-16 positions: cover ASCII, `中`, CRLF, and astral symbols (emoji as surrogate pairs). Every token span `source.slice(start,end)` must equal expected token raw text.
- Diagnostics: `line` and `column` are derived from LineIndex for a span's start; test first character, first character after LF/CRLF, and EOF.
- Escapes: `\\u0061` must decode to `a` for duplicate detection but preserve raw spelling for export.
- Original export: byte-for-byte equal to the originally imported valid UTF-8 file when no source modification occurs; keep BOM handling explicit.
- Formatting: source token sequence before and after must be identical in kind/content/order; formatting twice should produce identical text.

## 4. Property-based and differential testing

- Generate valid grammar trees with bounded depth and number lexemes (including decimals/exponents). Serialize with the test generator **without JS number conversion**.
- Generate invalid mutations (delete colon/quote, insert trailing comma, leading zero, truncate escape) with expected failure.
- Syntax differential: `JSON.parse` should agree on well-formed strings, excluding resource caps and documented BOM/interoperability policies; numeric values need not match.
- Numeric oracle: compare raw token parsing with `lossless-json` for supported numeric semantics, **not** its AST spans or duplicate-key retention.
- Python checks: compare canonical counts and duplicate diagnostics on shared fixtures, but do not treat a JSON-native Python response as evidence of JavaScript number fidelity.
- Fuzzing: fixed seeds in CI, longer fuzz runs scheduled separately, all crashes/minimized regressions added to corpus. No unbounded test generating memory exhaustion.

## 5. Browser interaction E2E

| Scenario | Test assertion |
| --- | --- |
| Paste > parse > tree | Status valid, root and children accessible, no network request |
| Unsafe integer | Tree and raw view show `9007199254740993` exactly |
| 100 rapid edits | Final revision only; no stale Worker reply |
| Cancel pending parse | No old result appears; worker recovers |
| Expand 10k children | DOM treeitem count stays <= 400 |
| Pointer navigation | Ancestors expand and selected node appears in viewport |
| Duplicate key | Two rows remain and warning location points to second key |
| Long strings | Truncated row preview, full side-panel value and raw copy |
| Import invalid UTF-8 | Error shown; no replacement-character silent parsing |
| Format twice | Identical source after second format |
| Export unmodified | Exact source bytes preserved |
| Keyboard-only | Roving selection, arrow navigation and expand/collapse work |
| HTML-looking values | Rendered as literal text, not DOM elements |
| Switch views while Worker busy | No stale and no unhandled exceptions |

Run Playwright with a real HTTP server; instrument `page.on('request')` and assert no remote POST on local path. Browser tests must run in CI and use a fixed viewport and build.

## 6. Performance and robustness

Generated cases (do not commit gigantic raw fixtures):
1. `small-nested`: 10 KiB, nested objects and arrays, verify stats.
2. `medium-flat`: 256 KiB, 5,000 small entries, verify flatten and scroll.
3. `large-mixed`: ~2 MiB under 100,000 nodes, nested plus wide arrays; hard baseline.
4. `deep-boundary`: exactly depth 128 accepted, depth 129 rejected.
5. `wide-boundary`: exactly 50,000 keys accepted, 50,001 rejected (subject to size cap; tune value length so both limits can be isolated).
6. `over-limit`: >2 MiB fails before expensive parse.
7. `duplicate-stress`: many repeated object keys, bounded diagnostics cap.

Note fixture isolation: if testing keys limit, set large enough byte/node budgets in pure parser tests, otherwise the size cap may trigger earlier; verify **which** limit is enforced. The same applies to depth and node tests.

Record P50/P95 parse ms, number of transferred bytes, JS heap estimate when available, max main-thread long task, max mounted DOM treeitems, time to scroll to node. Run 10+ warm iterations on a pinned environment; separate hard correctness/resource gates from performance trend alerts.

## 7. Independent evaluator rules

- Test runner and evaluator must not share expected-result generation code.
- Evaluator reads fixture manifests + observed machine-readable JSON reports and verifies semantic invariants.
- A pass requires: no unexpected syntax acceptance/rejection; exact numeric raw; member multiplicity/order; source-position validity; pointer ambiguity handling; no unsafe HTML insertion; bounded DOM.
- Performance changes are compared against recorded baseline under comparable environment details, not asserted from subjective impressions.
- Report fields `{version,sha,fixtureSha,environment,gateStatus,failures,regressions,benchmarks}` are saved as CI artifacts.

## 8. Exit checklist

- [ ] M00 baseline corpus checked in
- [ ] M01 lexer / source maps and tests merged
- [ ] M02 lossless AST, number and pointer golden tests merged
- [ ] M03 Worker/cancel/formatter tests merged
- [ ] M04 virtual tree and browser E2E merged
- [ ] M05 CI + evaluation report green
- [ ] No raw user JSON logged or sent to server by default
- [ ] Release docs, rollback switch and known limits reviewed
