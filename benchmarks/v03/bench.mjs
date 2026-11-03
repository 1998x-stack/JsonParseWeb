/** Deterministic benchmark, non-timing-gating. Never contains user data. */
import {performance} from 'node:perf_hooks';
import {parseLossless, formatLossless} from '../../packages/json-core/index.mjs';
const sizes = [1_000, 10_000, 40_000];
const reports = [];
for(const size of sizes) {
  const source = '[' + Array.from({length:size},(_,i)=>String(i % 100)).join(',') + ']';
  const measurements = [];
  let result;
  for(let run=0;run<6;run++) {
    const start = performance.now();
    result=parseLossless(source);
    const duration=performance.now()-start;
    if(!result.ok || result.stats.nodes !== size+1) throw new Error('Benchmark fixture failed correctness gate');
    if(run>0) measurements.push(duration);
  }
  const fmt=formatLossless(result);
  if(!fmt.includes('[') || !fmt.includes(']')) throw new Error('Formatting failed');
  measurements.sort((a,b)=>a-b);
  reports.push({fixture:`array-${size}`,bytes:result.stats.size_bytes,nodes:result.stats.nodes,
    parseMsP50:+measurements[2].toFixed(2),parseMsP95:+measurements[4].toFixed(2)});
}
console.log(JSON.stringify({version:'0.3.0-alpha.2',node:process.version,measurements:reports},null,2));
