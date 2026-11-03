import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {inspectDocument,unsafeIntegerLexeme,safePointer} from '../../packages/json-core/findings.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';
import {PRODUCT_SAMPLES,translate} from '../../src/product/i18n.mjs';

const inspect=source=>inspectDocument(parseLossless(source));
const send=(runtime,type,payload={},revision=1,requestId=1)=>runtime.dispatch({type,docId:'doc',revision,requestId,payload});

test('numeric comparison is exact and does not coerce to Number',()=>{
  for (const raw of ['9007199254740992','9007199254740993','-9007199254740992','123456789012345678901234567890'])
    assert.equal(unsafeIntegerLexeme(raw),true,raw);
  for(const raw of ['9007199254740991','-9007199254740991','-0','1.00','1e+9999','0','1','01'])
    assert.equal(unsafeIntegerLexeme(raw),false,raw);
});

test('precision finding preserves exact raw token and source span',()=>{
  const source=' {"orderId":9007199254740993,"ok":true} ';
  const result=inspect(source);
  assert.equal(result.total,1);
  const finding=result.findings[0];
  assert.equal(finding.ruleId,'JSON.UNSAFE_INTEGER');
  assert.equal(finding.primary.pointer,'/orderId');
  assert.equal(source.slice(finding.primary.span.start,finding.primary.span.end),'9007199254740993');
  assert.equal(finding.basis,'deterministic');
  assert.equal(finding.severity,'warning');
});

test('escaped duplicate key identifies decoded collision and both original key locations',()=>{
  const source='{"a":1,"\\u0061":2,"ok":3}';
  const document=parseLossless(source);
  const result=inspectDocument(document);
  assert.equal(result.total,1);
  const finding=result.findings[0];
  assert.equal(finding.ruleId,'JSON.DUPLICATE_KEY');
  assert.equal(finding.primary.pointer,null);
  assert.equal(finding.related[0].pointer,null);
  assert.equal(source.slice(finding.related[0].span.start,finding.related[0].span.end),'"a"');
  assert.equal(source.slice(finding.primary.span.start,finding.primary.span.end),'"\\u0061"');
  assert.equal(finding.primary.occurrence,1);
  assert.equal(finding.related[0].occurrence,0);
  assert.equal(safePointer(document,1),null);
});

test('duplicate key warnings do not incorrectly flag same names in independent objects',()=>{
  assert.equal(inspect('[{"a":1},{"a":2}]').total,0);
  assert.equal(inspect('{"a":1,"a":2,"a":3}').total,2);
});

test('preserves decoded key paths including slash, tilde and prototype-like names',()=>{
  const source='{"a/b":{"~":{"__proto__":9007199254740993}}}';
  const issues=inspect(source);
  assert.equal(issues.total,1);
  assert.equal(issues.findings[0].primary.pointer,'/a~1b/~0/__proto__');
});

test('findings sort by source spans, not numeric scan then duplicate scan',()=>{
  const issues=inspect('{"a":1,"a":2,"id":9007199254740993}');
  assert.deepEqual(issues.findings.map(x=>x.ruleId),['JSON.DUPLICATE_KEY','JSON.UNSAFE_INTEGER']);
});

test('deterministic bounded findings report counts without exposing unbounded payload',()=>{
  const doc=parseLossless('['+Array(75).fill('9007199254740993').join(',')+']');
  const issues=inspectDocument(doc,{maxFindings:12});
  assert.equal(issues.total,75);assert.equal(issues.retained,12);assert.equal(issues.truncated,true);
  assert.equal(issues.findings.length,12);
});

test('healthy documents are not claimed to be universally safe',()=>{
  assert.equal(inspect('{"a":null,"price":"19.5"}').total,0);
  assert.equal(inspect('1.00').total,0);
});

test('invalid documents never run inspection',()=>{
  assert.throws(()=>inspectDocument(parseLossless('{invalid}')),TypeError);
});

test('worker PARSE returns bounded finding summary; GET_FINDINGS is paginated',()=>{
  const runtime=createWorkerRuntime();
  const source='['+Array(40).fill('9007199254740993').join(',')+']';
  const p=send(runtime,'PARSE',{source});
  assert.equal(p.ok,true);
  assert.equal(p.payload.inspection.total,40);
  assert.equal(Object.hasOwn(p.payload,'findings'),false);
  const first=send(runtime,'GET_FINDINGS',{offset:0,limit:12},1,2);
  assert.equal(first.payload.items.length,12);
  assert.equal(first.payload.nextOffset,12);
  const end=send(runtime,'GET_FINDINGS',{offset:36,limit:12},1,3);
  assert.equal(end.payload.items.length,4);
  assert.equal(end.payload.nextOffset,null);
  assert.equal(send(runtime,'GET_FINDINGS',{offset:0,limit:31},1,4).error.code,'INVALID_PAGE');
});

test('worker invalidation protects finding snapshots',()=>{
  const runtime=createWorkerRuntime();
  send(runtime,'PARSE',{source:'{"x":9007199254740993}'},1,1);
  send(runtime,'PARSE',{source:'{"y":1}'},2,2);
  assert.equal(send(runtime,'GET_FINDINGS',{},1,3).error.code,'STALE_DOCUMENT');
  assert.equal(send(runtime,'GET_FINDINGS',{},2,4).payload.total,0);
});

test('synthetic product demos are valid; two show different actual findings',()=>{
  assert.equal(inspect(PRODUCT_SAMPLES.precision).findings[0].ruleId,'JSON.UNSAFE_INTEGER');
  assert.equal(inspect(PRODUCT_SAMPLES.duplicate).findings[0].ruleId,'JSON.DUPLICATE_KEY');
  assert.equal(inspect(PRODUCT_SAMPLES.escaped).findings[0].ruleId,'JSON.DUPLICATE_KEY');
  assert.equal(translate('en','findingUnsafe'),'Potential JavaScript integer precision loss');
  assert.ok(translate('zh','findingUnsafe').includes('精度'));
});
