import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {VisibleTreeIndex, TreeIndexError} from '../../packages/json-core/visible-index.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';
import {WorkerClient} from '../../src/worker/client.mjs';
import {Worker} from 'node:worker_threads';

const parse = source => {
  const doc = parseLossless(source);
  assert.equal(doc.ok, true, JSON.stringify(doc.error));
  return doc;
};
const childIds = (doc, id) => {
  const n = doc.nodes[id];
  return n.kind === 'array' ? n.children : n.kind === 'object' ? n.members.map(i => doc.members[i].valueId) : [];
};
// Independent reference implementation: no call to production VisibleTreeIndex helpers.
const oracle = (doc, expanded) => {
  const out = [];
  function visit(id) {
    out.push(id);
    if (expanded.has(id)) for (const child of childIds(doc, id)) visit(child);
  }
  visit(doc.rootId);
  return out;
};
const assertIndex = (doc, tree) => {
  const expected = oracle(doc, tree.expanded);
  assert.deepEqual(tree.visibleIds, expected);
  assert.equal(new Set(tree.visibleIds).size, tree.totalVisible);
  assert.deepEqual(tree.getWindow(tree.epoch, 0, Math.min(120, tree.totalVisible)).ids, expected.slice(0, 120));
};
const request = (runtime, type, payload = {}, {revision = 1, requestId = 1, docId = 'doc'} = {}) =>
  runtime.dispatch({type, payload, docId, revision, requestId});
const requireOk = response => {
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.payload;
};

function makeRng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 2 ** 32);
}
function sampleTree(rng, depth = 0) {
  if (depth > 4 || rng() < 0.28) return Math.floor(rng() * 100);
  const count = 1 + Math.floor(rng() * 4);
  if (rng() < 0.5) return Array.from({length: count}, () => sampleTree(rng, depth + 1));
  const value = {};
  for (let i = 0; i < count; i++) value[`key${i}`] = sampleTree(rng, depth + 1);
  return value;
}

test('visible preorder and expand/collapse preserve expanded descendants', () => {
  const doc = parse('{"a":[1,{"b":true}],"c":null}');
  const tree = new VisibleTreeIndex(doc, {expandRoot: true});
  assert.deepEqual(tree.visibleIds, [0, 1, 5]);
  assertIndex(doc, tree);
  assert.equal(tree.setExpanded(1, true, 0).epoch, 1);
  assertIndex(doc, tree);
  assert.equal(tree.setExpanded(3, true, 1).epoch, 2);
  assertIndex(doc, tree);
  const before = tree.visibleIds.slice();
  assert.equal(tree.setExpanded(1, false, 2).epoch, 3);
  assert.deepEqual(tree.visibleIds, [0, 1, 5]);
  assert.equal(tree.setExpanded(1, true, 3).epoch, 4);
  assert.deepEqual(tree.visibleIds, before);
  const noop = tree.setExpanded(1, true, 4);
  assert.equal(noop.changed, false);
  assert.equal(noop.epoch, 4);
});

test('reveal is atomic, expands ancestors, preserves epoch on no-op', () => {
  const doc = parse('{"a":[1,{"b":true}],"c":null}');
  const tree = new VisibleTreeIndex(doc);
  const deepest = doc.nodes.find(x => x.kind === 'boolean').id;
  const revealed = tree.reveal(deepest, 0);
  assert.equal(revealed.changed, true);
  assert.equal(revealed.epoch, 1);
  assert.equal(tree.visibleIds[revealed.rowIndex], deepest);
  assertIndex(doc, tree);
  assert.deepEqual(tree.reveal(deepest, 1), {...revealed, changed:false});
});

