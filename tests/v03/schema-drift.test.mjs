import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {analyzeSchemaDrift} from '../../packages/json-core/schema-drift.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';
import {WorkerClient} from '../../src/worker/client.mjs';
import {Worker} from 'node:worker_threads';

const doc=source=>{const d=parseLossless(source);assert.equal(d.ok,true,`${source.slice(0,100)} ${JSON.stringify(d.error)}`);return d;};
const analyze=(...sources)=>analyzeSchemaDrift(sources.map((s,i)=>({id:i===0?'current':`sample-${i}`,doc:doc(s)})));
const request=(runtime,type,payload={},revision=1,id=1)=>runtime.dispatch({type,payload,docId:'current',revision,requestId:id});
const factory=()=>new Worker(new URL('./worker-thread-entry.mjs',import.meta.url),{type:'module'});

test('object-array drift produces truthful denominators, null/missing separation and low-severity observations',()=>{
  const data=analyze('[{"price":19.5,"region":"US"},{"price":18.0},{"price":"19.5","region":null},{"region":"EU"},{"price":null,"region":"JP"}]');
  assert.equal(data.mode,'array');assert.equal(data.eligibleRecords,5);assert.equal(data.excludedValues,0);
  const price=data.fields.find(x=>x.key==='price');
  assert.deepEqual({present:price.present,missing:price.missing,nullCount:price.nullCount,types:price.types},
    {present:4,missing:1,nullCount:1,types:{number:2,string:1,null:1}});
  assert.deepEqual(new Set(data.observations.map(x=>x.ruleId)),new Set(['SCHEMA.TYPE_VARIANCE','SCHEMA.MISSING_FIELD','SCHEMA.NULL_VARIANCE']));
  for(const x of data.observations){assert.equal(x.basis,'sample_observation');assert.equal(x.severity,'info');assert.equal(x.eligible,5);}
  assert.ok(data.observations.some(x=>x.missingExample&&x.primary.pointer==='/3'));
});

test('two eligible samples show distributions without calling valid variation a bug',()=>{
  const result=analyze('[{"price":1},{"price":"1"}]');
  assert.equal(result.eligibleRecords,2);assert.equal(result.totalObservations,0);
  assert.deepEqual(result.fields[0].types,{number:1,string:1});
});

test('root objects across explicit samples can be compared without fabricating a canonical schema',()=>{
  const result=analyze('{"id":1,"active":true}','{"id":"1"}','{"active":false}');
  assert.equal(result.mode,'multi_sample');assert.equal(result.eligibleRecords,3);
  const id=result.fields.find(x=>x.key==='id');
  assert.deepEqual({present:id.present,missing:id.missing,types:id.types},{present:2,missing:1,types:{number:1,string:1}});
  assert.equal(result.totalObservations,3); // id type+missing, active missing
  assert.ok(result.observations.some(x=>x.primary.sampleId==='sample-2'));
});

test('decoded duplicate names never collapse and duplicate occurrences remain addressable',()=>{
  const result=analyze('[{"a":1,"\\u0061":null},{"a":2},{"a":3,"a":true}]');
  assert.equal(result.eligibleRecords,3);
  assert.equal(result.fields.filter(x=>x.key==='a').length,2);
  const duplicates=result.fields.find(x=>x.key==='a'&&x.occurrence===1);
  assert.equal(duplicates.present,2);assert.equal(duplicates.missing,1);
  assert.equal(duplicates.examples.find(e=>e.kind==='null')?.pointer,null);
  assert.ok(result.observations.some(x=>x.occurrence===1 && x.ruleId==='SCHEMA.MISSING_FIELD'));
});

test('mismatched non-object values excluded instead of added to denominator',()=>{
  const result=analyze('[{"x":1},false,{},null,[1],{"x":2}]');
  assert.equal(result.eligibleRecords,3);assert.equal(result.excludedValues,3);
  assert.equal(result.fields[0].present,2);assert.equal(result.fields[0].missing,1);
});

test('number lexeme is exact in evidence, including unsafe integers and negative zero',()=>{
  const source='[{"n":9007199254740993},{"n":-0},{"n":"0"}]';
  const result=analyze(source);
  const field=result.fields.find(x=>x.key==='n');
  assert.equal(field.types.number,2);assert.equal(field.types.string,1);
  const example=field.examples.find(e=>e.kind==='number');
  assert.equal(source.slice(example.span.start,example.span.end),'9007199254740993');
});

test('source evidence points at UTF-16 offsets with escaped keys, pointer slash and tilde encoding',()=>{
  const source='[{"emoji":"😀","a/b~c":null},{"emoji":10,"a/b~c":false},{"emoji":"x","a/b~c":true}]';
  const result=analyze(source);
  const column=result.fields.find(x=>x.key==='a/b~c');
  const example=column.examples.find(x=>x.kind==='null');
  assert.equal(example.pointer,'/0/a~1b~0c');
  assert.equal(source.slice(example.span.start,example.span.end),'null');
  const emoji=result.fields.find(x=>x.key==='emoji');
  assert.equal(source.slice(emoji.examples.find(x=>x.kind==='string').span.start,emoji.examples.find(x=>x.kind==='string').span.end),'"😀"');
});

test('field ordering preserves first observation and does not coerce __proto__',()=>{
  const result=analyze('[{"z":1,"__proto__":null},{"a":2},{"z":true}]');
  assert.deepEqual(result.fields.map(x=>x.key),['z','__proto__','a']);
  assert.equal(Object.prototype.polluted,undefined);
});

