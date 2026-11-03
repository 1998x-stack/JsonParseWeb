import {JsonFault, buildLineIndex, diagnostic, locate} from './diagnostics.mjs';
import {JsonTokenizer, LIMITS} from './tokenizer.mjs';

function hasLoneSurrogate(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}
const closeFor = kind => kind === 'array' ? ']' : '}';
const describe = t => t.kind === 'eof' ? '文件结束' : t.kind;

/** Strict, iterative, source-preserving JSON parser. Nodes and members are indexed records. */
export function parseLossless(source, options = {}) {
  const index = typeof source === 'string' ? buildLineIndex(source) : [0];
  const policy = {...LIMITS, ...options};
  const fail = err => ({ok:false, validSyntax:false,
    error: diagnostic(err, index), diagnostics: [diagnostic(err, index)]});
  if (typeof source !== 'string') return fail(new JsonFault('INVALID_INPUT', 'JSON 输入必须为文本', 0));
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > policy.bytes) return fail(new JsonFault('SIZE_LIMIT', `JSON 不能超过 ${policy.bytes} 字节`, 0));
  if (!source.trim()) return fail(new JsonFault('EMPTY_INPUT', '请输入 JSON', 0));

  try {
    const scanner = new JsonTokenizer(source, {tokenChars: policy.tokenChars});
    let current = scanner.next();
    const next = () => {current = scanner.next();};
    const expect = (kind, msg) => {
      if (current.kind !== kind) throw new JsonFault('SYNTAX_ERROR', msg ?? `期望 ${kind}，实际为 ${describe(current)}`, current.start, current.end);
    };
    const nodes = [], members = [], warnings = [], frames = [];
    let totalKeys = 0, duplicateKeys = 0, maxDepth = 0;
    const warnSurrogate = (value, start, end) => {
      if (warnings.length >= policy.diagnostics || !hasLoneSurrogate(value)) return;
      warnings.push({code:'UNPAIRED_SURROGATE',severity:'warning',
        message:'字符串包含不成对的 Unicode 代理项，跨系统交换可能存在兼容性问题',
        span:{start,end},...locate(index,start)});
    };
    const types = {string:0, number:0, boolean:0, null:0, object:0, array:0};
    const addValue = (parentId, depth, edge = null) => {
      if (depth > policy.depth) throw new JsonFault('DEPTH_LIMIT', `最大深度为 ${policy.depth}`, current.start, current.end);
      if (nodes.length >= policy.nodes) throw new JsonFault('NODE_LIMIT', `最多 ${policy.nodes} 节点`, current.start, current.end);
      const k = current.kind;
      const kind = k === '{' ? 'object' : k === '[' ? 'array' : (k === 'true' || k === 'false') ? 'boolean' : k;
      if (!Object.hasOwn(types,kind)) throw new JsonFault('SYNTAX_ERROR', `期望 JSON 值，实际为 ${describe(current)}`, current.start, current.end);
      const node = {id:nodes.length, kind, start:current.start, end:current.end, parentId, depth, edge};
      if (kind === 'array') node.children = [];
      if (kind === 'object') {node.members = []; node.memberLookup = new Map();}
      if (kind === 'number') node.rawNumber = source.slice(node.start, node.end);
      if (kind === 'string') {node.value = JSON.parse(source.slice(node.start, node.end)); warnSurrogate(node.value, node.start, node.end);}
      if (kind === 'boolean') node.value = k === 'true';
      if (kind === 'null') node.value = null;
      nodes.push(node); types[kind]++; maxDepth = Math.max(maxDepth, depth);
      next();
      if (kind === 'array' || kind === 'object') frames.push({id: node.id, state:'first', occurrences:kind === 'object' ? new Map() : null});
      return node.id;
    };
    const rootId = addValue(null, 1);
    while (frames.length) {
      const frame = frames.at(-1), parent = nodes[frame.id], array = parent.kind === 'array';
      if (frame.state === 'commaOrClose') {
        const end = closeFor(parent.kind);
        if (current.kind === end) {parent.end = current.end; next(); frames.pop(); continue;}
        expect(',', `期望逗号或 ${end}`);
        next(); frame.state = array ? 'arrayValue' : 'objectKey';
        continue;
      }
      if (array) {
        if (frame.state === 'first' && current.kind === ']') {parent.end = current.end; next(); frames.pop(); continue;}
        if (frame.state === 'arrayValue' && current.kind === ']')
          throw new JsonFault('TRAILING_COMMA', '数组末尾不能有逗号', current.start, current.end);
        const indexInParent = parent.children.length;
        const childId = addValue(parent.id, parent.depth + 1, {kind:'array', index:indexInParent});
        parent.children.push(childId);
        frame.state = 'commaOrClose';
      } else {
        if (frame.state === 'first' && current.kind === '}') {parent.end=current.end; next(); frames.pop(); continue;}
        if (frame.state === 'objectKey' && current.kind === '}')
          throw new JsonFault('TRAILING_COMMA', '对象末尾不能有逗号', current.start, current.end);
        if (frame.state === 'first' || frame.state === 'objectKey') {
          expect('string', '对象属性名称必须是双引号字符串');
          const keyToken = current, key = JSON.parse(source.slice(current.start,current.end));
          warnSurrogate(key, keyToken.start, keyToken.end);
          totalKeys++;
          if (totalKeys > policy.keys) throw new JsonFault('KEY_LIMIT', `最多 ${policy.keys} 个对象成员`, current.start, current.end);
          const occurrence = frame.occurrences.get(key) ?? 0;
          frame.occurrences.set(key, occurrence + 1);
          if (occurrence > 0) duplicateKeys++;
          if (occurrence > 0 && warnings.length < policy.diagnostics) {
            warnings.push({code:'DUPLICATE_KEY', severity: policy.duplicate === 'error' ? 'error' : 'warning',
              message:`重复对象属性：${key.slice(0,60)}`,
              span:{start:keyToken.start,end:keyToken.end}, ...locate(index, keyToken.start)});
          }
          if (occurrence > 0 && policy.duplicate === 'error') throw new JsonFault('DUPLICATE_KEY', '存在重复对象属性', keyToken.start, keyToken.end);
          next(); expect(':', '对象属性后必须有冒号'); next();
          const memberIndex = members.length;
          const childId = addValue(parent.id, parent.depth + 1, {kind:'object', memberIndex});
          members.push({key, keyStart:keyToken.start, keyEnd:keyToken.end, valueId:childId, occurrence});
          parent.members.push(memberIndex);
          parent.memberLookup.set(key, occurrence === 0 ? childId : null);
          frame.state = 'commaOrClose';
        }
      }
    }
    if (current.kind !== 'eof') throw new JsonFault('TRAILING_DATA', '根 JSON 值后存在额外内容', current.start, current.end);
    const stats = {total_keys:totalKeys, max_depth:maxDepth, array_count:types.array, object_count:types.object,
      nodes:nodes.length, data_types:types, size_bytes:bytes, duplicate_keys:duplicateKeys};
    return {ok:true, validSyntax:true, source, rootId, nodes, members, diagnostics:warnings, stats, lineStarts:index};
  } catch (error) {
    if (error instanceof JsonFault) return fail(error);
    throw error;
  }
}
