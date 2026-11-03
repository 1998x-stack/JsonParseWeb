# JsonParseWeb — Product Hunt × Hacker News 用户声音研究（VoC）

> **版本**：2026-11-03 · **状态**：Desk research / 假设形成，不是代表性市场调查
> **用途**：作为 `PRODUCT_V1_PRD.md` 的需求依据。此文仅用于产品研究，未开展访谈、问卷或真实用户实验。
> **范围**：2019–2026 年公开可读的 Product Hunt 产品评论/发布讨论和 Hacker News 帖子；不声称覆盖平台全部评论。

## 0. 研究方法与证据可信度

- **主要样本来源**：Product Hunt 的 JSON Crack、JSON Hero Chrome extension、Jayson、Dadroit V Web；Hacker News 的 JSON Hero、JSON Crack、JSON For You、jnv、JSONL Viewer、Giant JSON Viewer 等相关讨论。抽取的是与 JSON 工具价值、工作流、安全、性能和定价直接相关的具体观点，不是随机抽样。
- **采集边界**：只引用可打开的评论与论坛页面。某些 Product Hunt 页面动态加载或只暴露部分讨论；缺少全文时不推断未见内容。平台展示的评价数量和评论数量随时间、抓取方式变化；不把其当作当前精确统计。
- **证据分级**：A=真实用户明确表达的痛点/请求；B=真实用户的使用习惯、负面体验或替代方案；C=竞品 Maker 的产品自述；H=研究者推断/待验证假设。
- **去偏**：HN 偏技术用户、较倾向隐私/CLI/开源，PH 偏早期产品用户且推广评论很多。既没有代表性抽样，也没有独立用户身份核验。一个人一次发言不等于整个市场的偏好。评论互动热度不是用户需求规模。
- **区分**：用户的“希望支持 50MB”是需求信号，不是产品能满足该值的证明；竞品的“50MB 不冻结”是 Maker 声明，不视为独立性能评测。
- **研究日期**：2026-11-03。下述日期是原帖/页面可见日期；部分 PH 老评论只有相对年份。

## 1. 可追溯证据账本

