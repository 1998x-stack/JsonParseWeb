import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {WorkerClient,WorkerRequestError} from '../../src/worker/client.mjs';
import {DocumentController} from '../../src/document/controller.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';

const createClient=()=>new WorkerClient({workerFactory:()=>new Worker(new URL('./worker-thread-entry.mjs',import.meta.url),{type:'module'})});
const rt=()=>createWorkerRuntime();
const send=(runtime,type,payload={},revision=1,requestId=1)=>runtime.dispatch({type,payload,requestId,revision,docId:'test'});

test('runtime does not send raw source or full AST on PARSE, but preserves exact number preview',()=>{
  const runtime=rt();const r=send(runtime,'PARSE',{source:'{"id":9007199254740993,"id":1.00}'});
  assert.equal(r.ok,true);
  assert.equal(r.payload.stats.duplicate_keys,1);
  assert.equal(r.payload.root.preview,'Object (2)');
  assert.equal(Object.hasOwn(r.payload,'source'),false);
  assert.equal(Object.hasOwn(r.payload,'nodes'),false);
  const children=send(runtime,'GET_CHILDREN',{id:0,offset:0,limit:100},1,2);
  assert.equal(children.ok,true);assert.equal(children.payload.total,2);
  assert.deepEqual(children.payload.items.map(x=>x.preview),['9007199254740993','1.00']);
  assert.deepEqual(children.payload.items.map(x=>x.occurrence),[0,1]);
  assert.equal(children.payload.items[0].pointer,null);
});
test('worker syntax errors returned as invalid summary, not an unhandled failure',()=>{
  const runtime=rt();const r=send(runtime,'PARSE',{source:'{"bad":}'},1,10);
  assert.equal(r.ok,true);assert.equal(r.payload.validSyntax,false);
  assert.equal(r.payload.diagnostics[0].severity,'error');
  assert.equal(send(runtime,'GET_NODE',{id:0},1,11).error.code,'INVALID_DOCUMENT');
});
test('runtime enforces pagination bounds and scalar child errors',()=>{
  const runtime=rt();send(runtime,'PARSE',{source:'[1,2,3]'});
  assert.equal(send(runtime,'GET_CHILDREN',{id:0,offset:0,limit:101}).error.code,'INVALID_PAGE');
  assert.equal(send(runtime,'GET_CHILDREN',{id:1,offset:0,limit:10}).error.code,'NOT_CONTAINER');
  assert.deepEqual(send(runtime,'GET_CHILDREN',{id:0,offset:2,limit:1}).payload.items.map(v=>v.preview),['3']);
  assert.equal(send(runtime,'GET_CHILDREN',{id:0,offset:3,limit:1}).payload.nextOffset,null);
});
test('runtime rejects foreign or stale doc versions',()=>{
  const runtime=rt();send(runtime,'PARSE',{source:'{}'});
  assert.equal(send(runtime,'GET_NODE',{id:0},0,2).error.code,'STALE_DOCUMENT');
  assert.equal(runtime.dispatch({type:'GET_NODE',requestId:3,docId:'other',revision:1,payload:{id:0}}).error.code,'STALE_DOCUMENT');
  assert.equal(runtime.dispatch({type:'GET_NODE',requestId:0,docId:'test',revision:1,payload:{id:0}}).error.code,'INVALID_REQUEST');
  assert.equal(send(runtime,'NO_SUCH_METHOD').error.code,'UNKNOWN_OPERATION');
});
test('format and JSON Pointer operate inside worker with lossless source',()=>{
  const runtime=rt();send(runtime,'PARSE',{source:'{"a/b":[-0,1.00,1e+9999]}'});
  const p=send(runtime,'RESOLVE_POINTER',{pointer:'/a~1b/2'},1,2).payload.node;
  assert.equal(p.preview,'1e+9999');assert.equal(p.pointer,'/a~1b/2');
  assert.equal(send(runtime,'GET_SOURCE_SLICE',{id:p.id},1,3).payload.source,'1e+9999');
  const pretty=send(runtime,'FORMAT',{indent:2},1,4).payload.source;
  assert.match(pretty,/1e\+9999/);assert.match(pretty,/-0/);
  assert.equal(send(runtime,'FORMAT',{indent:99},1,5).error.code,'INVALID_INDENT');
});
test('input bytes decoded strictly in worker and invalid file reports diagnostic',()=>{
  const runtime=rt();const valid=send(runtime,'PARSE_BYTES',{buffer:new TextEncoder().encode('{"x":true}').buffer});
  assert.equal(valid.payload.validSyntax,true);
  assert.equal(send(runtime,'GET_NODE',{id:0},1,2).ok,true);
  const invalid=send(runtime,'PARSE_BYTES',{buffer:new Uint8Array([0xc3,0x28]).buffer},2,3);
  assert.equal(invalid.ok,true);assert.equal(invalid.payload.validSyntax,false);
  assert.equal(invalid.payload.diagnostics[0]?.code,'INVALID_UTF8');
});
test('bounded projection returns <=100 rows and capped previews',()=>{
  const runtime=rt();send(runtime,'PARSE',{source:'['+Array(220).fill('"'+'x'.repeat(300)+'"').join(',')+']'});
  const first=send(runtime,'GET_CHILDREN',{id:0,limit:100}).payload;
  assert.equal(first.items.length,100);assert.equal(first.nextOffset,100);
  assert.ok(first.items[0].preview.length<=141);
  const next=send(runtime,'GET_CHILDREN',{id:0,offset:200,limit:100}).payload;
  assert.equal(next.items.length,20);assert.equal(next.nextOffset,null);
});
test('source slice cap prevents huge Worker messages',()=>{
  const runtime=rt();send(runtime,'PARSE',{source:'"'+'x'.repeat(66_000)+'"'});
  assert.equal(send(runtime,'GET_SOURCE_SLICE',{id:0}).error.code,'SLICE_TOO_LARGE');
});
test('runtime one active document is replaced on parse, previous version blocked',()=>{
  const runtime=rt();send(runtime,'PARSE',{source:'{"a":1}'},1,1);
  send(runtime,'PARSE',{source:'[false]'},2,2);
  assert.equal(send(runtime,'GET_NODE',{id:1},1,3).error.code,'STALE_DOCUMENT');
  assert.equal(send(runtime,'GET_NODE',{id:1},2,4).payload.node.preview,'false');
});
test('worker request exposes no arbitrary JS execution / call forwarding',()=>{
  const runtime=rt();
  for(const type of ['__proto__','constructor','toString']) {
    const r=send(runtime,type);assert.equal(r.ok,false);
  }
});

