import test from 'node:test';
import assert from 'node:assert/strict';
import {computeTreeWindow,TREE_WINDOW_LIMIT,TREE_ROW_HEIGHT} from '../../src/ui/virtual-tree.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';

const send=(runtime,type,payload={},revision=1,requestId=1)=>
  runtime.dispatch({type,payload,revision,requestId,docId:'virtual-ui'});

test('geometry: initial window, mid scroll and end are bounded',()=>{
  const first=computeTreeWindow(0,480,100_000);
  assert.equal(first.offset,0);
  assert.ok(first.limit<60);
  assert.equal(first.totalHeight,3_000_000);
  const middle=computeTreeWindow(500_000,480,100_000);
  assert.ok(middle.offset<=Math.floor(500_000/TREE_ROW_HEIGHT));
  assert.ok(middle.end>Math.floor(500_000/TREE_ROW_HEIGHT));
  const end=computeTreeWindow(3_000_000,480,100_000);
  assert.equal(end.end,100_000);
  assert.ok(end.limit<=TREE_WINDOW_LIMIT);
});
test('geometry: empty, tiny and oversized viewport',()=>{
  assert.deepEqual(computeTreeWindow(0,400,0),{offset:0,limit:0,end:0,totalHeight:0});
  assert.deepEqual(computeTreeWindow(0,400,1),{offset:0,limit:1,end:1,totalHeight:30});
  assert.ok(computeTreeWindow(0,10_000,100_000).limit<=120);
  assert.throws(()=>computeTreeWindow(NaN,200,10),RangeError);
  assert.throws(()=>computeTreeWindow(0,200,-1),RangeError);
});
test('geometry: 10,000 deterministic window positions include current viewport',()=>{
  let seed=11939;
  for(let k=0;k<10_000;k++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const top=seed/2**32*2_900_000;
    const res=computeTreeWindow(top,590,100_000);
    const first=Math.floor(top/30);
    assert.ok(res.offset<=first);
    assert.ok(res.end>first);
    assert.ok(res.limit>=1 && res.limit<=120);
    assert.ok(res.offset>=0 && res.end<=100_000);
  }
});
test('Worker protocol matches M04 virtual window geometry and stale epoch is rejected',()=>{
  const r=createWorkerRuntime();
  const source='['+Array(19_999).fill('0').join(',')+']';
  assert.equal(send(r,'PARSE',{source}).payload.validSyntax,true);
  const init=send(r,'TREE_INIT',{expandRoot:true}).payload;
  assert.equal(init.totalVisible,20_000);
  const {offset,limit}=computeTreeWindow(1_000_000,480,init.totalVisible);
  const window=send(r,'GET_TREE_WINDOW',{epoch:init.epoch,offset,limit});
  assert.equal(window.ok,true);
  assert.ok(window.payload.items.length<=120);
  assert.equal(window.payload.items.at(-1).nodeId,19_999);
  const newEpoch=send(r,'TREE_SET_EXPANDED',{nodeId:0,expanded:false,expectedEpoch:init.epoch}).payload.epoch;
  assert.equal(send(r,'GET_TREE_WINDOW',{epoch:init.epoch,offset,limit}).error.code,'TREE_EPOCH_CONFLICT');
  assert.equal(newEpoch,1);
});
