import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSourceSpan,boundedSourcePreview} from '../../src/ui/node-details.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';

const send=(runtime,type,payload={},revision=1,requestId=1)=>
  runtime.dispatch({type,payload,revision,requestId,docId:'m04-d'});

test('exact span copy preserves numeric lexemes, escapes and duplicate members',()=>{
  const raw='{"a":9007199254740993,"a":1.00,"line":"a\\nb"}';
  const runtime=createWorkerRuntime();
  assert.equal(send(runtime,'PARSE',{source:raw}).payload.validSyntax,true);
  for(const [id,expected] of [[1,'9007199254740993'],[2,'1.00'],[3,'"a\\nb"']]){
    const node=send(runtime,'GET_NODE',{id},1,id+10).payload.node;
    assert.equal(exactSourceSpan(raw,node.span),expected);
  }
  const object=send(runtime,'GET_NODE',{id:0},1,33).payload.node;
  assert.equal(exactSourceSpan(raw,object.span),raw);
});

test('UTF-16 spans preserve surrogate pairs on exact copy',()=>{
  const input='{"a":"🌟中文"}';
  const runtime=createWorkerRuntime();
  send(runtime,'PARSE',{source:input});
  const node=send(runtime,'GET_NODE',{id:1},1,5).payload.node;
  assert.equal(exactSourceSpan(input,node.span),'"🌟中文"');
  const clipped=boundedSourcePreview(input,node.span,2);
  assert.equal(clipped.text,'"'); // cannot cut after the high surrogate
  assert.equal(clipped.truncated,true);
});

test('preview is bounded while exact text can exceed 64 KiB',()=>{
  const source='"'+'x'.repeat(80_000)+'"';
  const preview=boundedSourcePreview(source,{start:0,end:source.length},200);
  assert.equal(preview.text.length,200);
  assert.equal(preview.totalLength,source.length);
  assert.equal(preview.truncated,true);
  assert.equal(exactSourceSpan(source,{start:0,end:source.length}),source);
});

test('reject unsafe spans and invalid preview limit',()=>{
  for(const span of [{start:-1,end:2},{start:2,end:1},{start:0,end:9},{start:0.1,end:1},null])
    assert.throws(()=>exactSourceSpan('abc',span),RangeError);
  assert.throws(()=>boundedSourcePreview('abc',{start:0,end:3},0),RangeError);
});

test('reveal deep JSON Pointer expands ancestors and returns matching original source span',()=>{
  const source='{"a/b":[{"m~n":9007199254740993}],"x":false}';
  const runtime=createWorkerRuntime();
  send(runtime,'PARSE',{source});
  const init=send(runtime,'TREE_INIT',{expandRoot:true},1,2).payload;
  const r=send(runtime,'TREE_REVEAL',{pointer:'/a~1b/0/m~0n',expectedEpoch:init.epoch},1,3);
  assert.equal(r.ok,true);
  assert.equal(exactSourceSpan(source,r.payload.span),'9007199254740993');
  assert.ok(r.payload.totalVisible>init.totalVisible);
  const w=send(runtime,'GET_TREE_WINDOW',{epoch:r.payload.epoch,offset:r.payload.rowIndex,limit:1},1,4);
  assert.equal(w.payload.items[0].nodeId,r.payload.nodeId);
  assert.equal(w.payload.items[0].preview,'9007199254740993');
});

test('duplicate-key pointer ambiguity leaves current expansion epoch unchanged',()=>{
  const runtime=createWorkerRuntime();
  send(runtime,'PARSE',{source:'{"a":1,"a":2}'});
  const initial=send(runtime,'TREE_INIT',{expandRoot:true},1,2).payload;
  const response=send(runtime,'TREE_REVEAL',{pointer:'/a',expectedEpoch:initial.epoch},1,3);
  assert.equal(response.ok,false);
  assert.equal(response.error.code,'AMBIGUOUS_MEMBER');
  const after=send(runtime,'TREE_INIT',{},1,4).payload;
  assert.equal(after.epoch,initial.epoch);
  assert.equal(after.totalVisible,initial.totalVisible);
  const member=send(runtime,'GET_NODE',{id:2},1,5).payload.node;
  assert.equal(member.pointer,null);
  assert.equal(member.occurrence,1);
});
