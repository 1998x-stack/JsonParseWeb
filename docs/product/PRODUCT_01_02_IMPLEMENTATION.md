# PRODUCT-01 / PRODUCT-02 — Implementation and release review

**Status:** implemented on a feature branch derived from V0.3 PR #9, NOT on main. This is a beta product experience, not Product Hunt launch readiness.

## Product objective

Users can open a local-first page, click one of three synthetic JSON demos, see a real deterministic finding, inspect exact evidence in source, and copy original text without a JavaScript Number round-trip. No registration, content upload, external font, telemetry, or remote model request.

## Source / delivery map

| File | Responsibility |
|---|---|
| `index.html` | Public hero, self-contained demos, accessible workbench, i18n language control |
| `styles.css` | Responsive English-first site and evidence cards |
| `src/product/i18n.mjs` | en/zh product copy and synthetic fixture definitions |
| `packages/json-core/findings.mjs` | Lossless, bounded, deterministic precision and duplicate-key findings |
| `src/worker/runtime.mjs` | Run findings after parse, store within Worker, page via GET_FINDINGS |
| `src/worker/client.mjs` | Explicit allowlist GET_FINDINGS |
| `src/ui/findings-panel.mjs` | Accessible evidence issue cards with exact-copy and locate |
| `src/ui/virtual-tree.mjs` | Reveal by node ID for ambiguous duplicate-key paths |
| `src/ui/node-details.mjs` | English detail text when product mode active |
| `src/app.mjs` | Default engine, demonstrations, revisions, language, issue lifecycle |
| `tests/v03/product-findings.test.mjs` | Deterministic issue/worker/fixtures tests |
| `tests/e2e/product_v1_playwright.py` | Actual Chromium first-use, copy, locate, i18n, XSS, fallback, privacy |

## Findings contract

- `JSON.UNSAFE_INTEGER`: only lexically integral JSON number tokens outside ±(2^53−1); compare decimal digits as strings, not `Number`. Decimal/exponent precision diagnostics are future work and **not claimed**.
- `JSON.DUPLICATE_KEY`: compare decoded object key names, including `"a"` versus `"\\u0061"`, retain spans of both occurrences; a standards-compliant JSON Pointer cannot disambiguate them. Selecting an occurrence uses document-local NodeId.
- Both are **warnings about potential interoperability risks**, not syntax errors and not claims the API is definitely faulty.
- The Worker returns only a small parse summary; individual findings are retrieved in max-30 bounded pages. At most 100 findings retained; actual total and truncation are reported.
- Findings are tied to the parsed document revision. Editing/canceling invalidates them. Exact copy reads the corresponding UTF-16 source slice, without parsing or reserializing the number.

## Deliberate trade-offs

1. This batch deliberately does **not** implement multi-sample Schema Drift, JSON Schema inference, Diff, AI or >2MiB input. Those require independent product validation and dedicated tests.
2. Existing `?engine=v03` and `?engine=v03&virtual=1` routes remain backward-compatible with M03/M04 test flows; default `/` is the product shell with Worker/virtual views on when supported.
3. Full UI translation of **legacy** errors, all virtual tree status text and backend messages is not in scope; the primary product first-use flow, finding text, detail panel and controls support en/zh. Do not claim 100% localization yet.
4. Core local processing makes no automatic upload but a statically hosted page naturally loads same-origin assets on first visit. Do not claim total network isolation without offline bundle/network audits.
5. Scope of security check is no source value inserted via `innerHTML`; cards use `textContent`, and synthetic-marker network tests run in real browser CI.
6. No GitHub Pages deployment or product domain is enabled by this PR.

## Verified gates (populate with actual result only)

- Existing V0.3 130 Node tests and new 12 findings tests.
- Independent M04 evaluator, unchanged.
- Browser Playwright E2E in GitHub Actions — the authoritative browser result; local container Chromium may be blocked by admin policy.
- Python backend regressions remain separate and untouched.

## Follow-up

**PRODUCT-03:** sample-observed field/type/null distributions, confidence labeling and SourceSpan examples. Later: verified privacy bundle, permissions, published documentation, and first-use usability testing with external participants before PH launch.

**Dependency:** merge/review PR #9 before promoting this PR to main; do not rebase onto V0.2 and silently delete its unmerged changes.