| ID | 平台与身份 | 用户原意（中文转述，不是逐字引语） | 标签 | 证据等级 | 直接来源 |
|---|---|---|---|---|---|
| PH-01 | Product Hunt / JSON Crack / Yuri Drabik | 看到了 SVG 图，但找不到导出入口；即使有功能也需明显可见 | 导出可发现性 | A | [JSON Crack 评价](https://www.producthunt.com/products/json-crack/reviews) |
| PH-02 | Product Hunt / JSON Crack / Sabbir-ul-alam Sabbir | 不想为了查看 JSON 再打开单独编辑器，希望有 VS Code 扩展 | 现有工作流 | A | [JSON Crack 评价](https://www.producthunt.com/products/json-crack/reviews) |
| PH-03 | Product Hunt / JSON Hero Chrome / Aaron Lintz | 希望导出 CSV/TSV | 结果可移植性 | A | [JSON Hero Chrome 评价](https://www.producthunt.com/products/json-hero-chrome-extension/reviews) |
| PH-04 | Product Hunt / JSON Hero Chrome / Roman | 希望自动显示格式化结果，而不是手动点按钮 | 自动化/减少点击 | A | [JSON Hero Chrome 评价](https://www.producthunt.com/products/json-hero-chrome-extension/reviews) |
| PH-05 | Product Hunt / JSON Hero Chrome / Marcin Simonides | 希望在网页选中文本后，右键直接调用扩展打开 | 右键快捷入口 | A | [JSON Hero Chrome 讨论](https://www.producthunt.com/products/json-hero-chrome-extension) |
| PH-06 | Product Hunt / JSON Hero Chrome / Milla Leanne | 询问如何将扩展指向自己部署的实例 | 私有部署 | A | [JSON Hero Chrome 讨论](https://www.producthunt.com/products/json-hero-chrome-extension) |
| PH-07 | Product Hunt / JSON Hero Chrome / Rainer Lin | 询问拖放 JSON 文件区域为何不起作用 | 导入可靠性 | A | [JSON Hero Chrome 讨论](https://www.producthunt.com/products/json-hero-chrome-extension) |
| PH-08 | Product Hunt / Jayson / Elior Boukhobza | 质疑为什么需要单独的 JSON 查看产品；Maker 随后解释移动端 API 响应场景 | 定位可解释性 | B | [Jayson 讨论](https://www.producthunt.com/products/jayson-2) |
| PH-09 | Product Hunt / Dadroit V Web / Maker Peter | 主打浏览器本地解析、50MB、正则搜索、API URL、局部导出；这是竞品承诺，**不是用户诉求或独立测试结果** | 竞品能力边界 | C | [Dadroit V Web](https://www.producthunt.com/products/dadroit-v-web) |
| HN-01 | Hacker News / JSON Hero / einichi | 最高优先级是 JSON 永不离开本机，担心机密内容被在线工具收集 | 强隐私 | A | [评论直链](https://news.ycombinator.com/item?id=33784092) |
| HN-02 | Hacker News / JSON Hero / alias_neo | 反感号称本地的软件默认上传遥测；生产工作中可能违反规定 | 遥测/合规 | A | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-03 | Hacker News / JSON Hero / aembleton | 认为可视化不如 VS Code 彩色文本阅读，页面信息密度较低 | 信息密度/替代品 | B | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-04 | Hacker News / JSON Hero / tfsh | 看到了静态分析发现类型离群值、异常 null 的潜在价值 | 异常诊断 | B | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-05 | Hacker News / JSON Hero / rurban | 报告 JSON Crack 当时无法处理其约 600K 大小的文件 | 大文件可靠性 | A | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-06 | Hacker News / JSON Hero / dale_glass | 报告标签页闲置后内存异常增长到数十 GB；属于个人问题报告，未复现 | 内存安全 | A | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-07 | Hacker News / JSON Hero / mainedotpy | 650MB+ JSON 无法打开且缺少明确错误提示 | 资源上限/错误反馈 | A | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-08 | Hacker News / JSON Hero / user3939382 | 第三方 API 返回结构随请求变化，希望从多个 JSON 样例推导可覆盖所有样例的 Schema，并手动调整规则 | 多样本 Schema | A | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-09 | Hacker News / JSON Hero / shanipribadi | 指出部分可视化依然受 JS 2^53 精度问题影响 | 无损数值 | A | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-10 | Hacker News / JSON Hero / stevage | 质疑可视化有什么额外价值，自己通常用 VS Code 格式化和搜索 | 价值证明 | B | [JSON Hero 讨论](https://news.ycombinator.com/item?id=33783504) |
| HN-11 | Hacker News / JSON Crack / hadlock | 想以颜色/网格快速区分两份 JSON 相同、改动、新增、删除的结构 | 结构化 Diff | A | [JSON Crack 讨论](https://news.ycombinator.com/item?id=33136351) |
| HN-12 | Hacker News / jnv / croemer | 反馈 16MB 中等规模 JSON 性能很慢 | 性能 | A | [jnv 讨论](https://news.ycombinator.com/item?id=39759325) |
| HN-13 | Hacker News / jnv / teaearlgraycold | 日常工作需要处理 50MB+ JSON | 文件规模 | A | [jnv 讨论](https://news.ycombinator.com/item?id=39759325) |
| HN-14 | Hacker News / jnv / bipvanwinkle | jq 操作前看不到即将提取的数据，缺少交互式预览 | 查询预览 | A | [jnv 讨论](https://news.ycombinator.com/item?id=39759325) |
| HN-15 | Hacker News / JSON For You / iCutMoon | 认为产品与现有产品高度相似，差异不明显 | 产品差异化 | B | [JSON For You 讨论](https://news.ycombinator.com/item?id=41634356) |
| HN-16 | Hacker News / JSON For You / poopsmithe | 轮播图自动跳转，用户还未看完就被切换 | 演示/UX | A | [JSON For You 讨论](https://news.ycombinator.com/item?id=41634356) |
| HN-17 | Hacker News / JSON For You / voshond 与其他评论者 | 对纯本地工具持续订阅价格的价值感强烈质疑；购买者不认为维护成本天然构成付费理由 | 定价模型 | A | [JSON For You 讨论](https://news.ycombinator.com/item?id=41634356) |
| HN-18 | Hacker News / JSON For You / breck | 认可 Diff 比图形化更实用，同时实际测试中让大型数据导致页面崩溃 | Diff/稳定性 | A | [JSON For You 讨论](https://news.ycombinator.com/item?id=41634356) |
| HN-19 | Hacker News / JSON For You / reed1 | 更偏好 fx、jq、VisiData、DuckDB 等命令行或表格工具，图形操作未必优于无鼠标工作流 | CLI/可组合性 | B | [JSON For You 讨论](https://news.ycombinator.com/item?id=41634356) |
| HN-20 | Hacker News / JSONL Viewer / 发帖 Maker | AI agent JSONL 日志在线工具兼容差或会上传数据；希望单文件离线查看 | JSONL/Agent logs | C | [JSONL Viewer 讨论](https://news.ycombinator.com/item?id=47699179) |
| HN-21 | Hacker News / Giant JSON Viewer / kundan_s__r | 对超宽对象、深层结构、索引内存成本提出具体性能问题 | 极端结构/内存 | A | [Giant JSON Viewer 讨论](https://news.ycombinator.com/item?id=46609592) |

**注意**：表中是有意筛选的 30 条“证据/竞争情报条目”，不是 30 名经过独立确认的受访用户。有的相同线程含多名评论者，有的是 Maker 表述。不得用 30 条条目计算“市场需求占比”。

## 2. 聚类与矛盾信号

### Cluster A：隐私是使用门槛，而不是装饰性卖点
- 用户直接要求数据不出机器；部分用户不信任默认遥测甚至在线处理方式（HN-01、HN-02）。
- 推断：Local-first 能帮助消除顾虑，但竞品同样主打本地运行（PH-09）。优势必须可被核验，例如严格 CSP、无第三方脚本、离线包、无内容遥测 E2E。
- 反例/约束：本地代码并非自动证明安全；浏览器加载的脚本仍可能发起网络连接，必须基于运行与供应链证据。

### Cluster B：替换 VS Code / jq 的理由尚不成立
- 批评：自然文本搜索、折叠、查询或 IDE 内工作流已足够（HN-03、HN-10、HN-19）。
- 用户请求：无需切换编辑器、右键打开、自动格式化（PH-02、PH-04、PH-05）。
- 推断：独立 Web 工具的主张不能是“更漂亮”，而必须是原工具无法轻易发现的 precision trap、重复键、schema drift 证据链；集成形态在 MVP 验证后开发。

### Cluster C：稳定、可解释的边界比夸张的文件上限更重要
- 16MB 慢、约 600K 文件失败、650MB 无错误、大型数据崩溃等是不同产品/日期的用户报告（HN-05、HN-06、HN-07、HN-12、HN-13、HN-18）。
- 竞品已有“50MB 无上传”的 Maker 声明（PH-09）。**JsonParseWeb 当前 2MiB 限制**：不能宣称领先大文件。
- MVP 先做到 2MiB 可预测、可恢复、错误明确；大文件是独立架构与测试项目。

### Cluster D：结构浏览要变成问题发现与解释
- 异常 null、类型离群、重复属性、数值保真和第三方 API Schema 变化有直接讨论（HN-04、HN-08、HN-09）。
- 但是异常 null 与类型不一致不等于真实 Bug，必须显示“可疑现象/样本证据”，允许用户忽略。
- Schema 应从多样本估计观察到的类型与可选字段，不能当作真实协议定义。

### Cluster E：Diff 与查询预览有明确目的
- 用户提出结构化 Diff 需求（HN-11），而 jnv 用户需要查询结果实时预览（HN-14）。
- V1 应优先做最小的两份 JSON 结构对比及安全路径提取预览，而不是全面复刻 jq/JSONPath 全语言与高级编辑器。

### Cluster F：让用户感知、复制和导出结果
- 导出入口被忽略、希望 CSV/TSV、自动格式化、轮播打断阅读都说明发现机制与操作可见性的重要性（PH-01、PH-03、PH-04、HN-16）。
- 但 CSV/TSV 不适合含重复键、混合类型及非标数组无损导出：应仅提供有明确定义的扁平表格导出，不能声称无损。

### Cluster G：收费要有与用户视角一致的持续价值
- 纯本地工具订阅存在明显反感（HN-17）。不代表用户永远不为本地软件付费。
- 先免费发布可靠核心与隐私验证，再访谈验证 VS Code 集成、组织级本地部署、审计报告等是否构成付款意愿；暂不设置强制订阅。

## 3. 按反馈推导的假设（不是已验证事实）

| 假设 | 证据 | 确认办法 | 预期产品后果 |
|---|---|---|---|
| H1：有证据的异常报告比纯可视化更有价值 | HN-04、HN-10、HN-15 | 相同 JSON bug 搜索任务 A/B，记录任务正确率和完成时间 | 默认 Issues 而非 Tree |
| H2：无网络/可离线能提高敏感场景使用意愿 | HN-01、HN-02；PH-09竞品声明 | 盲测网络证据与隐私说明，对比信任评分/实际使用选择 | 提供可验证隐私模式 |
| H3：工作流整合比扩张小工具菜单更能提升复访 | PH-02、PH-05、HN-19 | 访谈常用路径；小范围 VS Code 扩展原型 | 浏览器插件/IDE 排入下一波 |
| H4：Schema Drift 是应优先展示的真实错误类别 | HN-04、HN-08 | 多样本 API 工单复现与任务实验 | 建“观察、证据、限制”模型 |
| H5：Diff 比炫技图形化更值得投入 | HN-11、HN-18 | 10 份真实变更样例对比工具用时 | 两份 JSON 的最小 Diff |
| H6：2MiB 明确边界可以先发布，但不足以吸引 50MB 用户 | HN-12、HN-13、PH-09 | 实际任务的输入分布抽样，不收集内容，只记录用户自愿告知的大小区间 | 大文件独立 Go/No-go |

## 4. 竞品能力与定位审查

| 产品 | 当前公开能力/用户反馈 | 我们的行动 |
|---|---|---|
| [JSON Crack](https://www.producthunt.com/products/json-crack) | 图结构可视化、多格式；用户要求明显的导出入口与 IDE 集成 | 不重复走 Graph-first；优化发现结果导出 |
| [JSON Hero Chrome](https://www.producthunt.com/products/json-hero-chrome-extension) | 浏览器扩展；用户希望 TSV/CSV、自动显示、选中文字立即打开 | 工作流集成与自动扫描，但不先做一切格式 |
| [Dadroit V Web](https://www.producthunt.com/products/dadroit-v-web) | Maker 主打 50MB 本地、搜索、部分导出 | 不能以“本地大文件”作为独家竞争点 |
| [JSON For You](https://news.ycombinator.com/item?id=41634356) | 图/表/jq/Diff 等功能多；用户质疑同质化、价格、页面拥挤 | 减少菜单、单一故事、保留免费核心 |
| [jnv](https://news.ycombinator.com/item?id=39759325) | jq 交互查询；评论中既有预览需求也有性能担忧 | 先实现可证实的查询预览与数据边界 |

## 5. 产品方向结论与保留意见

**定位**：`Evidence-first, lossless, local JSON inspection`；首先帮开发者找到精度、重复键、类型漂移/缺失等风险，并提供源码定位和可复核证据。

**需要避免过度营销的词**：“100MB+”“无敌最快”“所有 JSON 都会发现 Bug”“100% 安全”“保证 Top 5 Product Hunt”“AI 智能修复全部问题”。前述均缺乏当前外部验证。

**下轮必须获得的原始材料**：至少 15 位不同类型开发者的真实调试任务（在本地/用户授权环境进行，原始敏感 JSON 不采集）；对照 VS Code/jq/JsonCrack 等替代方案的任务完成记录；至少 20 个独立真实故障与正常非故障样例作为 held-out 测试集。

## 6. 官方规则（发布门禁）

- [PH Featuring Guidelines](https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines)：强调已可用、实用、独特、设计完成度。
- [PH Launch Guide](https://help.producthunt.com/en/articles/17350772-launch-guide)：首次展示、tagline/描述限制、实际 demo、真实互动。
- [PH Commenting Guidelines](https://help.producthunt.com/en/articles/10030102-commenting-guidelines)：反对 AI 批量评论与灌水。
- [PH Vote Policy](https://help.producthunt.com/en/articles/484935-can-i-ask-my-community-friends-family-to-upvote-a-product)：不得诱导或换取投票。

**最终声明**：该研究支持需求方向的优先排序，不支持代表性市场份额、定价能力、留存率或榜单排名预测。