test('Node worker_threads: parse, query, format and lifecycle',async()=>{
  const client=createClient();
  try {
    const summary=await client.parse('doc',1,'{"id":9007199254740993}');
    assert.equal(summary.validSyntax,true);
    const children=await client.query('GET_CHILDREN',{id:0,limit:10});
    assert.equal(children.items[0].preview,'9007199254740993');
    const format=await client.query('FORMAT',{indent:2});
    assert.match(format.source,/9007199254740993/);
    await assert.rejects(client.query('GET_NODE',{id:0},'doc',0),e=>e.code==='STALE_DOCUMENT');
  }finally {client.close();}
});
test('hard cancel rejects in-flight parse and restarts Worker safely',async()=>{
  const client=createClient();
  try {
    const promise=client.parse('doc',1,'['+Array(70_000).fill('0').join(',')+']');
    client.cancel('user cancelled');
    await assert.rejects(promise,e=>e.code==='CANCELLED');
    const result=await client.parse('doc',2,'false');
    assert.equal(result.root.preview,'false');
  }finally{client.close();}
});
test('repeated 40 parses accept only latest result and never keep old Worker state',async()=>{
  const client=createClient();
  try{
    const promises=[];
    for(let revision=1;revision<=40;revision++) promises.push(client.parse('doc',revision,`{"revision":${revision}}`));
    const outcomes=await Promise.allSettled(promises);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,39);
    const node=await client.query('GET_CHILDREN',{id:0,offset:0,limit:1});
    assert.equal(node.items[0].preview,'40');
  }finally{client.close();}
});
test('controller invalidates old work on edits and preserves state snapshots',async()=>{
  const client=createClient();const events=[];
  const controller=new DocumentController(client,{onChange:x=>events.push(x)});
  try {
    controller.setSource('{"a":1}');
    const slow=controller.parse();
    controller.setSource('{"b":9007199254740993}');
    const latest=controller.parse();
    assert.equal((await latest).validSyntax,true);
    assert.equal(await slow,null);
    assert.equal(controller.snapshot.phase,'ready');
    assert.equal((await controller.query('GET_CHILDREN',{id:0,limit:1})).items[0].preview,'9007199254740993');
    controller.setSource('bad');
    assert.equal((await controller.parse()).validSyntax,false);
    assert.equal(controller.snapshot.phase,'invalid');
    assert.ok(events.includes(events.find(x=>x.phase==='parsing')));
  }finally{controller.destroy();}
});
test('controller cancel while parse works, later parse recovers',async()=>{
  const controller=new DocumentController(createClient());
  try {
    controller.setSource('['+Array(60_000).fill('0').join(',')+']');
    const old=controller.parse();controller.cancel();
    assert.equal(await old,null);
    assert.equal(controller.snapshot.phase,'cancelled');
    controller.setSource('null');
    await controller.parse();assert.equal(controller.snapshot.phase,'ready');
  } finally{controller.destroy();}
});
test('client backpressure rejects additional pending requests',async()=>{
  const client=new WorkerClient({workerFactory:()=>new Worker(new URL('./worker-thread-entry.mjs',import.meta.url),{type:'module'}),maxPending:1});
  try {
    const first=client.parse('doc',1,'[1]');
    await assert.rejects(client.query('GET_NODE',{id:0}),e=>e.code==='BACKPRESSURE');
    assert.equal((await first).validSyntax,true);
  } finally{client.close();}
});
