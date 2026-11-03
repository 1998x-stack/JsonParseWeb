# JsonParseWeb Product V1.0 — Evidence-first Lossless JSON Debugger PRD

- **状态**：Proposed / research-backed direction，尚未实施 V1 功能
- **产品 Owner**：待确定
- **研究输入**：[PH_HN_VOICE_OF_CUSTOMER_2026-11-03.md](PH_HN_VOICE_OF_CUSTOMER_2026-11-03.md)
- **技术输入**：当前 `main` 为 V0.2；V0.3 M04 核心能力位于尚未合并的 [PR #9](https://github.com/1998x-stack/JsonParseWeb/pull/9)
- **原则**：更深的用户价值，而非更多菜单；独立证据判断成败；公开源码与可重复测试优于自我评分
- **定位**：Find hidden JSON problems. Inspect the source evidence. Keep your data local.

## 1. Executive Decision

停止向“功能最多的在线 JSON Formatter”发展，打造面向**API 调试 / 数据集成 / AI Agent JSON 日志**的高可信无损检查工作台。

**核心 Job To Be Done**：
> 当我拿到陌生或变化的 JSON API 响应，希望在不上传敏感数据的情况下，快速判断“哪里有潜在错误 / 为什么有风险 / 证据在原文哪里”，而不是先翻阅几万行或写 jq 脚本。

**首发 One-liner**：`A private, lossless JSON debugger that finds hidden data problems and proves where they are.`

### Goal beyond the goal
1. 让 JSON 可读（行业已满足；不是差异化）。
2. 让 JSON 里的潜在问题可解释、可定位、可审计（V1 主目标）。
3. 把 API 变更和数据异常变成可重复的开发流程检查（V1.1 / VS Code / CI；须先验证需求）。

## 2. Personas / Tasks

| 角色 | 使用场景 | 典型输入 | 成功定义 | 证据 |
|---|---|---|---|---|
| Backend / API 工程师 | 第三方 API 返回类型意外变化 | 一或多份 JSON 响应 | 识别字段类型与缺失情况、定位原文 | HN-08、HN-14 |
| Frontend / TypeScript 工程师 | 大整数 ID 进 JS 后失真 | 小/中型 API 响应 | 知道风险发生点，保留原始数字 | HN-09 |
| 数据集成工程师 | 多批数据结构不一致 | 数个同一 API 的样本 | 区分已观察到的变化 vs 推测 Schema | HN-04、HN-08 |
| 企业开发者 | 不能把内部数据上传陌生网站 | 内部配置 / API 样本 | 核心工作流无内容上传，可离线复核 | HN-01、HN-02 |
| CLI / IDE 高阶用户 | 想比 jq 更直观地查看“即将提取什么” | JSON + 路径/查询 | 查询结果即时预览/复制 | HN-14、PH-02 |
| 大文件用户 | 打开后卡顿、崩溃且无反馈 | >2MiB 文件 | 诚实提示限制、保留文件、不丢数据 | HN-05、HN-07、HN-12、HN-13 |

**V1 明确不承诺**在 2MiB 限制内满足 16/50/650MB 需求；将其作为独立大文件研究方向。

## 3. Product Principles

1. **Evidence over decoration**：问题卡片必须链接到确切证据和处理条件，不能只显示 AI 式泛化结论。
2. **Lossless by default**：数字 token、重复键、源码顺序、原始字符串转义不可无提示改写。
3. **Local by default, inspectable by design**：无账号、无内容上传、无默认遥测；下载/复制/联网能力逐项明确授权。
4. **Fast first value**：首次访问打开示例即显示第一条诊断；无工程术语门槛。
5. **Compete with existing workflow**：用任务正确率、时间与信任，对照 VS Code / jq / 用户原有工具；若没有优势，则撤销该功能。
6. **Explicit limits**：2MiB、深度/节点数、列/窗口上限和失败原因必须可见。
7. **Low surprise**：不偷偷格式化、修改、上传、保存用户文件；诊断属于观察和风险，不是事实修复结论。

## 4. 信息架构与第一屏

### Routes
- `/`：英文为默认的 Product Landing。单句话价值、三个可点击可复现 Demo、隐私证据入口、代码与使用示例。避免自动轮播。
- `/app`：Workbench。无需账户、可直接 Paste、Drop、Try a Sample。
- `/privacy`：威胁模型、网络/存储行为、如何独立复现验证。
- `/examples`：仅内置公开/合成的三个可重现故障用例。
- `/docs`：精度与重复键解释、证据语义、限制与 API，前提是有清晰可导航的静态内容。

### Workbench 信息层级

```
Header: Logo | Local / Offline evidence | Documentation | GitHub
Input:  Paste JSON [drop local file] [Try sample]  [Analyze]
Summary: 2 findings · 1 warning · 1 observation | 2 MiB limit info
Tabs: [Issues (default)] [Explore Tree] [Table] [Compare (when available)]
Issue list: [type] [finding] [impact + limitations] [locate source] [copy evidence]
Source: split editor + source highlight, synchronized with selected issue
Detail: raw lexeme | decoded value preview | path/occurrence | span | copy exact
Footer: browser-only disclosure | version | source link | feedback
```

On mobile: Input and Issues first; Tree and Source as tabbed panes, avoid unusable 3-column layout.

### First-time flow — 30 seconds
1. Landing CTA `Try a precision trap` (no signup, no external content).
2. Loads a synthetic sample `{"orderId":9007199254740993,"status":"ok"}`.
3. Immediately parses and shows `NUMERIC_PRECISION_RISK` with exact token and explanation; label "Warning for JS consumers", NOT "invalid JSON".
4. Click `Locate evidence`: highlight original span; Tree shows same raw lexeme.
5. Click `Copy exact value` or `Copy redacted example`, no serialization through native Number.
6. Optional switch `Duplicate key`, `Schema drift`.

**First-value contract**: the user should be able to answer “what's wrong, where, why it matters” without understanding AST, SourceSpan, Worker or virtualized rows.

## 5. Scope / Backlog decision

| ID | Requirement | Release | Why | State |
|---|---|---|---|---|
| V1-01 | Remove experiment toggles; default to validated lossless Worker | P0 / launch | Current advanced mode hidden | planned |
| V1-02 | English-first i18n, Chinese option | P0 / launch | PH audience accessibility | planned |
| V1-03 | Three one-click sample scenarios | P0 / launch | 30s demonstrability | planned |
| V1-04 | Issue engine with evidence-to-source jump | P0 / launch | Product differentiation | planned |
| V1-05 | Unsafe numeric lexeme warning | P0 / launch | HN-09 | parser exists, UI rule pending |
| V1-06 | Duplicate decoded-key diagnostic | P0 / launch | source-preserving AST exists | parser exists, issue card pending |
| V1-07 | Observational schema drift on object-array + multi-sample | P0 / launch | HN-04, HN-08 | planned |
| V1-08 | Dataset-safe redacted evidence export | P0 / launch | Privacy and sharing | planned |
| V1-09 | Privacy proof and no outgoing content requests | P0 / launch | HN-01, HN-02 | planned/release gate |
| V1-10 | Structured two-document Diff | P1 / after core | HN-11, HN-18 | planned |
| V1-11 | Search + path extraction preview | P1 | HN-14, HN-19 | planned |
| V1-12 | CSV/TSV export for compatible flat tables only | P1 | PH-03 | planned |
| V1-13 | VS Code / browser extension proof of concept | P1 after research | PH-02, PH-05 | discovery |
| V1-14 | Performance >2MiB / streaming architecture | P2 | HN-13; competitor capability | research |
| V1-15 | Full JSON Schema editing/debugging | P2 | HN-08, narrower subset | research |
| V1-16 | JSONL / nested JSON string inspection | P2 | AI agent logs signal | discovery |
| V1-17 | AI explanations / cloud assistant | Not launch scope | May conflict with privacy, weak evidence | deferred |
| V1-18 | Subscription paywall for local core | Not launch scope | HN-17 pricing resistance | deferred |

**Kill criterion**：首批 15 人测试中，Issues-first 没有带来实测任务正确率或完成时间优势，则重新考虑默认视图。证据发现不应被 UI 设计偏好取代。

## 6. Findings Engine: 数据契约与规则

### 6.1 Unified Finding (不可把提示写死为错误)

```ts
type Severity = 'error' | 'warning' | 'info';
type Basis = 'deterministic' | 'sample_observation' | 'heuristic';
interface Finding {
  id: string;                      // deterministic within document revision
  ruleId: string;                  // e.g. JSON.DUPLICATE_KEY
  ruleVersion: string;             // e.g. 1.0.0
  severity: Severity;
  basis: Basis;
  titleKey: string;                // i18n, no source text in key
  explanationKey: string;
  docId: string;
  documentRevision: number;
  primary: {nodeId?:number; span:{start:number;end:number}; pointer:string|null; occurrence?:number};
  related: Array<{docId:string; nodeId?:number; span:{start:number;end:number}; pointer?:string|null}>;
  sample?: {observedCount:number; eligibleCount:number; policy:string};
  suggestedActions: Array<'LOCATE'|'COPY_EXACT'|'COPY_REDACTED'|'COMPARE'>;
  acknowledged?: boolean;         // UI only, never changes source
}
```

Worker owns AST and issues. UI sees bounded finding summaries; requesting issue evidence by ID returns exact SourceSpan and metadata, not full large source. Run analysis on a versioned document, not on mutable DOM textarea state. Source reads validate revision and span.

### 6.2 P0 Rule R-01: precision risk
- Trigger: raw JSON number token cannot be represented as a safe integer under JS Number (integer lexeme with magnitude > 2^53-1), or opt-in precision-risk rule for decimal/exponents where Number round-trip fails under documented comparator.
- Severity `warning` / basis `deterministic` for unsafe-integer path; decimal loss *requires a separately tested exact semantics*, do not conflate with syntax invalidity.
- Show `rawNumber`, concise why, affected path (if unique), SourceSpan and copy raw token. Never show a rounded JS Number as authoritative data.
- Nonscope: no automatic conversion of arbitrary numeric JSON into strings; that changes API types.

### 6.3 P0 Rule R-02: duplicate key
- Detect by **decoded** object key (e.g. `"a"` and `"\\u0061"` are duplicates) within the same object; source member order preserved.
- Show both occurrences and separate key-token spans; `pointer=null` if any segment ambiguous; use NodeId + occurrence for internal selection.
- Severity `warning` / deterministic; configurable strict mode `error`. Do not silently select first/last member.
- No auto-fix without explicit choice and preview: selecting a duplicate to delete is a destructive edit and belongs to later version.

### 6.4 P0 Rule R-03: observational schema drift
- Mode A (single array): only for comparable object elements; collect observed per-field `present`, `missing`, `null`, `type distribution`, `occurrence duplicates`, and small **source-linked examples**.
- Mode B (multiple documents): user explicitly adds samples assumed same endpoint/context; compare observed field presence/type distributions. Never claim request-scope equivalence without user statement.
- `MISSING_FIELD`, `TYPE_VARIANCE`, `NULL_OUTLIER` are initially **info / sample_observation**, never automatic “bug” or “schema violation”.
- Required metadata: N eligible objects, counts, denominator, detection strategy and selection biases; show `Observed 1/20`, not `1% of all production data`.
- If <3 eligible examples: avoid anomaly flags; show distribution only. If same property has 2+ types but only 2 samples, explain low sample support.
- User can ignore/mark expected per session; don't retain local data unless explicitly asked.
- Duplicate keys count by occurrence, not by object map collapsing.

### 6.5 Diagnostics UI semantics
- Error: invalid JSON syntax, text-decoding failure or explicitly selected strict parser policy.
- Warning: deterministic interoperability / potential data-loss risk.
- Observation: unexpected distribution or variation seen in the supplied samples.
- Information: format/performance/privacy limits.
- “No findings” means only **no currently detectable findings under enabled rules**, not “JSON is guaranteed correct”.
- Every rule has documentation, a positive example, a false-positive counterexample and an independent golden test.

## 7. Search / Compare / Export (post-core, but interfaces defined)

### Search
- Scoped literal key/value search and RFC 6901 Pointer lookup first.
- If JSONPath/jq enabled in future: explicitly define data model semantics for duplicates and lossless numbers; unsupported operations must fail with explanation rather than silently coerce to JS Number.
- Interactive result preview includes count, locations, exact source spans and a bounded output budget.
- No remote query execution.

### Two-response Diff
- Compare ordered AST, with policy options: object-key order ignored by default for semantic comparison; duplicate-key positions preserved and flagged; array order significant by default.
- Highlight `added`, `removed`, `changed_type`, `changed_value`, `precision_sensitive`; distinguish `null` from missing.
- Labels `left`/`right` with clear interpretation; no arbitrary color-only meaning.
- No mutating merge or automatic patch at V1.

### Export
- `Copy exact raw`: source span exact; no JSON.stringify.
- `Copy finding report`: local Markdown/JSON structured summary, with redaction preview.
- `Export table CSV/TSV`: only defined for flat compatible scalar cells; duplicate-column naming is explicit and optional; high precision exports use raw numeric strings, not silent Number.
- `Privacy-safe share`: **no raw payload URL**. Generate a local sanitized example after user preview; do not promise all secrets are detected. Default allowlist-only sample or synthetic fixtures, no “automatic redaction guarantees”.
- If sensitive source remains in the report, block upload/share; local download allowed with warning and explicit confirmation.

## 8. Error and empty states

| Situation | User-visible response | Internal contract |
|---|---|---|
| Empty input | “Paste JSON or try a sample” | no parse |
| Malformed input | first offending token, line/column, locate | `SYNTAX_ERROR` |
| UTF-8 invalid file | explain invalid byte encoding, retain original file untouched | `INVALID_UTF8` |
| 2MiB exceeded | show actual size and supported cap, suggest future large-file workflow | `SIZE_LIMIT` before AST |
| 100k nodes/depth limit | exact named resource limit, no frozen page | `NODE_LIMIT`/`DEPTH_LIMIT` |
| Huge scalar preview | truncate display but allow exact-copy within bounded local source | no raw mutation |
| Pointer points to duplicate | two clickable occurrences, no fake path | `AMBIGUOUS_MEMBER` |
| Worker terminated/crashed | reparse CTA; source remains in editor | no stale result |
| No findings | state rule coverage + limitations | never claim "safe" |
| Offline reload | if offline bundle installed, core works; else explanatory offline error | no silent network |

## 9. Privacy, security and accessibility

### Privacy threat model
- Risks: server uploads, analytics SDK capturing JSON, leaked raw content in URL/hash, browser localStorage persistence, XSS, malicious HTML embedded in JSON, clipboard leaks, auto-share, extension broad permissions, file parsing DoS.
- Core app: no runtime external third-party JS/CDN, CSP restricts network/frame/form as appropriate; static same-origin assets may download on first load, **distinct from uploading user content**.
- V1 Proof: reproducible network test logs with synthetic marked payload, checks both main and Worker contexts; tests disallow requests containing payload bytes, keys or literals. Verify storage not written without user consent.
- Offline distribution: may be separate signed/reproducible static package; "works offline" badge only if tested after network disconnect on Chrome/Firefox/Safari as applicable.
- Never store raw JSON in error telemetry, links, analytics, server logs or support tickets.
- Render all untrusted strings via textContent, no HTML interpretation; limit source and projection budgets.
- Clipboard writes are user-initiated; failure is visible. Copying a raw source is not anonymization.

### Accessibility
- Tree supports keyboard navigation, selection, focus and WAI-ARIA; Issues list reachable with Tab and screen-reader labels.
- Finding links have accessible descriptions, not severity-only colors; contrast/200% zoom.
- No auto-advancing carousel. Prefers reduced motion respected.
- No modal surprise on paste/parse or forced login; essential actions visible.

## 10. Non-functional budgets / independent evaluation

**Hard baseline**：current V0.3 supported parser budgets, until verified engineering expansion: UTF-8 <=2MiB, depth <=128, object members <=50,000, AST nodes <=100,000. Virtual tree must not render entire AST.

**Hard gates**：
- No source token loss on parse, diagnostics, locate, exact-copy or formatting;
- Fixed corpus 100% passing for unsafe integers, escaped duplicate keys, missing/null, source offsets, invalid UTF-8;
- No network emission of synthetic secret markers in browser E2E;
- Stale document revisions and tree epochs cannot overwrite newer results;
- Real cross-browser smoke, no P0 exceptions.
**Performance metrics**：reference environment records P50/P95 load→first finding, render mounted rows, main thread long tasks, parse memory peak; no invented millisecond guarantee before baseline.

## 11. UX acceptance stories (Gherkin-like)

**US-01 Precision**: Given `{"id":9007199254740993}`, when user clicks Try Sample, then `NUMERIC_PRECISION_RISK` appears with raw token unchanged; Locate selects exact characters; Copy Exact yields 9007199254740993.

**US-02 Escaped duplicate**: Given `{"a":1,"\\u0061":2}`, then two members remain, warning has two source spans; `/a` unresolved as ambiguous; neither is silently removed.

**US-03 Drift not certainty**: Given 8 objects with `price:number` and 2 with `price:string`, then `TYPE_VARIANCE` shows 8/10 vs 2/10 and explicit “observed in supplied samples”; no claim about API schema.

**US-04 Missing vs null**: Given `[{"a":null},{}]`, UI distinguishes a null value from field absence; reports show each path and original source.

**US-05 Local privacy**: Given a synthetic secret marker in JSON, on parse/search/export without explicit share, no request includes its bytes and no persistent store contains them, verified in browser test.

**US-06 2MiB boundary**: Given >2MiB file, product rejects before heavy processing with exact limit and preserves editor/session; does not claim 50MB support.

**US-07 Keyboard**: Given 100k-node fixture within budget, keyboard can select a located node without mounting >400 treeitem DOM nodes.

**US-08 Report**: Given one finding with sensitive values, Copy Report defaults to a redacted or synthetic example; raw content is never placed into a share URL.

## 12. Prioritization & dependency map

```
V0.3 PR #9 accepted and reviewed
  -> P01 Product shell, en-US/zh-CN, demo and default engine
  -> P02 Finding Engine (precision, duplicates, evidence)
  -> P03 Observation Engine (object arrays / multi-sample)
  -> P04 UX/report/privacy proof + usability tests
  -> P05 Production deploy, release evaluation, PH assets
  -> P1: Compare / Search / CSV / Extensions based on demand evidence
```

Minimum first release must include Product shell + Findings + at least one multi-sample drift demonstration + actual privacy proof. Product Hunt submission should not be attempted on engineering alpha solely because CI is green.

## 13. Prelaunch product experiment

- 15 participants: 5 backend, 5 frontend, 5 data/integration; recruit across skill levels rather than from one social circle.
- Give each two comparable tasks on JsonParseWeb and their current tool; randomized order; record time-to-correct-diagnosis, whether finding is actually supported, and need for hints.
- Suggested **aspirational** gate: >=12/15 first-time participants describe product correctly; >=80% find and locate a demo finding within 60s; >=90% complete all key flow tasks. These are *planning thresholds*, not measured results.
- 20 independent held-out cases from actual user bug reports or realistic generated counterexamples, reviewed by independent evaluator; no undisclosed sensitive samples.
- For false positives, track precision by rule and let experts mark intended anomalies; don't tune rules on held-out cases.

## 14. Launch narrative

Name: `JsonParseWeb` (provisional; check brand/trademark before alternate naming).
Tagline draft: `Find hidden JSON bugs without uploading your data`.
Story: ordinary parsers can silently round large integers or overwrite duplicate members, while visual viewers can be pretty but unhelpful. This workbench keeps the original evidence and helps developers inspect potential data issues, privately.
Demonstrate real product, not mockups; show actual network-proof procedure.
No incentivized upvotes, no automated comments, no claim of PH rankings before actual launch.

## 15. Scope-control checklist

- [ ] Product default goes straight to real V0.3 mode after readiness checks.
- [ ] Every user-visible claim matches implemented and verified behavior.
- [ ] Security claims backed by browser network and artifact audit.
- [ ] Feature names avoid “AI-powered” unless an actual bounded, consent-based AI feature exists.
- [ ] No hidden experimental flags in novice primary UI.
- [ ] User studies conducted and reported, including failures and participants' alternative tools.
- [ ] User-provided sensitive JSON not collected for research.
- [ ] PH listing complies with [official Launch Guide](https://help.producthunt.com/en/articles/17350772-launch-guide) and [Featuring Guidelines](https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines).

**Decision**：Proceed with P01/P02 implementation design, but do not claim validated product-market fit or launch-readiness before an independent user test.
