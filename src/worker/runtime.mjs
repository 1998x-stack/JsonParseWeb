/** Pure worker-side dispatcher. The full AST never crosses the Worker boundary. */
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {decodeUtf8} from '../../packages/json-core/import.mjs';
import {JsonFault} from '../../packages/json-core/diagnostics.mjs';
import {formatLossless} from '../../packages/json-core/formatter.mjs';
import {pointerFor, resolvePointer, PointerFault} from '../../packages/json-core/pointer.mjs';

const PAGE_SIZE = 100;
const MAX_PREVIEW = 140;
const MAX_SLICE = 64 * 1024;
const MAX_FORMAT_BYTES = 16 * 1024 * 1024;
const asInt = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const clip = value => value.length > MAX_PREVIEW ? `${value.slice(0,MAX_PREVIEW)}…` : value;
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
    const raw = doc.source.slice(node.start,node.end);
    const preview = node.kind === 'object' ? `Object (${childCount})`
      : node.kind === 'array' ? `Array (${childCount})`
      : clip(raw);
    let pointer = null;
    try {pointer = pointerFor(doc,id);} catch (error) {if (!(error instanceof PointerFault) || error.code !== 'AMBIGUOUS_MEMBER') throw error;}
    return {id, kind:node.kind, depth:node.depth, label, occurrence, span:{start:node.start,end:node.end},
      hasChildren, childCount, preview, pointer, ambiguous:pointer===null, rawNumber:node.kind==='number'?node.rawNumber:undefined};
  };
  const parse = (request, parsed) => {
    // Keep invalid documents too, so the following query returns an explicit validation error.
    state={docId:request.docId,revision:request.revision,doc:parsed};
    return parsed.ok
      ? {validSyntax:true,root:project(parsed,parsed.rootId),stats:parsed.stats,diagnostics:parsed.diagnostics.slice(0,100)}
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
