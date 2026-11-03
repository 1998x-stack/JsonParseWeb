/** PRODUCT-02: deterministic, source-linked interoperability findings.
 * No JSON.parse of the authoritative source, no network access, no schema inference.
 */
import {locate} from './diagnostics.mjs';

const SAFE = '9007199254740991';
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/;
const MAX_EXCERPT = 86;
const POINTER_PART = value => value.replaceAll('~','~0').replaceAll('/','~1');

export function unsafeIntegerLexeme(raw) {
  if (typeof raw !== 'string' || !INTEGER.test(raw)) return false;
  const digits = raw[0] === '-' ? raw.slice(1) : raw;
  return digits.length > SAFE.length || (digits.length === SAFE.length && digits > SAFE);
}

/** Returns path only when all object ancestors have unique decoded key names. */
export function safePointer(doc, nodeId) {
  let cursor=doc.nodes[nodeId];
  if (!cursor) return null;
  const path=[];
  while(cursor.parentId !== null) {
    const parent=doc.nodes[cursor.parentId];
    if(cursor.edge?.kind==='array') path.push(String(cursor.edge.index));
    else if(cursor.edge?.kind==='object') {
      const member=doc.members[cursor.edge.memberIndex];
      if(parent.memberLookup.get(member.key) !== cursor.id) return null;
      path.push(POINTER_PART(member.key));
    } else return null;
    cursor=parent;
  }
  return path.reverse().map(part=>`/${part}`).join('');
}

function sourceRef(doc, nodeId, span) {
  return {nodeId, span, pointer:safePointer(doc,nodeId)};
}

const clip = str => str.length <= MAX_EXCERPT ? str : str.slice(0,MAX_EXCERPT) + '…';

/**
 * Runs within Worker, retaining source ownership. At most `maxFindings` public
 * findings are retained. Total matches and truncation are reported honestly.
 */
export function inspectDocument(doc, {maxFindings=100}={}) {
  if (!doc?.ok) throw new TypeError('A valid lossless AST is required');
  if (!Number.isSafeInteger(maxFindings) || maxFindings < 1 || maxFindings > 1000)
    throw new RangeError('maxFindings must be within 1..1000');
  const findings=[];
  let matched=0;
  const push = f => {
    matched++;
    if (findings.length<maxFindings) findings.push({...f,id:`finding-${matched}`,basis:'deterministic',severity:'warning',ruleVersion:'1.0.0'});
  };
  for(const node of doc.nodes) {
    if(node.kind !== 'number' || !unsafeIntegerLexeme(node.rawNumber)) continue;
    const span={start:node.start,end:node.end};
    push({ruleId:'JSON.UNSAFE_INTEGER',titleKey:'findingUnsafe',explanationKey:'explainUnsafe',
      primary:sourceRef(doc,node.id,span),related:[],snippet:clip(node.rawNumber),
      line:locate(doc.lineStarts,span.start).line});
  }
  // Compare decoded keys, preserving all duplicate occurrences and both key-token spans.
  // Do not assume property names like "__proto__" are safe object keys.
  for(const node of doc.nodes) {
    if(node.kind!=='object')continue;
    const first=new Map();
    for(const memberIndex of node.members) {
      const member=doc.members[memberIndex];
      if(!first.has(member.key)) {first.set(member.key,member);continue;}
      const original=first.get(member.key);
      const span={start:member.keyStart,end:member.keyEnd};
      push({ruleId:'JSON.DUPLICATE_KEY',titleKey:'findingDuplicate',explanationKey:'explainDuplicate',
        primary:{...sourceRef(doc,member.valueId,span),occurrence:member.occurrence},
        related:[{...sourceRef(doc,original.valueId,{start:original.keyStart,end:original.keyEnd}),occurrence:0}],
        snippet:clip(member.key),line:locate(doc.lineStarts,span.start).line});
    }
  }
  // Sort in source order to make review and focus predictably follow the file.
  findings.sort((a,b)=>a.primary.span.start-b.primary.span.start);
  return {
    total:matched,retained:findings.length,truncated:matched>findings.length,
    severityCounts:{warning:matched},findings,
    rules:['JSON.UNSAFE_INTEGER','JSON.DUPLICATE_KEY']
  };
}