test('epoch and malformed mutation requests are rejected without corrupting index', () => {
  const doc = parse('[0,[1],2]');
  const tree = new VisibleTreeIndex(doc, {expandRoot:true});
  assert.throws(() => tree.setExpanded(2, true, 9), e => e.code === 'TREE_EPOCH_CONFLICT');
  assert.throws(() => tree.setExpanded(1, true, 0), e => e.code === 'NOT_CONTAINER');
  assert.throws(() => tree.setExpanded(999, true, 0), e => e.code === 'INVALID_NODE');
  assert.throws(() => tree.setExpanded(2, 'yes', 0), e => e.code === 'INVALID_EXPANSION');
  assert.throws(() => tree.getWindow(0, 0, 121), e => e.code === 'INVALID_WINDOW');
  assert.throws(() => tree.getWindow(1, 0, 1), e => e.code === 'TREE_EPOCH_CONFLICT');
  tree.setExpanded(0, false, 0);
  assert.throws(() => tree.setExpanded(2, true, 1), e => e.code === 'NODE_NOT_VISIBLE');
  assertIndex(doc, tree);
});

test('randomized action traces validate preorder across 12,000 operations', () => {
  let operations = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const rng = makeRng(seed);
    const doc = parse(JSON.stringify(sampleTree(rng)));
    const tree = new VisibleTreeIndex(doc, {expandRoot:true});
    for (let step = 0; step < 400; step++) {
      if (rng() < 0.35) {
        const targetId = Math.floor(rng() * doc.nodes.length);
        tree.reveal(targetId, tree.epoch);
      } else {
        const containers = tree.visibleIds.filter(id => ['object','array'].includes(doc.nodes[id].kind));
        if (containers.length) {
          const id = containers[Math.floor(rng() * containers.length)];
          tree.setExpanded(id, rng() < 0.5, tree.epoch);
        }
      }
      assertIndex(doc, tree);
      operations++;
    }
  }
  assert.equal(operations, 12_000);
});

test('100k AST nodes expandable without spread-argument overflow; tail window exact', () => {
  const doc = parse(`[${'0,'.repeat(99_998)}0]`); // root + 99,999 scalars = 100,000 nodes
  assert.equal(doc.stats.nodes, 100_000);
  const tree = new VisibleTreeIndex(doc);
  const expanded = tree.setExpanded(0,true,0);
  assert.equal(expanded.totalVisible,100_000);
  const final = tree.getWindow(1,99_990,120);
  assert.equal(final.ids.length,10);
  assert.equal(final.ids.at(-1),99_999);
  assert.equal(tree.setExpanded(0,false,1).totalVisible,1);
  assert.equal(tree.reveal(99_999,2).rowIndex,99_999);
});

test('Worker M04 protocol supports indexed windows without exposing AST or pointers', () => {
  const worker = createWorkerRuntime();
  requireOk(request(worker,'PARSE',{source:'{"a":[0,1.00],"b":9007199254740993}'}));
  assert.equal(request(worker,'GET_TREE_WINDOW',{epoch:0,offset:0,limit:1}).error.code,'TREE_NOT_INITIALIZED');
  const init = requireOk(request(worker,'TREE_INIT',{expandRoot:true}));
  assert.deepEqual([init.epoch,init.totalVisible],[0,3]);
  const win = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:0,offset:0,limit:40}));
  assert.deepEqual(win.items.map(x => x.label),[null,'a','b']);
  assert.equal(win.items[1].posInSet,1);
  assert.equal(win.items[2].posInSet,2);
  assert.equal(win.items[2].preview,'9007199254740993');
  assert.equal(Object.hasOwn(win.items[2],'pointer'),false);
  assert.equal(Object.hasOwn(win.items[2],'rawNumber'),false);
  assert.equal(Object.hasOwn(win,'ids'),false); // raw index stays Worker-owned
  const expanded = requireOk(request(worker,'TREE_SET_EXPANDED',{nodeId:1,expanded:true,expectedEpoch:0}));
  assert.deepEqual([expanded.epoch,expanded.totalVisible],[1,5]);
  const newWindow = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:1,offset:0,limit:40}));
  assert.deepEqual(newWindow.items.map(x=>x.preview),['Object (2)','Array (2)','0','1.00','9007199254740993']);
  assert.equal(request(worker,'GET_TREE_WINDOW',{epoch:0}).error.code,'TREE_EPOCH_CONFLICT');
  assert.equal(request(worker,'TREE_SET_EXPANDED',{nodeId:1,expanded:false,expectedEpoch:0}).error.code,'TREE_EPOCH_CONFLICT');
  assert.equal(request(worker,'GET_TREE_WINDOW',{epoch:1,offset:0,limit:121}).error.code,'INVALID_WINDOW');
  assert.equal(requireOk(request(worker,'GET_TREE_WINDOW',{epoch:1,offset:4,limit:100})).items.length,1);
});

