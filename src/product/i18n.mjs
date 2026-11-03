/** Static-label i18n, no user content is translated, uploaded or persisted. */
const messages={
  en:{
    navWorkbench:'Open workbench',navGithub:'GitHub',navPrivacy:'Local-first',
    eyebrow:'LOSSLESS JSON DEBUGGER',heroTitle:'Your JSON is valid. But is your data reliable?',
    heroLead:'Find precision traps and duplicate keys, inspect exact source evidence, and keep your payload in your browser.',
    trySample:'Try a real example',secondaryCTA:'Open the workbench',
    demoTitle:'Try a one-click investigation',demoLead:'Synthetic examples. No account or upload required.',
    demoPrecision:'Precision trap',demoDuplicate:'Duplicate keys',demoEscaped:'Escaped duplicate',demoDrift:'Schema drift',
    whyTitle:'From hidden risk to exact evidence',whyOne:'Detect data risks',whyTwo:'Trace to the source',whyThree:'Copy without rounding',
    workbenchTitle:'Inspection workbench',sourceLabel:'SOURCE INPUT',resultLabel:'RESULT & EVIDENCE',
    inputHint:'Ctrl / ⌘ + Enter',parse:'Inspect JSON',cancel:'Cancel',format:'Format',sample:'Load example',clear:'Clear',
    uploadLabel:'Drop a .json file here, or choose a file',uploadNote:'Browser-only processing · 2 MiB limit',
    pointerLabel:'JSON Pointer',pointerGo:'Find node',download:'Export original',
    tabTree:'Tree',tabRaw:'Raw',tabTable:'Table',issuesTitle:'Findings',issuesIntro:'Findings are potential interoperability risks, not proof that the API is broken.',
    treeType:'Tree',detailCopy:'Copy exact raw',versionNote:'Experimental v1 product shell on the V0.3 lossless engine',
    privacyNote:'No account · No automatic uploads · View source on GitHub',
    language:'Language',features:'Capabilities',focusIssue:'Locate evidence',copyExact:'Copy exact',loadMore:'Show more findings',
    cleanTitle:'No findings from enabled checks',cleanInfo:'The current rules check unsafe integer tokens and duplicate decoded object keys. This is not a guarantee of correctness.',
    inspectProgress:'Inspecting locally in a Web Worker…',inspectSuccess:'Inspection complete',invalid:'JSON could not be parsed — inspect the diagnostics.',
    modified:'Source changed. Run inspection again.',placeholder:'Paste JSON here, or try a sample…',
    warningLabel:'Potential risk',sourceLine:'line',ambiguous:'This key path is ambiguous; select the specific occurrence.',
    resultEmpty:'Try a synthetic example or inspect your own JSON.',
    findingUnsafe:'Potential JavaScript integer precision loss',
    explainUnsafe:'This JSON integer exceeds JavaScript’s safe integer range. Some consumers may round it. The source token is preserved.',
    findingDuplicate:'Duplicate object property',
    explainDuplicate:'The decoded property name occurs more than once in this object. Consumers may disagree on which value to use.',
    truncated:'Additional findings exist. Only the first 100 are retained; review the full source.',
    sourceHighlighted:'Source span highlighted',copySuccess:'Exact source copied',copyFail:'Clipboard access failed',
    rawNotChanged:'No source text was changed.',pendingIssue:'Analyzing findings…',
    driftTitle:'Schema Drift Explorer',driftIntro:'Observations in the JSON object array or across related local JSON samples. Not a confirmed API schema or a bug verdict.',
    driftFilesLabel:'Choose up to 5 related JSON files',driftAnalyze:'Analyze supplied samples',driftClear:'Clear additional files',
    driftAdded:'additional files',driftNoFiles:'No additional files. Analyze the current array or object.',driftReady:'Ready. Click Analyze to inspect the selected samples.',
    driftLoading:'Reading local files…',driftProgress:'Inspecting local samples in the Worker…',driftDone:'Sample analysis complete.',
    driftLimit:'At most 5 additional files and 2 MiB total source.',driftJsonOnly:'Only .json files are supported.',driftReadError:'Local file read failed',
    driftScope:'Eligible object records',driftExcluded:'Non-object values excluded',driftFields:'Observed fields',driftCaution:'Observed in supplied samples; not a guaranteed API contract.',
    driftObservations:'Potential variations',driftLowSample:'Fewer than 3 eligible objects: only field distributions shown. No anomaly claims.',
    driftNoObservations:'No variation detected by the current rules; this is not proof of consistency.',
    driftPresent:'Present',driftMissing:'Missing',driftField:'Field',driftTypeCounts:'Observed types',driftEvidence:'Locate evidence',
    driftSourceLocal:'local sample source',driftMore:'Show more observations',driftMoreFields:'Show more fields',
    driftTruncated:'Some entries are not included in this preview; result limits are explicitly bounded.',driftStale:'Source span is out of date; rerun the analysis.',
    'SCHEMA.TYPE_VARIANCE':'Mixed field types', 'SCHEMA.MISSING_FIELD':'Field missing in some records', 'SCHEMA.NULL_VARIANCE':'Null and non-null values coexist'
  },
  zh:{
    navWorkbench:'打开工作台',navGithub:'GitHub',navPrivacy:'本地优先',eyebrow:'无损 JSON 调试工具',
    heroTitle:'你的 JSON 语法正确，但数据真的可靠吗？',
    heroLead:'发现整数精度风险和重复键，定位原始证据。整个过程都在浏览器本地完成。',
    trySample:'体验真实示例',secondaryCTA:'打开调试工作台',demoTitle:'一键体验问题排查',demoLead:'合成测试数据，无需账户或上传。',
    demoPrecision:'整数精度陷阱',demoDuplicate:'重复对象属性',demoEscaped:'转义后的重复属性',demoDrift:'结构变化',
    whyTitle:'从潜在问题直接到原始证据',whyOne:'检测数据风险',whyTwo:'定位源码位置',whyThree:'原样精确复制',
    workbenchTitle:'JSON 调试工作台',sourceLabel:'输入数据',resultLabel:'检查结果与证据',
    inputHint:'Ctrl / ⌘ + Enter',parse:'检查 JSON',cancel:'取消',format:'格式化',sample:'加载示例',clear:'清空',
    uploadLabel:'拖拽 .json 文件到这里，或选择文件',uploadNote:'仅浏览器本地处理 · 2 MiB 限制',
    pointerLabel:'JSON Pointer',pointerGo:'定位节点',download:'导出原文',tabTree:'树形',tabRaw:'原文',tabTable:'表格',
    issuesTitle:'检查发现',issuesIntro:'这些是潜在兼容性风险，并不代表 API 一定有问题。',
    treeType:'树形',detailCopy:'精确复制原文',versionNote:'V0.3 无损引擎上的 V1 产品体验版本',
    privacyNote:'无需注册 · 不自动上传 · GitHub 源码可审查',language:'语言',features:'核心能力',
    focusIssue:'定位证据',copyExact:'精确复制',loadMore:'查看更多发现',cleanTitle:'现有检查规则未发现风险',
    cleanInfo:'当前只检查不安全整数 Token 和经过解码的重复属性名，不保证数据完整正确。',
    inspectProgress:'正在 Web Worker 中本地检查…',inspectSuccess:'无损解析成功',
    invalid:'无损解析失败，请查看诊断详情。',modified:'内容已修改，请重新解析。',
    placeholder:'在这里粘贴 JSON，或试用示例…',warningLabel:'潜在风险',sourceLine:'行',
    ambiguous:'重复属性导致路径歧义，请选择具体出现位置。',resultEmpty:'选择示例或检查自己的 JSON。',
    findingUnsafe:'可能存在 JavaScript 整数精度损失',
    explainUnsafe:'该 JSON 整数超出 JavaScript 安全整数范围，部分消费端可能发生舍入；原始 Token 已保留。',
    findingDuplicate:'重复对象属性',explainDuplicate:'解码后的属性名在同一个对象中重复出现，消费端可能选择不同的值。',
    truncated:'仍有更多发现，仅保留前 100 条；请检查完整原文。',sourceHighlighted:'已定位原始区间',
    copySuccess:'已精确复制原文',copyFail:'剪贴板访问失败',rawNotChanged:'原文未被修改。',pendingIssue:'正在分析发现…',
    driftTitle:'Schema Drift 结构变化分析',driftIntro:'分析当前 JSON 对象数组，或添加相关的本地 JSON 文件。结果仅代表样本观察，不是 API 协议定义或错误判定。',
    driftFilesLabel:'选择最多 5 份相关 JSON 文件',driftAnalyze:'分析提供的样本',driftClear:'清空附加文件',
    driftAdded:'附加文件',driftNoFiles:'尚未添加文件。可直接分析当前数组或对象。',driftReady:'已准备好，点击分析即可检查样本。',
    driftLoading:'正在读取本地文件…',driftProgress:'正在 Worker 中分析本地样本…',driftDone:'样本分析完成。',
    driftLimit:'附加文件不超过 5 个，所有文本总量不超过 2 MiB。',driftJsonOnly:'仅支持 .json 文件。',driftReadError:'读取本地文件失败',
    driftScope:'合格对象记录',driftExcluded:'排除的非对象数据',driftFields:'已观察字段',driftCaution:'仅代表提供样本中的观察，不等于完整 API 契约。',
    driftObservations:'潜在变化',driftLowSample:'合格样本不足 3 条，仅显示字段分布，不宣称存在异常。',
    driftNoObservations:'当前规则未发现样本变化，不保证所有数据都一致。',
    driftPresent:'存在',driftMissing:'缺失',driftField:'字段',driftTypeCounts:'观察类型',driftEvidence:'定位证据',
    driftSourceLocal:'本地样本原文',driftMore:'查看更多观察',driftMoreFields:'查看更多字段',
    driftTruncated:'因资源限制仅展示部分条目，未展示的数据不能视为已检查完毕。',driftStale:'原文区间已失效，请重新分析。',
    'SCHEMA.TYPE_VARIANCE':'字段类型不一致','SCHEMA.MISSING_FIELD':'部分记录缺少字段','SCHEMA.NULL_VARIANCE':'混合 null 与非 null 值'
  }
};
export function translate(locale,key) {return messages[locale]?.[key]??messages.en[key]??key;}
export function applyStaticLocale(locale,root=document) {
  const t=key=>translate(locale,key);
  for(const node of root.querySelectorAll('[data-i18n]')) node.textContent=t(node.dataset.i18n);
  for(const node of root.querySelectorAll('[data-i18n-placeholder]')) node.setAttribute('placeholder',t(node.dataset.i18nPlaceholder));
  root.documentElement.lang=locale==='zh'?'zh-CN':'en';
  root.title=locale==='zh'?'JsonParseWeb · 发现隐藏的 JSON 问题':'JsonParseWeb · Find hidden JSON issues';
}
export const PRODUCT_SAMPLES=Object.freeze({
  precision:'{"orderId":9007199254740993,"status":"paid"}',
  duplicate:'{"role":"viewer","role":"admin","active":true}',
  escaped:'{"a":1,"\\u0061":2,"source":"escaped duplicate keys"}',
  drift:'[{"price":19.5,"region":"US"},{"price":18.0},{"price":"19.5","region":null},{"region":"EU"},{"price":null,"region":"JP"}]'
});
