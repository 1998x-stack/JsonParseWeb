import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {TableProjection,TableProjectionError} from '../../packages/json-core/table-projection.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';
import {WorkerClient} from '../../src/worker/client.mjs';
import {computeTableWindow} from '../../src/ui/virtual-table.mjs';

function make(source){const doc=parseLossless(source);assert.equal(doc.ok,true);return new TableProjection(doc);}
const send=(rt,type,payload={},rev=1,n=1)=>rt.dispatch({requestId:n,docId:'doc',revision:rev,type,payload});
test('ordered object columns, duplicate occurrences, null and missing',()=>{
  const t=make('[{"b":1,"a":null,"a":2},{"a":3,"c":4}]');
  assert.deepEqual(t.schema().columns.map(x=>x.display),['b','a','a (#2)','c']);
  assert.equal(new Set(t.schema().columns.map(x=>x.id)).size,4);
  const w=t.window({epoch:0,rowLimit:2,colLimit:4});
  assert.deepEqual(w.rows[0].cells.map(x=>x.preview),['1','null','2','—']);
  assert.deepEqual(w.rows[1].cells.map(x=>x.preview),['—','3','—','4']);
  assert.equal(w.rows[0].cells[1].kind,'null');
  assert.equal(w.rows[1].cells[0].state,'missing');
});
test('lossless numeric representations and escaped names',()=>{
  const t=make('[{"a":9007199254740993,"b":1e+9999},{"a":-0,"b":1.00}]');
  const w=t.window({epoch:0,rowLimit:2,colLimit:2});
  assert.deepEqual(w.rows.map(r=>r.cells.map(c=>c.preview)),
    [['9007199254740993','1e+9999'],['-0','1.00']]);
});
test('mixed and scalar arrays show kind and value',()=>{
  const t=make('[null,false,23,{"a":1},[2],"text"]');
  assert.equal(t.schema().mode,'mixed');
  const w=t.window({epoch:0,rowLimit:6,colLimit:2});
  assert.deepEqual(w.rows.map(r=>r.cells[0].preview),['null','boolean','number','object','array','string']);
  assert.deepEqual(w.rows.map(r=>r.cells[1].preview),['null','false','23','Object (1)','Array (1)','"text"']);
});
test('empty arrays and records with no keys do not break',()=>{
  assert.equal(make('[]').schema().rowCount,0);
  const t=make('[{},{}]');assert.equal(t.schema().columnCount,0);
  assert.equal(t.window({epoch:0,rowLimit:2,colLimit:1}).rows.length,2);
});
test('non-array root is rejected',()=>{
  assert.throws(()=>new TableProjection(parseLossless('{"a":1}')),e=>e.code==='NOT_ARRAY');
});
test('bounded row/column/cell and epoch rules reject invalid requests',()=>{
  const t=make('[{"x":0}]');
  for(const a of [{epoch:1},{epoch:0,rowLimit:81},{epoch:0,colLimit:25},
    {epoch:0,rowOffset:99},{epoch:0,colOffset:99},{epoch:0,rowLimit:80,colLimit:24}]){
    assert.throws(()=>t.window(a),e=>e instanceof TableProjectionError);
  }
  assert.throws(()=>t.schema(0,25),e=>e.code==='INVALID_TABLE_WINDOW');
});
test('50,000 column schema is paged, with correct far-right values',()=>{
  const keys=Array.from({length:50000},(_,i)=>'"k'+i+'":0').join(',');
  const t=make('[{'+keys+'}]');
  assert.equal(t.columnCount,50000);
  assert.equal(t.schema(49988,16).columns.length,12);
  const w=t.window({epoch:0,colOffset:49985,colLimit:15,rowLimit:1});
  assert.equal(w.rows[0].cells.length,15);
  assert.ok(w.rows[0].cells.every(c=>c.preview==='0'));
});
test('99,999 entries + array root are exactly 100k nodes and last page is reachable',()=>{
  const t=make('['+Array(99999).fill('0').join(',')+']');
  const w=t.window({epoch:0,rowOffset:99940,rowLimit:80,colLimit:2});
  assert.equal(w.rows.length,59);
  assert.equal(w.rows.at(-1).rowIndex,99998);
});
test('long source scalar and HTML key are capped, inert and safely previewed',()=>{
  const key='<img src=x onerror=alert(1)>'+'x'.repeat(150);
  const t=make('[{'+JSON.stringify(key)+':"'+('z'.repeat(90000))+'"}]');
  assert.ok(t.schema().columns[0].truncated);
  assert.ok(t.window({epoch:0,colLimit:1}).rows[0].cells[0].preview.length<=121);
});
test('row cache stays bounded while scanning thousands of sparse rows',()=>{
  const t=make('['+Array(200).fill('{"x":0}').join(',')+']');
  for(let i=0;i<200;i++)t.window({epoch:0,rowOffset:i,rowLimit:1,colLimit:1});
  assert.ok(t.rowCache.size<=96);
});
test('Worker table state is revisioned and initialized separately',()=>{
  const rt=createWorkerRuntime();
  assert.equal(send(rt,'GET_TABLE_SCHEMA').error.code,'STALE_DOCUMENT');
  assert.equal(send(rt,'PARSE',{source:'[{"x":null,"x":9007199254740993}]'}).ok,true);
  assert.equal(send(rt,'GET_TABLE_WINDOW',{epoch:0}).error.code,'TABLE_NOT_INITIALIZED');
  const schema=send(rt,'GET_TABLE_SCHEMA',{}).payload;
  assert.equal(schema.columnCount,2);
  const w=send(rt,'GET_TABLE_WINDOW',{epoch:0,rowLimit:1,colLimit:2}).payload;
  assert.equal(w.rows[0].cells[1].preview,'9007199254740993');
  assert.equal(send(rt,'GET_TABLE_WINDOW',{epoch:1}).error.code,'TABLE_EPOCH_CONFLICT');
  send(rt,'PARSE',{source:'[1]'},2,10);
  assert.equal(send(rt,'GET_TABLE_WINDOW',{epoch:0},1,11).error.code,'STALE_DOCUMENT');
  assert.equal(send(rt,'GET_TABLE_WINDOW',{epoch:0},2,12).error.code,'TABLE_NOT_INITIALIZED');
});
test('actual Node Worker threads support virtual table protocol',async()=>{
  const client=new WorkerClient({workerFactory:()=>new Worker(new URL('./worker-thread-entry.mjs',import.meta.url),{type:'module'})});
  try{
    await client.parse('doc',1,'[{"id":9007199254740993},{"id":null}]');
    const s=await client.query('GET_TABLE_SCHEMA');
    const w=await client.query('GET_TABLE_WINDOW',{epoch:s.epoch,rowLimit:2,colLimit:1});
    assert.deepEqual(w.rows.map(r=>r.cells[0].preview),['9007199254740993','null']);
  }finally{client.close();}
});
test('2D viewport geometry is bounded and rejects invalid input',()=>{
  const x=computeTableWindow(99990*34,190*30,450,600,100000,50000);
  assert.ok(x.rowLimit<=48&&x.colLimit<=16);
  assert.equal(x.totalHeight,36+100000*34);
  assert.equal(x.totalWidth,74+50000*190);
  assert.throws(()=>computeTableWindow(NaN,0,200,200,10,10),RangeError);
});