test('Worker M04 reveal pointer expands ancestors once and rejects duplicate keys', () => {
  const worker = createWorkerRuntime();
  requireOk(request(worker,'PARSE',{source:'{"x/y":[{"n~m":1e+9999}]}'}));
  requireOk(request(worker,'TREE_INIT',{expandRoot:false}));
  const reply = requireOk(request(worker,'TREE_REVEAL',{pointer:'/x~1y/0/n~0m',expectedEpoch:0}));
  assert.equal(reply.epoch,1);
  assert.equal(reply.rowIndex,3);
  assert.equal(reply.totalVisible,4);
  const leaf = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:1,offset:3,limit:1})).items[0];
  assert.equal(leaf.preview,'1e+9999');
  assert.equal(reply.span.start,leaf.span.start);
  assert.equal(requireOk(request(worker,'TREE_REVEAL',{nodeId:leaf.nodeId,expectedEpoch:1})).epoch,1);
  assert.equal(request(worker,'TREE_REVEAL',{pointer:'/missing',expectedEpoch:1}).error.code,'NOT_FOUND');
  requireOk(request(worker,'PARSE',{source:'{"a":1,"a":2}'},{revision:2}));
  requireOk(request(worker,'TREE_INIT',{}, {revision:2}));
  assert.equal(request(worker,'TREE_REVEAL',{pointer:'/a',expectedEpoch:0},{revision:2}).error.code,'AMBIGUOUS_MEMBER');
  const list = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:0,offset:0,limit:10},{revision:2})).items;
  assert.deepEqual(list.slice(1).map(x=>x.occurrence),[0,1]);
  assert.equal(list[1].posInSet,1);
  assert.equal(list[2].posInSet,2);
});

test('M04 Worker resets tree on reparse; legacy API remains compatible', () => {
  const worker = createWorkerRuntime();
  requireOk(request(worker,'PARSE',{source:'{"a":1}'}));
  requireOk(request(worker,'TREE_INIT',{}));
  requireOk(request(worker,'PARSE',{source:'[3]'},{revision:2}));
  assert.equal(request(worker,'GET_TREE_WINDOW',{epoch:0},{revision:2}).error.code,'TREE_NOT_INITIALIZED');
  assert.equal(request(worker,'GET_TREE_WINDOW',{epoch:0}).error.code,'STALE_DOCUMENT');
  const old = requireOk(request(worker,'GET_CHILDREN',{id:0},{revision:2}));
  assert.equal(old.items[0].preview,'3');
});

test('Worker window projection never includes unbounded scalar content', () => {
  const worker = createWorkerRuntime();
  requireOk(request(worker,'PARSE',{source:JSON.stringify({blob:'z'.repeat(100_000)})}));
  requireOk(request(worker,'TREE_INIT',{}));
  const win = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:0,offset:0,limit:10}));
  assert.ok(win.items[1].preview.length <= 141);
  assert.ok(JSON.stringify(win).length < 1000);
  assert.equal(win.items[0].preview,'Object (1)');
});

test('real Node worker_threads supports M04 commands and backpressure',async () => {
  const client=new WorkerClient({workerFactory:()=>new Worker(new URL('./worker-thread-entry.mjs',import.meta.url),{type:'module'})});
  try {
    await client.parse('doc',1,'{"nested":[1,2,3]}');
    const init=await client.query('TREE_INIT',{expandRoot:true});
    assert.equal(init.totalVisible,2);
    const expanded=await client.query('TREE_SET_EXPANDED',{nodeId:1,expanded:true,expectedEpoch:init.epoch});
    assert.equal(expanded.totalVisible,5);
    const win=await client.query('GET_TREE_WINDOW',{epoch:expanded.epoch,offset:3,limit:2});
    assert.deepEqual(win.items.map(x=>x.preview),['2','3']);
    const reveal=await client.query('TREE_REVEAL',{nodeId:4,expectedEpoch:expanded.epoch});
    assert.equal(reveal.rowIndex,4);
    await assert.rejects(client.query('GET_TREE_WINDOW',{epoch:99,offset:0,limit:2}),e=>e.code==='TREE_EPOCH_CONFLICT');
    await client.parse('doc',2,'null');
    await assert.rejects(client.query('GET_TREE_WINDOW',{epoch:0,offset:0,limit:1}),e=>e.code==='TREE_NOT_INITIALIZED');
  } finally { client.close(); }
});


