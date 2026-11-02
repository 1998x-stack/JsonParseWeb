/** Framework-independent JSON diagnostics and statistics. No user data is transmitted. */
export const LIMITS = Object.freeze({bytes: 2 * 1024 * 1024, depth: 128, keys: 50_000, nodes: 100_000});
const enc = new TextEncoder();
const NUM_RX = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function inspectNumbers(source) {
  // JSON.parse validates grammar first; this lexer skips quoted string contents.
  const warnings = [];
  let quoted = false, escaped = false;
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === '-' || (c >= '0' && c <= '9')) {
      NUM_RX.lastIndex = i;
      const match = NUM_RX.exec(source);
      if (match) {
        const raw = match[0];
        if (/^-?\d+$/.test(raw)) {
          if (BigInt(raw) > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(raw) < BigInt(Number.MIN_SAFE_INTEGER)) {
            warnings.push({code: 'UNSAFE_INTEGER', offset: i, message: `整数 ${raw.slice(0, 40)} 超过 JavaScript 安全整数范围；原始文本已保留，请勿格式化为 Number。`});
          }
        }
        i += raw.length; continue;
      }
    }
    i++;
  }
  return warnings;
}

export function statistics(data, limits = LIMITS) {
  const types = {string: 0, number: 0, boolean: 0, null: 0, array: 0, object: 0};
  let totalKeys = 0, maxDepth = 0, arrayCount = 0, objectCount = 0, nodes = 0;
  const stack = [{value: data, depth: 1}];
  while (stack.length) {
    const {value, depth} = stack.pop();
    nodes++;
    if (nodes > limits.nodes) throw new Error(`节点总数不能超过 ${limits.nodes}`);
    if (depth > limits.depth) throw new Error(`层级深度不能超过 ${limits.depth}`);
    maxDepth = Math.max(maxDepth, depth);
    if (value === null) types.null++;
    else if (Array.isArray(value)) {
      types.array++; arrayCount++;
      for (let i = value.length - 1; i >= 0; i--) stack.push({value: value[i], depth: depth + 1});
    } else if (typeof value === 'object') {
      types.object++; objectCount++;
      const keys = Object.keys(value);
      totalKeys += keys.length;
      if (totalKeys > limits.keys) throw new Error(`属性总数不能超过 ${limits.keys}`);
      for (let i = keys.length - 1; i >= 0; i--) stack.push({value: value[keys[i]], depth: depth + 1});
    } else if (typeof value === 'boolean') types.boolean++;
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('JSON 数值超过有限浮点数范围');
      types.number++;
    }
    else if (typeof value === 'string') types.string++;
  }
  return {total_keys: totalKeys, max_depth: maxDepth, array_count: arrayCount, object_count: objectCount, nodes, data_types: types};
}

export function parseDocument(source, limits = LIMITS) {
  if (typeof source !== 'string') return {ok: false, error: 'JSON 输入必须是文本', warnings: []};
  const bytes = enc.encode(source).length;
  if (bytes > limits.bytes) return {ok: false, error: `JSON 文本不能超过 ${limits.bytes} 字节`, warnings: []};
  if (!source.trim()) return {ok: false, error: '请输入 JSON 数据', warnings: []};
  try {
    const data = JSON.parse(source);
    const stats = statistics(data, limits);
    const warnings = inspectNumbers(source);
    return {ok: true, data, stats: {...stats, size_bytes: bytes}, warnings, source};
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : String(error), warnings: []};
  }
}

export function prettyPrint(document) {
  if (!document?.ok) throw new Error('无法格式化无效文档');
  if (document.warnings.some(w => w.code === 'UNSAFE_INTEGER')) throw new Error('包含不安全整数：为防止精度损失，请保持原始文本。');
  return JSON.stringify(document.data, null, 2);
}
