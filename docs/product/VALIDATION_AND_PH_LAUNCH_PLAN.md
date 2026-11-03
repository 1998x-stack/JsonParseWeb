# JsonParseWeb V1.0 — Validation, Release & Product Hunt Playbook

**状态**：Proposed. No interviews, market conversion measurements or V1 release have yet been executed.
**Companion**：[PRODUCT_V1_PRD.md](PRODUCT_V1_PRD.md) · [VoC research](PH_HN_VOICE_OF_CUSTOMER_2026-11-03.md)

## 1. Success is an externally judged user outcome

Primary goal: developer can detect and verify one meaningful JSON interoperability/data-shape issue faster or more accurately than with their usual workflow, without transferring the document.

**North Star (not pageviews)**:
`verified_issue_resolution_rate = correctly diagnosed and source-located tasks / eligible benchmark tasks`
Use closed-form, expert-labeled tasks only; in production, the user's true resolution is unknown, so don't infer “fixed” from button clicks.

### Metric dictionary

| Metric | Numerator / denominator | Collection method | Privacy |
|---|---|---|---|
| TTFV | elapsed from demo click to first meaningful acknowledged finding | controlled test observer, synthetic fixture | no real payload |
| TTD (time to diagnosis) | elapsed from task start to accurate explanation + source evidence | independent human judge + stopwatch | no payload logged |
| Completion accuracy | correct risk and precise location / attempted tasks | pre-registered golden answer | no real payload |
| Misleading findings | alerts incorrectly stated as confirmed bug / alerts | reviewer audit of held-out cases | synthetic/consented |
| First-try comprehension | participants who explain product in own words / all participants | interview rubric | aggregate |
| Confidence calibration | users correctly distinguish “warning” from “observed anomaly” | short scenario questions | aggregate |
| Privacy regression | count of unauthorized content-carrying requests/ storage writes | Playwright network+storage probes | only synthetic marker |
| Browser crash | CI run P0 errors, OOM, renderer crash | test-runner reports | no user content |
| Performance | P50/P95 parse+finding time, heap peak, long tasks | pinned reference fixture/devices | synthetic data |
| Product Hunt engagement | referral visits and qualitative comments | public PH page and optional consented aggregate counts | do not count votes as product utility |

**Product Hunt Top 5 is an external aspiration, not a team-controlled success guarantee.** Core product success is task value and retention of genuine adopters.

## 2. Qualitative research protocol (first 15 participants)

Balanced recruitment: five backend engineers, five frontend engineers, five API/data integration or AI-agent engineers. Include a mix of novice/advanced and teams with sensitive data. Avoid recruiting only existing friends who praise the product. Participation entirely voluntary.

### 20-minute semi-structured interview

1. "Tell me about the last time an API JSON payload surprised you. What happened next?"
2. "Which tools did you open, in what order, and why?"
3. "Which parts of the file were confidential? Which tools were allowed by policy?"
4. "Show me how you find one unexpected type, null, duplicate or inconsistent field."
5. "What makes a diagnostic credible rather than noisy?"
6. "When is tree view better than text search or jq? When isn't it?"
7. "Which device or editor do you normally use? Would opening a second website be acceptable?"
8. "Do you need files over 2MiB? What's the median and maximum real sample size?"
9. "What would you export for a teammate to reproduce the issue safely?"
10. "What would make you avoid this tool, even if it worked?"

### Rules
- **Do not ask participants to upload real proprietary JSON.** Supply synthetic fixtures or allow local-only use with no recording of sensitive content.
- Avoid leading questions ("Would you love our AI feature?").
- Capture exact participants' phrases with permission, task sequence and where they hesitated. Separate interviewer observations from participant statements.
- Do not report a made-up sample proportion; publish `n` for each result and describe selection bias.

## 3. Controlled comparative usability test

**Task set** (expert-graded answers pre-registered):
- T1 numeric precision `9007199254740993`, exact evidence offset and safe interpretation.
- T2 escaped duplicate key `"a"` vs `"\\u0061"`, explain parser-dependent behavior.
- T3 object-array mixed type and missing-vs-null; report actual observed sample count.
- T4 locate node using path containing / and ~; test path encoding.
- T5 (post-V1-Diff) compare two payloads to find removed/mutated fields.

