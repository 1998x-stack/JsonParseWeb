/** Pure worker-side dispatcher. The full AST never crosses the Worker boundary. */
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {decodeUtf8} from '../../packages/json-core/import.mjs';
import {JsonFault} from '../../packages/json-core/diagnostics.mjs';
import {formatLossless} from '../../packages/json-core/formatter.mjs';
import {pointerFor, resolvePointer, PointerFault} from '../../packages/json-core/pointer.mjs';
import {VisibleTreeIndex} from '../../packages/json-core/visible-index.mjs';
import {TableProjection} from '../../packages/json-core/table-projection.mjs';
import {inspectDocument} from '../../packages/json-core/findings.mjs';

const PAGE_SIZE = 100;
const MAX_PREVIEW = 140;
const MAX_LABEL = 160;
const MAX_SLICE = 64 * 1024;
const MAX_FORMAT_BYTES = 16 * 1024 * 1024;
const asInt = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const boundedLabel = value => {
  if (value.length <= MAX_LABEL) return value;
  let end = MAX_LABEL;
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return value.slice(0, end) + '…';
};
const previewScalar = (source, start, end) => {
  // Never allocate a full source slice for a potentially huge scalar.
  let tail = Math.min(start + MAX_PREVIEW, end);
  if (tail < end) {
    const code = source.charCodeAt(tail - 1);
    if (code >= 0xd800 && code <= 0xdbff) tail--; // preserve surrogate pairs
  }
  return source.slice(start, tail) + (tail < end ? '…' : '');
};
const protocolError = (code, message) => Object.assign(new Error(message), {code});

