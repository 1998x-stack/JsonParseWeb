# PRODUCT-04 — Evidence Report & Privacy Proof

**Status:** Implemented in feature branch; release readiness is determined by actual CI and independent privacy review. Not yet deployed to production.

## User value and scope

- Default export is **privacy-first**: it includes only stable rule identifiers, counts, severity, limited sample type distributions, the report version and explicit caveats. It excludes JSON source, decoded keys, filenames, paths/pointers, snippets and source values.
- User can choose *Detailed evidence* and build a local preview. In that mode, the report may contain sensitive key names, paths and excerpts; copying and download remain disabled until a separate review checkbox is checked. The preview renders as inert text and includes the complete report within a 200,000-character budget.
- JSON and Markdown are generated locally. No report or source content is sent to a server by product code. Clipboard and file download are explicitly initiated by the user.
- The schema drift report describes *observed samples*, not confirmed API contract violations; it retains counts and truncation status. Supplemental file content is not embedded in any export. The privacy-first report strips even supplemental filenames and field names.
- Source or drift-analysis changes invalidate already prepared reports and confirmations. Worker document revisions reject stale data.
- `privacy.html` documents actual data handling, limits, developer-tools verification, failure modes, and how to run a reproducible browser test.

## Implementation changes

| File | Responsibility |
| --- | --- |
| `src/product/evidence-report.mjs` | Pure allowlist model, bounded evidence, safe JSON/Markdown serialization |
| `src/ui/evidence-report-panel.mjs` | Preview, sensitive-mode opt-in, review confirmation, local copy/download |
| `src/app.mjs` | Lifecycle, explicit data source, revision-aware report integration |
| `src/ui/schema-drift-panel.mjs` | Report invalidation on drift updates and file changes |
| `src/product/i18n.mjs` | English / Chinese report labels |
| `index.html`, `styles.css` | Responsive accessible report controls, CSP meta restriction |
| `privacy.html` | Local data flow and limitations, no third-party script |
| `tests/v03/evidence-report.test.mjs` | Deterministic redaction/precision/duplicate/schema safety tests |
| `tests/e2e/product_v1_privacy_report_playwright.py` | Real Chromium clipboard, download, opt-in, stale state and network/storage checks |
| `.github/workflows/ci.yml` | Browser test enabled in CI; JS syntax check |

## Security boundaries

1. The **privacy-first default is not a guaranteed anonymization service**. Aggregate counts or supported rule identifiers can reveal structural patterns. Users should inspect the report before sharing it.
2. Detailed reports are *not* redacted. They may expose property names, JSON pointers and raw snippets. Confirmation is required for local export, but the tool does not detect all secrets.
3. Clipboard/download may be visible to the device operating system, other local applications and users. These are not remote uploads by JsonParseWeb, but they are downstream disclosure channels.
4. Meta CSP is an extra layer, not a complete network proof for every browser or hosting environment. It restricts `connect-src` and third-party scripts on the checked-in HTML; it does not protect against compromised hosting or malicious browser extensions.
5. The browser test checks requests and persistent storage on a synthetic marker. Its findings are limited to the tested Chromium build; Safari/Firefox and accessibility screen readers need follow-up verification.
6. Existing input limits remain 2 MiB and current AST resource bounds. No >2MiB promise.

## Reproducible validation

```bash
npm test
npm run evaluate:m04
python -m pytest tests/python/test_service.py -q
python -m http.server 8765 --bind 127.0.0.1
# second shell; Chromium must be installed
python tests/e2e/product_v1_privacy_report_playwright.py
```

Expected browser flow: paste a synthetic secret marker, build privacy-first report (marker absent), build detailed report (marker appears), require explicit review, download locally, edit JSON (old report disappears), check no content-bearing requests and no persistence.

## Remaining before PRODUCT-05

- Fully independent manual review of privacy assumptions and static artifact scanning.
- Firefox and WebKit compatibility, keyboard and screen reader field checks where runtime supports them.
- Production CSP should be enforced by HTTP response headers at hosting layer, not only a meta element.
- Real public static deployment, privacy page accessibility, canonical/OG assets, LICENSE and launch content.
- External user tests of report comprehensibility and willingness to export sanitized summaries; no user testing has been performed as part of this engineering PR.