**Method**:
- Randomize order of JsonParseWeb vs comparator (user's actual current tool: VS Code, jq, alternate JSON viewer).
- Use matched difficulty input pairs to reduce learning effect.
- Record objective correctness, TTD, visible hints and severe failures; blind-grade submitted results where possible.
- Usability severity score: critical (blocks task/data loss), major (rework), minor (confusing), suggestion.
- One predeclared reference task and at least 20 held-out cases; don't tune product only on held-out set.

### Proposed go/no-go (aspirational, no data yet)

| Gate | Threshold | Failure response |
|---|---|---|
| First-value comprehension | >=12/15 explain value without guidance | simplify landing/demo |
| 60s demo task | >=80% find+locate in <=60s | reduce clicks/simplify issues |
| Core task completion | >=90% of attempted benchmark tasks | repair correctness first |
| Accuracy | >=95% for deterministic precision/duplicate cases, with no critical false claims | block launch |
| Privacy | 0 unauthorized content-carrying requests/ persistence writes in test | block launch |
| Security/data integrity | 0 P0 source mutation, silent numeric rounding, duplicate deletion or XSS issues | block launch |
| Reliability | all targeted CI and browser E2E green | block launch |
| Competitive advantage | >=20% relative median task-time improvement OR material correctness improvement, with enough paired tasks | rethink primary value proposition |
| Performance | record measured P95 for ≤2MiB and assess against current alternatives | publish transparent limits |
| Cross-browser | Chrome/Firefox/Safari tested on named versions or explicitly disclose untested | limit claims |

The >=20% target is a hypothesis for product validation and not evidence of achieved uplift.

## 4. Feature-specific independent tests

### Numeric and duplicate-key fixtures
- Golden JSON lexical sequence (raw numbers, quoted key spans, repeated members) before/after formatting, copy/export.
- Negative corpus: JSON comments, NaN, trailing commas, truncated numbers, unpaired surrogate cases, invalid UTF-8.
- No implicit `JSON.parse` or JSON.stringify of authoritative numerical data.
- Warnings explain that a large JSON number remains syntactically valid; no “JSON invalid” misclassification.

### Drift observations
- 8 number + 2 string `price` -> 8/10 and 2/10; raw examples.
- 2 objects (1 missing) -> distribution only if threshold >=3 examples, not noisy anomaly.
- `null` explicitly present vs field absent.
- Array mixed primitives/objects -> no untrue object-field schema.
- Duplicate key in an object-array member -> preserve occurrence and diagnostic.
- Sample bias note, observations not guaranteed server schema.

### Privacy
- Generate unique synthetic marker (never real secret).
- Inject marker into pasted source; check all network requests from page/worker/service-worker via Playwright and browser proxy where possible.
- Inspect localStorage, IndexedDB, CacheStorage and service worker registries; document any explicitly user-approved persistence and ensure it cannot later upload.
- Confirm copy and downloadable report only after direct user gesture; no URL query/hash with source values.
- Static asset loading ≠ sending user's document content. Describe distinction accurately.
- CSP, SRI/dependency pinning, no unsafe HTML, deterministic build/source audit.

### Performance
- Input fixtures 10KiB / 256KiB / 1MiB / 2MiB, 100k AST nodes separately where size permits.
- Timing labels: `parse`, `firstFinding`, `firstRender`, `expand`, `scroll`, `copy`.
- Browser and hardware recorded, cold and warm separately; >10 runs for distribution.
- Memory peak and long tasks; no claims of 50MB support while cap is 2MiB.
- Large-capacity research stage must redesign parsing budgets, streaming and UI separately.

## 5. Feature rollout in five PRs

| PR | Scope | Blockers | Reviewer evidence |
|---|---|---|---|
| PRODUCT-01 | production shell / English+Chinese / remove experiment flags / demos | V0.3 merge/integration | screenshot+browser first-run test |
| PRODUCT-02 | Findings engine R-01, R-02 and SourceSpan evidence cards | tokenizer/AST | independent golden fixtures + exact raw copy |
| PRODUCT-03 | object-array and multi-sample schema observation, explicit confidence | findings contract | distribution/false-positive tests |
| PRODUCT-04 | evidence-first UX, redacted reports, privacy proof and accessibility | findings/observations | task sessions + browser privacy/ARIA |
| PRODUCT-05 | public deployment, reproducible docs, release gate, PH assets | all P0 | externally accessible production + network/CI logs |

Rollout feature flag remains until each implementation passes its own gates. Never merge PRD as if runtime features are delivered.

### Dependencies / repo integration
- Existing [M04 consolidated PR #9](https://github.com/1998x-stack/JsonParseWeb/pull/9) must be reviewed. Current `main` does not yet contain V0.3 features at the time of this research.
- Research PR branches directly from `main`, documentation only; later PRODUCT PRs should start from the **actual merged** runtime baseline, not stale branches.
- Confirm LICENSE before marketing as Open Source; public GitHub read access alone is not an open-source grant.

## 6. Positioning experiments

### Variants
A: `Find hidden JSON bugs without uploading your data.`
B: `Your JSON is valid. But is your data reliable?`
C: `Inspect API responses with exact, local evidence.`

Test comprehension with strangers; ask each what problem the product solves and to predict what clicking Demo will do. Do not optimize only click-through without task outcomes.

**Do not pitch** `AI JSON detective`, `unlimited JSON`, `all bugs found`, `100% secure` unless substantiated (and some claims cannot be substantiated categorically).

## 7. Go-to-market channels

1. Product Hunt: make product live, free to try with 3 demos and demo video.
2. Hacker News: post technically detailed Show HN explaining why numeric lexeme retention, duplicate names and privacy are hard; share repo and reproducible benchmark rather than inflated marketing.
3. GitHub: clear README, LICENSE and architecture diagram, fixtures, screenshots and independent eval report.
4. VS Code/browser extension: do only after users prove context switching is a blocker; extension permissions strict/least privilege.
5. Targeted communities: answer real JSON debugging questions with transparent limitations; avoid spam or templated AI comments.

## 8. Product Hunt publishing checklist

Based on [official PH Launch Guide](https://help.producthunt.com/en/articles/17350772-launch-guide) and [Featuring Guidelines](https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines):
- [ ] Product live and immediately usable, not a waitlist.
- [ ] Tagline <=60 characters, short description <=260 characters (count against final draft).
- [ ] Clear product gallery of **actual** current features (not promised mockups).
- [ ] Brief recorded walkthrough including privacy proof and one diagnosis.
- [ ] Maker introduction human-written in genuine voice, with no invented traction.
- [ ] Genuine user feedback from beta, including limitations and responses.
- [ ] No incentive/requests for upvotes; no bot/AI-generated comments.
- [ ] Linked GitHub repo LICENSE, reproducible build, support/feedback route.
- [ ] Monitoring for site availability and feedback during real launch; do not schedule until all hard gates green.

### Suggested 45-second video script / shot list
0–5s: Raw JSON appears innocuous; one-click sample.
5–12s: The precision trap is detected and raw exact integer shown.
12–20s: Click evidence, SourceSpan highlights text; duplicate-key second occurrence.
20–30s: Compare user-supplied schema samples and explain observed vs certain.
30–38s: Open privacy/network proof / offline mode (only if actually shipped).
38–45s: Download sanitized evidence, call to action `Try with a sample`.

All footage must use an actual working build. No artificially edited product claims.

## 9. Product Hunt user feedback: tagging protocol

When feedback comes in, label each comment:
`{source_link, date, product_version, theme, request_or_observation, status, confidence, affected_persona, reproducible_case, severity, consent_status}`.
Separate `compliment`, `feature request`, `bug report`, `workflow question`, `pricing objection`, `privacy concern`.
After launch, publish weekly issues triage and actual engineering resolutions. Do not silently gather raw example JSON from commenters.

## 10. Red-team review

Ask independent reviewers to try to prove the product false:
- Can an ordinary `JSON.parse` pipeline already solve a stated pain faster?
- Can a large sample cause main-thread lock despite virtualized view?
- Can the product miss an ambiguous duplicate and present a fake RFC 6901 pointer?
- Does a redacted report still leak property names, URL or tokens?
- Are anomaly findings actually ordinary valid variation?
- Does the UI claim 100% local while analytics/asset calls include payload data?
- Does the documentation imply >2MiB support or guarantee no false negatives?
- Is this a differentiated product, or another graph-focused JSON viewer clone?

Release only when documented failures are corrected or explicitly disclosed.

## 11. Decision

**Proceed** with PRODUCT-01 and PRODUCT-02 spec/code after merging the correct V0.3 runtime baseline.
**Do not release** if precise data fidelity, privacy and independent diagnosis results are not measured.
**Do not prioritize** pricing, AI agent or large-file marketing before validating a small repeatable user job.