export function createWorkerRuntime() {
  let state = null; // one active revision; worker is re-created on each new parse
  const requireState = request => {
    if (!state || state.docId !== request.docId || state.revision !== request.revision)
      throw protocolError('STALE_DOCUMENT', '当前请求不属于已解析的文档版本');
    if (!state.doc.ok) throw protocolError('INVALID_DOCUMENT', '无法查询未通过校验的 JSON');
    return state.doc;
  };
  const project = (doc, id, label = null, occurrence = null) => {
    const node = doc.nodes[id];
    if (!node) throw protocolError('INVALID_NODE', '节点不存在');
    const hasChildren = node.kind === 'array' ? node.children.length > 0 : node.kind === 'object' && node.members.length > 0;
    const childCount = node.kind === 'array' ? node.children.length : node.kind === 'object' ? node.members.length : 0;
    const preview = node.kind === 'object' ? `Object (${childCount})`
      : node.kind === 'array' ? `Array (${childCount})`
      : previewScalar(doc.source, node.start, node.end);
    let pointer = null;
    try {pointer = pointerFor(doc,id);} catch (error) {if (!(error instanceof PointerFault) || error.code !== 'AMBIGUOUS_MEMBER') throw error;}
    return {id, kind:node.kind, depth:node.depth, label, occurrence, span:{start:node.start,end:node.end},
      hasChildren, childCount, preview, pointer, ambiguous:pointer===null, rawNumber:node.kind==='number'?node.rawNumber:undefined};
  };
  // New M04 windows never compute JSON Pointer and never expose unbounded rawNumber.
  const projectTreeRow = (doc, tree, id) => {
    const node = doc.nodes[id];
    const parent = node.parentId === null ? null : doc.nodes[node.parentId];
    let label = null, occurrence = null, posInSet = 1, setSize = 1;
    if (node.edge?.kind === 'array') {
      label = String(node.edge.index);
      posInSet = node.edge.index + 1;
      setSize = parent.children.length;
    } else if (node.edge?.kind === 'object') {
      const member = doc.members[node.edge.memberIndex];
      label = boundedLabel(member.key);
      occurrence = member.occurrence;
      // O(1) lookup: built once when TREE_INIT runs, not a sibling scan per row.
      posInSet = state.siblingPositions[id];
      setSize = parent.members.length;
    }
    const childCount = node.kind === 'array' ? node.children.length : node.kind === 'object' ? node.members.length : 0;
    const preview = node.kind === 'object' ? `Object (${childCount})`
      : node.kind === 'array' ? `Array (${childCount})`
      : previewScalar(doc.source, node.start, node.end);
    return {id, nodeId: id, parentId: node.parentId, kind: node.kind, depth: node.depth,
      label, occurrence, labelTruncated: node.edge?.kind === 'object' && doc.members[node.edge.memberIndex].key.length > MAX_LABEL,
      posInSet, setSize, childCount, hasChildren: childCount > 0,
      expanded: tree.isExpanded(id), preview, span: {start: node.start, end: node.end}};
  };
  const requireTree = request => {
    const doc = requireState(request);
    if (!state.tree) throw protocolError('TREE_NOT_INITIALIZED', '请先初始化树视图');
    return {doc, tree: state.tree};
  };
  const parse = (request, parsed) => {
    // Keep invalid documents too, so the following query returns an explicit validation error.
    state={docId:request.docId,revision:request.revision,doc:parsed,tree:null,table:null,inspection:parsed.ok?inspectDocument(parsed):null};
    return parsed.ok
      ? {validSyntax:true,root:project(parsed,parsed.rootId),stats:parsed.stats,diagnostics:parsed.diagnostics.slice(0,100),inspection:{total:state.inspection.total,retained:state.inspection.retained,truncated:state.inspection.truncated,rules:state.inspection.rules}}
      : {validSyntax:false,root:null,stats:null,diagnostics:parsed.diagnostics?.length ? parsed.diagnostics.slice(0,100) : [parsed.error ?? {code:'INVALID_JSON',severity:'error',message:'无法解析 JSON'}]};
  };
  const operations = {
    PARSE(request) {
      if (typeof request.payload?.source !== 'string') throw protocolError('INVALID_INPUT','source 必须为字符串');
      return parse(request,parseLossless(request.payload.source));
    },
    PARSE_BYTES(request) {
      const {buffer,bom='reject'} = request.payload ?? {};
      if (!(buffer instanceof ArrayBuffer)) throw protocolError('INVALID_INPUT','buffer 必须为可转移 ArrayBuffer');
      try {
        const decoded=decodeUtf8(buffer,{bom});
        const parsed=parseLossless(decoded.source);
        if(parsed.ok && decoded.bomStripped) parsed.diagnostics.unshift({code:'BOM_STRIPPED',severity:'warning',message:'已按策略去除 BOM',span:{start:0,end:0},line:1,column:1});
        return {...parse(request,parsed), importedSource:decoded.source};
      } catch(error) {
        if(!(error instanceof JsonFault)) throw error;
        return parse(request,{ok:false,error:{code:error.code,severity:'error',message:error.message,span:{start:error.start,end:error.end},line:1,column:1},diagnostics:[]});
      }
    },
    TREE_INIT(request) {
      const doc = requireState(request);
      const expandRoot = request.payload?.expandRoot ?? true;
      if (typeof expandRoot !== 'boolean') throw protocolError('INVALID_EXPANSION', 'expandRoot 必须为布尔值');
      if (state.tree) return state.tree.snapshot(); // TREE_INIT is idempotent within a document revision.
      state.tree = new VisibleTreeIndex(doc, {expandRoot});
      // Build one dense sibling-position index so a 50k-column object can scroll
      // without O(50k * windowRows) sibling indexOf() calls per viewport.
      state.siblingPositions = new Uint32Array(doc.nodes.length);
      for (const node of doc.nodes) {
        if (node.kind !== 'object') continue;
        for (let i = 0; i < node.members.length; i++)
          state.siblingPositions[doc.members[node.members[i]].valueId] = i + 1;
      }
      return state.tree.snapshot();
    },
    TREE_SET_EXPANDED(request) {
      const {tree} = requireTree(request);
      const {nodeId, expanded, expectedEpoch} = request.payload ?? {};
      return tree.setExpanded(nodeId, expanded, expectedEpoch);
    },
    GET_TREE_WINDOW(request) {
      const {doc,tree} = requireTree(request);
      const {epoch, offset = 0, limit = 50} = request.payload ?? {};
      const window = tree.getWindow(epoch, offset, limit);
      const {ids, ...metadata} = window;
      return {...metadata, items: ids.map(id => projectTreeRow(doc, tree, id))};
    },
    TREE_REVEAL(request) {
      const {doc,tree} = requireTree(request);
      const {nodeId, pointer, expectedEpoch} = request.payload ?? {};
      const hasId = nodeId !== undefined, hasPointer = pointer !== undefined;
      if (hasId === hasPointer) throw protocolError('INVALID_REVEAL', '必须且只能提供 nodeId 或 pointer');
      let targetId;
      if (hasPointer) {
        if (typeof pointer !== 'string' || pointer.length > 8192)
          throw protocolError('INVALID_POINTER', 'JSON Pointer 无效或过长');
        targetId = resolvePointer(doc, pointer);
      } else {
        if (!asInt(nodeId, 0, doc.nodes.length - 1)) throw protocolError('INVALID_NODE', '目标节点不存在');
        targetId = nodeId;
      }
      const result = tree.reveal(targetId, expectedEpoch);
      const node = doc.nodes[targetId];
      return {...result, span: {start: node.start, end: node.end}};
    },
    GET_FINDINGS(request) {
      requireState(request);
      const {offset=0,limit=12}=request.payload??{};
      if(!asInt(offset,0,1000)||!asInt(limit,1,30))throw protocolError('INVALID_PAGE','Finding page exceeds allowed range');
      const result=state.inspection;
      return {offset,total:result.total,retained:result.retained,truncated:result.truncated,
        items:result.findings.slice(offset,offset+limit),
        nextOffset:offset+limit<result.retained?offset+limit:null};
    },
    GET_TABLE_SCHEMA(request) {
      const doc=requireState(request);
      const {offset=0,limit=16}=request.payload??{};
      if(!state.table) state.table=new TableProjection(doc);
      return state.table.schema(offset,limit);
    },
    GET_TABLE_WINDOW(request) {
      requireState(request);
      if(!state.table) throw protocolError('TABLE_NOT_INITIALIZED','请先获取表格 Schema');
      return state.table.window(request.payload??{});
    },
    GET_NODE(request) {
      const doc = requireState(request), id=request.payload?.id;
      if (!asInt(id,0,doc.nodes.length-1)) throw protocolError('INVALID_NODE','节点不存在');
      const node=doc.nodes[id];
      let label=null,occurrence=null;
      if(node.edge?.kind==='array') label=String(node.edge.index);
      else if(node.edge?.kind==='object') {
        const member=doc.members[node.edge.memberIndex]; label=member.key;occurrence=member.occurrence;
      }
      return {node:project(doc,id,label,occurrence)};
    },
    GET_CHILDREN(request) {
      const doc=requireState(request), {id,offset=0,limit=50}=request.payload ?? {};
      if (!asInt(id,0,doc.nodes.length-1)) throw protocolError('INVALID_NODE','节点不存在');
      if (!asInt(offset,0,doc.nodes.length) || !asInt(limit,1,PAGE_SIZE))
        throw protocolError('INVALID_PAGE','分页参数无效或超出限制');
      const parent=doc.nodes[id];
      if(parent.kind!=='array' && parent.kind!=='object') throw protocolError('NOT_CONTAINER','无法枚举标量节点');
      const count=parent.kind==='array'?parent.children.length:parent.members.length;
      const items=[];
      for(let i=offset;i<Math.min(count,offset+limit);i++) {
        if(parent.kind==='array') items.push(project(doc,parent.children[i],String(i)));
        else {const member=doc.members[parent.members[i]];items.push(project(doc,member.valueId,member.key,member.occurrence));}
      }
      return {parentId:id,offset,total:count,items,nextOffset:offset+items.length<count?offset+items.length:null};
    },
    GET_SOURCE_SLICE(request) {
      const doc=requireState(request), id=request.payload?.id;
      if (!asInt(id,0,doc.nodes.length-1)) throw protocolError('INVALID_NODE','节点不存在');
      const node=doc.nodes[id], length=node.end-node.start;
      if(length>MAX_SLICE) throw protocolError('SLICE_TOO_LARGE','节点原文超过单次查询上限');
      return {source:doc.source.slice(node.start,node.end),span:{start:node.start,end:node.end}};
    },
    RESOLVE_POINTER(request) {
      const doc=requireState(request),pointer=request.payload?.pointer;
      if(typeof pointer!=='string'||pointer.length>8192) throw protocolError('INVALID_POINTER','JSON Pointer 无效或过长');
      const id=resolvePointer(doc,pointer);
      return {node:project(doc,id)};
    },
    FORMAT(request) {
      const doc=requireState(request), indent=request.payload?.indent??2;
      if(indent!=='\t' && !asInt(indent,1,8)) throw protocolError('INVALID_INDENT','缩进必须为 1–8 或制表符');
      return {source:formatLossless(doc,{indent,maxOutputBytes:MAX_FORMAT_BYTES})};
    },
  };
  function dispatch(request) {
    const base={requestId:request?.requestId,docId:request?.docId,revision:request?.revision};
    try {
      if(!asInt(base.requestId,1,Number.MAX_SAFE_INTEGER) || typeof base.docId!=='string' ||
        !base.docId || base.docId.length>128 || !asInt(base.revision,0,Number.MAX_SAFE_INTEGER))
        throw protocolError('INVALID_REQUEST','请求标识或版本不合法');
      if(!Object.hasOwn(operations,request.type)) throw protocolError('UNKNOWN_OPERATION','不支持的 Worker 操作');
      return {...base,ok:true,payload:operations[request.type](request)};
    } catch(error) {
      return {...base,ok:false,error:{code:error?.code||'WORKER_FAILURE',message:error?.message||'Worker 操作失败'}};
    }
  }
  return {dispatch};
}
