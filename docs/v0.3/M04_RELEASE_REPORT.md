# V0.3 M04 Release Review — Consolidated Core PR

Status: **release candidate; not production GA**. The single PR to main consolidates the complete M00–M04 feature stack.

## Included scope

- **M00–M02:** lossless Tokenizer/AST, exact numeric lexemes, ordered duplicate members, UTF-16 spans, RFC 6901 Pointer and strict UTF-8.
- **M03:** Worker-owned AST, hard cancellation, bounded queries and revision-aware document controller.
- **M04-A/B:** visible preorder, epoch-safe expand/collapse, atomic reveal, bounded tree-window protocol.
- **M04-C:** viewport virtual tree, keyboard/ARIA semantics, stale reply protection and paged rollback.
- **M04-D:** Pointer navigation, node details, source highlighting and exact source copy.
- **M04-E:** ordered object-array union columns, distinct duplicate occurrences, missing vs null, exact numeric text, two-axis virtual table.
- **M04-F:** independent black-box evaluator, synthetic benchmark report and actual Chromium E2E quality gates.

## Contracts

GET_TABLE_SCHEMA accepts offset/limit (limit at most 24) and returns a bounded column page for top-level JSON arrays.
GET_TABLE_WINDOW accepts table epoch, row offset/limit (at most 80), column offset/limit (at most 24), with an additional cap of 800 requested cells.

A present JSON null has state present, kind null, preview null; a missing property has state missing. The Worker retains the complete AST. UI only asks for bounded windows, at most 48 rows and 16 data columns. No default network upload is introduced.

## Validation and release gate

Local checks: npm test, npm run evaluate:m04, Python core pytest, node syntax checks.
GitHub CI jobs: frontend, backend, browser-e2e (M03/M04-C/M04-D/M04-E scripts), independent-evaluation. The independent synthetic report is uploaded as a JSON artifact and includes P50/P95 with environment details. Numbers are not browser UX guarantees.

Critical fixtures: 100,000 AST nodes, 50,000 distinct keys, duplicate names, missing/null, exact unsafe integers, 1.00, -0, exponent notation, HTML-looking text, long scalar, cross-version stale requests, horizontal/vertical scroll and privacy.

Do not describe browser tests as passing until the actual CI job is green. Default V0.2 and M03 paged fallback remain available. Do not directly merge without green CI and review.

## Explicit limitations

This is a V0.3 release candidate behind opt-in Worker/virtual modes, not GA. A manual screen-reader check and Firefox/WebKit compatibility remain necessary before wider rollout. 2 MiB/depth 128/50k keys/100k nodes budgets remain enforced. JSON Schema, JSONPath language, diff/edit/undo, huge-file streaming, multi-document management and plugins belong to future V0.4/V0.5 work, not M04. The optional Django v1 response is not a lossless numerical transport contract.

This consolidated branch starts from the latest main and supersedes, rather than merges independently, the historical stacked M04 feature PRs.
