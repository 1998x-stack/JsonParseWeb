/** Independent black-box M04 evaluator: fixed expected outputs, never imports table core. */
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {platform,arch,cpus,totalmem} from 'node:os';
const runtime=createWorkerRuntime(),cases=[],failures=[];
let revision=0,requestId=0;
const call=(type,payload={})=>runtime.dispatch({requestId:++requestId,docId:'golden',revision,type,payload});
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const good=(type,payload)=>{const r=call(type,payload);check(r.ok,type+': '+JSON.stringify(r.error));return r.payload;};
const open=(source)=>{revision++;const p=good('PARSE',{source});check(p.validSyntax,'JSON unexpectedly invalid');return p;};
const run=(name,fn)=>{
  const t=performance.now();
  try{fn();cases.push({name,ok:true,ms:+(performance.now()-t).toFixed(3)});}
  catch(e){cases.push({name,ok:false,ms:+(performance.now()-t).toFixed(3)});failures.push({name,error:String(e.message)});}
};
run('duplicate-key-and-missing-vs-null',()=>{
  open('[{"id":9007199254740993,"id":1.00,"v":null},{"id":-0},{}]');
  const s=good('GET_TABLE_SCHEMA',{});
  check(s.mode==='records'&&s.rowCount===3&&s.columnCount===3,'invalid schema');
  check(JSON.stringify(s.columns.map(c=>c.display))===JSON.stringify(['id','id (#2)','v']),'wrong columns');
  const w=good('GET_TABLE_WINDOW',{epoch:0,rowLimit:3,colLimit:3});
  const matrix=w.rows.map(r=>r.cells.map(c=>[c.state,c.preview]));
  const expected=[
    [['present','9007199254740993'],['present','1.00'],['present','null']],
    [['present','-0'],['missing','—'],['missing','—']],
    [['missing','—'],['missing','—'],['missing','—']]
  ];
  check(JSON.stringify(matrix)===JSON.stringify(expected),'golden matrix mismatch');
  check(w.rows[0].cells[2].kind==='null','lost null kind');
});
run('50k-column-boundary',()=>{
  const json='[{' + Array.from({length:50000},(_,i)=>'"k'+i+'":0').join(',') + '}]';
  check(open(json).stats.total_keys===50000,'key count');
  const s=good('GET_TABLE_SCHEMA',{offset:49984,limit:24});
  check(s.columnCount===50000&&s.columns.length===16&&s.columns.at(-1).display==='k49999','wide columns');
  const w=good('GET_TABLE_WINDOW',{epoch:0,rowOffset:0,rowLimit:1,colOffset:49990,colLimit:10});
  check(w.rows[0].cells.length===10&&w.rows[0].cells.every(c=>c.preview==='0'),'wide values');
  check(JSON.stringify(w).length<15000,'unbounded response');
});
run('100k-ast-nodes-last-row',()=>{
  check(open('['+Array(99999).fill('0').join(',')+']').stats.nodes===100000,'node cap');
  const s=good('GET_TABLE_SCHEMA',{});
  check(s.rowCount===99999,'row count');
  const w=good('GET_TABLE_WINDOW',{epoch:0,rowOffset:99920,rowLimit:80,colLimit:2});
  check(w.rows.length===79&&w.rows.at(-1).rowIndex===99998,'last row missing');
  check(JSON.stringify(w).length<40000,'window response oversized');
});
run('literal-text-not-html',()=>{
  open('["<img src=x onerror=alert(1)>","'+('x'.repeat(200000))+'"]');
  good('GET_TABLE_SCHEMA',{});
  const w=good('GET_TABLE_WINDOW',{epoch:0,rowLimit:2,colLimit:2});
  check(w.rows[0].cells[1].preview.includes('<img'),'literal text lost');
  check(w.rows[1].cells[1].preview.length<=121,'uncapped preview');
});
run('invalid-roots-and-stale-revisions',()=>{
  open('[]');
  check(good('GET_TABLE_SCHEMA',{}).rowCount===0,'empty array');
  check(good('GET_TABLE_WINDOW',{epoch:0,rowLimit:1,colLimit:2}).rows.length===0,'empty rows');
  open('{"x":1}');
  const bad=call('GET_TABLE_SCHEMA');check(!bad.ok&&bad.error.code==='NOT_ARRAY','non-array accepted');
  const stale=runtime.dispatch({requestId:++requestId,docId:'golden',revision:revision-1,type:'GET_TABLE_WINDOW',payload:{epoch:0}});
  check(!stale.ok&&stale.error.code==='STALE_DOCUMENT','stale request accepted');
});
run('invalid-window-bounds',()=>{
  open('[{"a":1}]');
  check(call('GET_TABLE_WINDOW',{epoch:0}).error.code==='TABLE_NOT_INITIALIZED','init not checked');
  good('GET_TABLE_SCHEMA',{});
  for(const params of [{epoch:0,rowLimit:81},{epoch:0,colLimit:25},{epoch:1},{epoch:0,rowOffset:-1}]){
    check(!call('GET_TABLE_WINDOW',params).ok,'invalid window accepted');
  }
});
const measurements=[];
for(let i=0;i<7;i++){
  const t=performance.now();
  open('['+Array(9999).fill('{"a":1,"b":null}').join(',')+']');
  const s=good('GET_TABLE_SCHEMA',{});
  const midway=performance.now();
  check(good('GET_TABLE_WINDOW',{epoch:s.epoch,rowOffset:9900,rowLimit:48,colLimit:2}).rows.length===48,'benchmark invalid');
  measurements.push({buildMs:midway-t,windowMs:performance.now()-midway});
}
const percentile=(key,p)=>{
  const ordered=measurements.map(x=>x[key]).sort((a,b)=>a-b);
  return +ordered[Math.ceil(ordered.length*p)-1].toFixed(3);
};
const report={version:'1',suite:'M04-F independent black-box evaluator',timestamp:new Date().toISOString(),
  environment:{node:process.version,platform:platform(),arch:arch(),cpus:cpus().length,memoryGiB:Math.round(totalmem()/1073741824)},
  gates:{golden:failures.length===0,resourceBounds:failures.length===0,testCases:cases.length},
  cases,failures,benchmark:{runs:measurements.length,tableBuildMsP50:percentile('buildMs',0.5),
    tableBuildMsP95:percentile('buildMs',0.95),windowMsP50:percentile('windowMs',0.5),
    windowMsP95:percentile('windowMs',0.95),note:'Synthetic Node timings, not browser performance guarantees.'}};
if(process.env.M04_REPORT_FILE)writeFileSync(process.env.M04_REPORT_FILE,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