test('wide 50k-member objects return correct original sibling positions near the end', () => {
  const obj = `{${Array.from({length:50_000},(_,i)=>`"k${i}":0`).join(',')}}`;
  const worker = createWorkerRuntime();
  const parsed = requireOk(request(worker,'PARSE',{source:obj}));
  assert.equal(parsed.stats.total_keys,50_000);
  const initialized = requireOk(request(worker,'TREE_INIT',{expandRoot:true}));
  assert.equal(initialized.totalVisible,50_001);
  const end = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:0,offset:49_998,limit:120}));
  assert.equal(end.items.length,3);
  assert.deepEqual(end.items.map(x=>x.posInSet),[49_998,49_999,50_000]);
  assert.deepEqual(end.items.map(x=>x.label),['k49997','k49998','k49999']);
  assert.ok(JSON.stringify(end).length<2000);
});

test('real Worker handles repeated window queries and a later epoch change', async () => {
  const client=new WorkerClient({workerFactory:()=>new Worker(new URL('./worker-thread-entry.mjs',import.meta.url),{type:'module'})});
  try {
    await client.parse('doc',1,'['+Array(300).fill(1).join(',')+']');
    const initialized=await client.query('TREE_INIT',{expandRoot:true});
    assert.equal(initialized.totalVisible,301);
    const responses=await Promise.all(Array.from({length:30},(_,i)=>client.query('GET_TREE_WINDOW',{
      epoch:0,offset:i*10,limit:10,
    })));
    assert.equal(responses.length,30);
    for(let i=0;i<30;i++){
      assert.equal(responses[i].offset,i*10);
      assert.equal(responses[i].items[0].nodeId,i*10 || 0);
      assert.equal(responses[i].items.length,10);
    }
    const collapse=await client.query('TREE_SET_EXPANDED',{nodeId:0,expanded:false,expectedEpoch:0});
    assert.equal(collapse.epoch,1);
    await assert.rejects(client.query('GET_TREE_WINDOW',{epoch:0,offset:0,limit:10}),e=>e.code==='TREE_EPOCH_CONFLICT');
    const current=await client.query('GET_TREE_WINDOW',{epoch:1,offset:0,limit:10});
    assert.equal(current.totalVisible,1);
  } finally {client.close();}
});


test('TREE_INIT is idempotent and does not silently reset epochs or expansions', () => {
  const worker = createWorkerRuntime();
  requireOk(request(worker,'PARSE',{source:'[[1,2]]'}));
  const first = requireOk(request(worker,'TREE_INIT',{expandRoot:true}));
  assert.equal(first.totalVisible,2);
  const expanded = requireOk(request(worker,'TREE_SET_EXPANDED',{nodeId:1,expanded:true,expectedEpoch:0}));
  assert.equal(expanded.epoch,1);
  assert.equal(expanded.totalVisible,4);
  const again = requireOk(request(worker,'TREE_INIT',{expandRoot:false}));
  assert.equal(again.epoch,1);
  assert.equal(again.totalVisible,4);
});

test('window projection caps long decoded labels and preserves supplementary characters', () => {
  const worker = createWorkerRuntime();
  const key = '🔐'.repeat(110) + '<img src=x onerror=alert(1)>';
  requireOk(request(worker,'PARSE',{source:JSON.stringify({[key]:0})}));
  requireOk(request(worker,'TREE_INIT',{}));
  const r = requireOk(request(worker,'GET_TREE_WINDOW',{epoch:0,offset:1,limit:1}));
  assert.equal(r.items.length,1);
  assert.equal(r.items[0].labelTruncated,true);
  assert.ok(r.items[0].label.length<=161);
  assert.ok(JSON.stringify(r).length < 1000);
  assert.equal(r.items[0].preview,'0');
});
