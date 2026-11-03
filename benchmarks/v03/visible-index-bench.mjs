/** Measurement-only M04-A/B benchmark. No unstable timing assertions in CI. */
import {performance} from 'node:perf_hooks';
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {VisibleTreeIndex} from '../../packages/json-core/visible-index.mjs';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';

const source = `[${'0,'.repeat(99_998)}0]`;
const measurements = [];
const bench = (label, fn) => {
  const start = performance.now();
  const result = fn();
  measurements.push({name: label, durationMs: +(performance.now()-start).toFixed(2)});
  return result;
};
const doc = bench('parse-lossless-100k', () => parseLossless(source));
if (!doc.ok || doc.stats.nodes !== 100_000) throw new Error('100k fixture failed');
const index = bench('create-collapsed-index', () => new VisibleTreeIndex(doc));
const expanded = bench('expand-99,999-children', () => index.setExpanded(doc.rootId, true, 0));
if (expanded.totalVisible !== 100_000) throw new Error('index count mismatch');
const tail = bench('get-last-120-rows', () => index.getWindow(1, 99_880, 120));
if (tail.ids.length !== 120 || tail.ids.at(-1) !== 99_999) throw new Error('tail mismatch');
bench('collapse-wide-root', () => index.setExpanded(0,false,1));
bench('reveal-last-leaf', () => index.reveal(99_999,2));
const worker=createWorkerRuntime();
const request=(requestId,type,payload={})=>worker.dispatch({requestId,type,payload,docId:'bench',revision:1});
bench('worker-parse-100k',()=>{
  const r=request(1,'PARSE',{source});
  if(!r.ok) throw new Error(r.error.message);
});
bench('worker-tree-init',()=>{
  const r=request(2,'TREE_INIT',{expandRoot:true});
  if(!r.ok||r.payload.totalVisible!==100_000) throw new Error('worker init failed');
});
bench('worker-tail-projection-120',()=>{
  const r=request(3,'GET_TREE_WINDOW',{epoch:0,offset:99_880,limit:120});
  if(!r.ok||r.payload.items.length!==120) throw new Error('worker window failed');
});
console.log(JSON.stringify({
  kind: 'M04-A/B indicative benchmark',
  node: process.version,
  inputBytes: new TextEncoder().encode(source).length,
  nodes: doc.stats.nodes,
  maxVisible: 100_000,
  measurements,
  note: 'Single-run timings are not release performance claims; compare on pinned runner with repeated trials.'
},null,2));