test('large wide object analysis enforces bounded public projections and accurate truncation',()=>{
  const keys=Array.from({length:5000},(_,i)=>`"field_${i}":${i}`).join(',');
  const result=analyze(`[{${keys}},{"other":true},{"z":null}]`);
  assert.equal(result.totalFields,5002);
  assert.equal(result.retainedFields,160);
  assert.equal(result.fieldsTruncated,true);
  assert.ok(result.totalObservations>=5000);
  assert.equal(result.retainedObservations,100);
  assert.equal(result.observationsTruncated,true);
});

test('non-object root is not interpreted as an object record',()=>{
  const result=analyze('false');
  assert.equal(result.eligibleRecords,0);assert.equal(result.excludedValues,1);
  assert.equal(result.totalFields,0);assert.equal(result.totalObservations,0);
});

test('worker schema command pages bounded results and rejects stale run IDs',()=>{
  const runtime=createWorkerRuntime();
  assert.equal(request(runtime,'PARSE',{source:'[{"x":1},{"x":null},{}]'}).ok,true);
  const first=request(runtime,'INSPECT_SCHEMA_DRIFT').payload;
  assert.equal(first.eligibleRecords,3);assert.ok(first.totalObservations>0);
  assert.equal(first.observations[0].ruleId,'SCHEMA.TYPE_VARIANCE');
  const second=request(runtime,'INSPECT_SCHEMA_DRIFT').payload;
  assert.equal(second.runId,first.runId+1);
  const stale=request(runtime,'GET_SCHEMA_DRIFT_PAGE',{runId:first.runId,kind:'fields'});
  assert.equal(stale.error.code,'STALE_ANALYSIS');
  const next=request(runtime,'GET_SCHEMA_DRIFT_PAGE',{runId:second.runId,kind:'fields',offset:0,limit:10});
  assert.equal(next.ok,true);assert.equal(next.payload.items.length,1);
});

test('worker analyzes additional source without replacing the active primary AST',()=>{
  const runtime=createWorkerRuntime();request(runtime,'PARSE',{source:'{"a":1}'});
  const data=request(runtime,'INSPECT_SCHEMA_DRIFT',{samples:[
    {id:'sample-1',source:'{"a":"one"}'},{id:'sample-2',source:'{}'}]});
  assert.equal(data.ok,true);assert.equal(data.payload.mode,'multi_sample');
  assert.equal(data.payload.totalObservations,2);
  assert.equal(request(runtime,'GET_NODE',{id:1}).payload.node.preview,'1');
  const fail=request(runtime,'INSPECT_SCHEMA_DRIFT',{samples:[{id:'sample-1',source:'{"bad":}'}]});
  assert.equal(fail.error.code,'SAMPLE_INVALID');
  assert.equal(request(runtime,'GET_NODE',{id:1}).ok,true);
});

test('worker rejects forged ids, huge source, too many samples and malformed parameters',()=>{
  const rt=createWorkerRuntime();request(rt,'PARSE',{source:'{"a":1}'});
  const mk=(id,source)=>({id,source});
  assert.equal(request(rt,'INSPECT_SCHEMA_DRIFT',{samples:[mk('current','{}')]}).error.code,'INVALID_SAMPLE');
  assert.equal(request(rt,'INSPECT_SCHEMA_DRIFT',{samples:[mk('x','{}'),mk('x','{}')]}).error.code,'INVALID_SAMPLE');
  assert.equal(request(rt,'INSPECT_SCHEMA_DRIFT',{samples:Array(6).fill(mk('a','{}'))}).error.code,'SAMPLE_LIMIT');
  assert.equal(request(rt,'INSPECT_SCHEMA_DRIFT',{samples:[mk('x','"'+'z'.repeat(2*1024*1024)+'"')]}).error.code,'SAMPLE_SIZE_LIMIT');
  assert.equal(request(rt,'GET_SCHEMA_DRIFT_PAGE',{runId:1,kind:'__proto__'}).error.code,'STALE_ANALYSIS');
});

test('real Node Worker handles multi-sample drift and old document invalidation',async()=>{
  const client=new WorkerClient({workerFactory:factory});
  try {
    await client.parse('doc',1,'{"price":1}');
    const report=await client.query('INSPECT_SCHEMA_DRIFT',{samples:[
      {id:'sample-1',source:'{"price":"1"}'},
      {id:'sample-2',source:'{"price":null}'}]});
    assert.equal(report.eligibleRecords,3);assert.ok(report.observations.some(x=>x.ruleId==='SCHEMA.TYPE_VARIANCE'));
    const runId=report.runId;
    await client.parse('doc',2,'null');
    await assert.rejects(client.query('GET_SCHEMA_DRIFT_PAGE',{runId,kind:'fields'}),e=>e.code==='STALE_ANALYSIS');
  }finally{client.close();}
});

// A simple independent oracle for optional/missing/null counts on generated valid records.
test('seeded random observations match independent field-count oracle',()=>{
  let seed=17;
  const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/0x100000000;};
  for(let caseNo=0;caseNo<120;caseNo++){
    const objects=[];
    for(let i=0;i<5+(caseNo%12);i++){
      const item={};for(const key of ['x','y','z'])if(rand()<0.72)item[key]=rand()<0.2?null:rand()<0.5?i:String(i);
      objects.push(item);
    }
    const result=analyze(JSON.stringify(objects));
    for(const key of ['x','y','z']){
      const field=result.fields.find(x=>x.key===key);
      const present=objects.filter(x=>Object.hasOwn(x,key)).length;
      const nulls=objects.filter(x=>Object.hasOwn(x,key)&&x[key]===null).length;
      assert.equal(field?.present??0,present);assert.equal(field?.missing??objects.length,objects.length-present);
      assert.equal(field?.nullCount??0,nulls);
    }
  }
});
