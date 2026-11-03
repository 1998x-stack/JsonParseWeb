import {parseDocument,prettyPrint,LIMITS} from './core/json.mjs';
import {sample} from './core/sample.mjs';
import {renderRaw,renderTree,renderTable} from './ui/render.mjs';
import {createLosslessView} from './ui/lossless-render.mjs';
import {createVirtualTreeView} from './ui/virtual-tree.mjs';
import {createVirtualTableView} from './ui/virtual-table.mjs';
import {createNodeDetailsView} from './ui/node-details.mjs';
import {WorkerClient} from './worker/client.mjs';
import {DocumentController} from './document/controller.mjs';
import {createFindingsPanel} from './ui/findings-panel.mjs';
import {PRODUCT_SAMPLES,applyStaticLocale,translate} from './product/i18n.mjs';

const $=id=>document.getElementById(id);
const input=$('jsonInput'),display=$('jsonDisplay'),status=$('status');
const toggle=$('losslessMode'),virtualToggle=$('virtualTreeMode'),cancelBtn=$('cancelBtn');
const supportsWorker=typeof Worker!=='undefined';
const params=new URLSearchParams(location.search);
// Explicit engine queries preserve the M03/M04 regression harness and opt-out.
const legacyQuery=params.has('engine');
document.body.classList.toggle('legacy-query',legacyQuery);
$('advancedEngines').open=legacyQuery;
let locale=params.get('lang')==='zh'||(!params.has('lang')&&legacyQuery)?'zh':'en';
$('languageSelect').value=locale;
applyStaticLocale(locale);
const t=key=>translate(locale,key);
toggle.disabled=!supportsWorker;
toggle.checked=supportsWorker && params.get('engine')!=='legacy';
virtualToggle.checked=params.has('virtual') ? params.get('virtual')==='1' : !legacyQuery;
virtualToggle.disabled=!toggle.checked;
let parsed=null,revision=0,parsedRevision=-1,view='tree',activeVirtualTree=null,activeVirtualTable=null,activeNodeDetails=null,activeFindings=null;
const client=supportsWorker?new WorkerClient({workerFactory:()=>new Worker(new URL('./worker/worker-entry.mjs',import.meta.url),{type:'module'})}):null;
const controller=client?new DocumentController(client,{docId:'local',onChange:s=>{
  cancelBtn.hidden=!(toggle.checked&&s.phase==='parsing');
}}):null;
const experimental=()=>Boolean(controller && toggle.checked);
const announce=(message,error=false)=>{status.textContent=message;status.className=error?'status error':'status';};
const clearNavigation=()=>{activeNodeDetails?.destroy();activeNodeDetails=null;$('pointerNav').hidden=true;$('nodeDetails').hidden=true;$('pointerFeedback').textContent='';};
const clearResult=()=>{activeFindings?.destroy();activeFindings=null;activeVirtualTree?.destroy();activeVirtualTree=null;activeVirtualTable?.destroy();activeVirtualTable=null;clearNavigation();display.replaceChildren();$('stats').hidden=true;$('warnings').replaceChildren();};
function stale() {
  revision++;parsed=null;parsedRevision=-1;
  controller?.setSource(input.value);
  clearResult();announce(t('modified'));
}
function showStatistics(stats) {
  $('stats').hidden=false;
  for(const [id,value] of Object.entries({keys:stats.total_keys,depth:stats.max_depth,
    arrays:stats.array_count,objects:stats.object_count,nodes:stats.nodes})) $(id).textContent=String(value);
}
function showDiagnostics(diags=[]) {
  $('warnings').replaceChildren();
  for(const issue of diags.slice(0,10)) {
    const p=document.createElement('p');
    p.textContent=`${issue.severity==='error'?'错误':'提示'} ${issue.code}${issue.line?` (${issue.line}:${issue.column})`:''}：${issue.message}`;
    $('warnings').append(p);
  }
}
const currentV03=(r)=>experimental()&&controller.revision===r&&controller.snapshot.phase==='ready';
async function drawLossless() {
  const snap=controller.snapshot,stamp=snap.revision;
  if(!currentV03(stamp)||!snap.summary?.root)return;
  activeVirtualTree?.destroy();activeVirtualTree=null;activeVirtualTable?.destroy();activeVirtualTable=null;clearNavigation();
  if(view==='raw'){renderRaw(display,input.value);return;}
  if(view==='tree'&&virtualToggle.checked){
    const isCurrent=()=>currentV03(stamp)&&view==='tree'&&virtualToggle.checked;
    $('pointerNav').hidden=false;$('nodeDetails').hidden=false;
    activeNodeDetails=createNodeDetailsView({target:$('nodeDetails'),controller,sourceInput:input,isCurrent,locale,
      onMessage:(message,error=false)=>{if(isCurrent()){$('pointerFeedback').textContent=message;if(error)announce(message,true);}}});
    activeVirtualTree=createVirtualTreeView({target:display,controller,isCurrent,locale,
      onSelect:id=>activeNodeDetails?.select(id),
      onError:error=>announce(`虚拟树查询失败：${error.message}`,true)});
    await activeVirtualTree.mount();return;
  }
  if(view==='table'&&virtualToggle.checked){
    const isCurrent=()=>currentV03(stamp)&&view==='table'&&virtualToggle.checked;
    $('nodeDetails').hidden=false;
    activeNodeDetails=createNodeDetailsView({target:$('nodeDetails'),controller,sourceInput:input,isCurrent,locale,
      onMessage:(message,error=false)=>{if(isCurrent()){announce(message,error);}}});
    activeVirtualTable=createVirtualTableView({target:display,controller,isCurrent,
      onSelectNode:id=>activeNodeDetails?.select(id),
      onError:error=>announce(`虚拟表格查询失败：${error.message}`,true)});
    await activeVirtualTable.mount();return;
  }
  const viewAtStart=view,virtualAtStart=virtualToggle.checked;
  const pane=createLosslessView({target:display,controller,isCurrent:()=>currentV03(stamp)&&view===viewAtStart&&virtualToggle.checked===virtualAtStart});
  if(view==='tree')pane.tree(snap.summary.root);
  else await pane.table(snap.summary.root);
}
function draw() {
  if(experimental()){void drawLossless();return;}
  if(!parsed?.ok||parsedRevision!==revision)return;
  if(view==='tree')renderTree(display,parsed.data);
  else if(view==='table')renderTable(display,parsed.data);
  else renderRaw(display,parsed.source);
}
function analyzeLegacy() {
  if(!supportsWorker&&!legacyQuery){clearResult();announce('This browser does not support Web Workers. Lossless inspection is unavailable; source was not parsed.',true);return;}
  const output=parseDocument(input.value);
  parsed=output;parsedRevision=revision;
  if(!output.ok){clearResult();announce(`解析失败：${output.error}`,true);return;}
  showStatistics(output.stats);$('warnings').replaceChildren();
  for(const warning of output.warnings.slice(0,10)) {
    const p=document.createElement('p');p.textContent=warning.message;$('warnings').append(p);
  }
  draw();announce(`解析成功 · ${output.stats.size_bytes} 字节 · ${output.stats.nodes} 节点${output.warnings.length?' · 包含精度风险':''}`);
}
async function renderSummary(summary) {
  if(!experimental()||!summary)return;
  if(!summary.validSyntax){clearResult();showDiagnostics(summary.diagnostics);announce(t('invalid'),true);return;}
  showStatistics(summary.stats);showDiagnostics(summary.diagnostics);
  const stamp=controller.revision;
  await drawLossless();
  if(!currentV03(stamp))return;
  const isCurrent=()=>currentV03(stamp);
  activeFindings?.destroy();
  activeFindings=createFindingsPanel({target:$('issuesPanel'),controller,isCurrent,getLocale:()=>locale,
    onMessage:(message,error=false)=>{if(isCurrent())announce(message,error);},
    onLocate:async issue=>{
      if(!isCurrent())return;
      const span=issue.primary.span;
      if(span.start<0 || span.end>input.value.length || span.end<span.start)return;
      // Show exact evidence immediately; do not delay source focus on Worker scrolling.
      input.focus();input.setSelectionRange(span.start,span.end);
      announce(t('sourceHighlighted'));
      if(activeVirtualTree&&view==='tree') {
        try{await activeVirtualTree.revealNode(issue.primary.nodeId);}catch(error){if(isCurrent())announce(error.message,true);}
      }
    }});
  await activeFindings.mount();
  if(!currentV03(stamp))return;
  announce(`${t('inspectSuccess')} · ${summary.stats.size_bytes} ${locale==='zh'?'字节':'bytes'} · ${summary.stats.nodes} ${locale==='zh'?'节点':'nodes'} · ${summary.inspection?.total??0} ${locale==='zh'?'条发现':'findings'}`);
}
async function analyze() {
  if(!experimental())return analyzeLegacy();
  const stamp=controller.revision;
  clearResult();announce(t('inspectProgress'));
  try{
    const summary=await controller.parse();
    if(stamp!==controller.revision||!experimental())return;
    await renderSummary(summary);
  }catch(e){if(stamp===controller.revision&&experimental()){clearResult();announce(`解析失败：${e.message}`,true);}}
}
function setView(next) {
  view=next;
  for(const btn of document.querySelectorAll('[data-view]')) {
    const selected=btn.dataset.view===next;
    btn.setAttribute('aria-pressed',String(selected));btn.classList.toggle('selected',selected);
  }
  if(experimental()) {
    if(controller.snapshot.phase==='ready')void drawLossless();
    else if(input.value.trim())void analyze();
  } else if(parsedRevision!==revision&&input.value.trim())analyzeLegacy();
  else draw();
}
async function importFile(file) {
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.json')){announce('请选择 .json 文件。',true);return;}
  if(file.size>LIMITS.bytes){announce(`文件超过 ${LIMITS.bytes} 字节限制。`,true);return;}
  if(!experimental()){
    try{input.value=await file.text();stale();analyzeLegacy();}
    catch(e){announce(`读取文件失败：${e.message}`,true);}
    return;
  }
  input.value='';stale();const stamp=controller.revision;
  try{
    const buffer=await file.arrayBuffer();
    if(stamp!==controller.revision||!experimental())return;
    announce('Worker 正在校验 UTF-8 文件…');
    const summary=await controller.parseFile(buffer);
    if(stamp!==controller.revision||!experimental())return;
    if(typeof summary?.importedSource==='string')input.value=summary.importedSource;
    await renderSummary(summary);
  }catch(e){if(stamp===controller.revision)announce(`导入失败：${e.message}`,true);}
}
async function format() {
  if(!experimental()){
    if(parsedRevision!==revision||!parsed?.ok)analyzeLegacy();
    if(!parsed?.ok)return;
    try{input.value=prettyPrint(parsed);stale();analyzeLegacy();}
    catch(e){announce(e.message,true);}
    return;
  }
  if(controller.snapshot.phase!=='ready')await analyze();
  if(controller.snapshot.phase!=='ready')return;
  const stamp=controller.revision;
  try{
    const formatted=await controller.query('FORMAT',{indent:2});
    if(stamp!==controller.revision)return;
    if(new TextEncoder().encode(formatted.source).length>LIMITS.bytes) {
      announce('格式化后超出当前 2 MiB 输入限制；原文未修改。',true);return;
    }
    input.value=formatted.source;stale();await analyze();
  }catch(e){if(stamp===controller.revision)announce(`格式化失败：${e.message}`,true);}
}
function download() {
  if(experimental() ? controller.snapshot.phase!=='ready' : parsedRevision!==revision||!parsed?.ok) {
    announce('请先成功解析当前文档，再导出原文。',true);return;
  }
  const blob=new Blob([input.value],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download='document.json';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}
$('pointerNav').addEventListener('submit',async event=>{
  event.preventDefault();
  const tree=activeVirtualTree;
  if(!experimental()||!virtualToggle.checked||!tree)return;
  $('pointerFeedback').textContent='正在定位 JSON Pointer…';
  try{
    const result=await tree.revealPointer($('pointerInput').value);
    if(result&&activeVirtualTree===tree){$('pointerFeedback').textContent=`已定位行 ${result.rowIndex+1}，节点 ${result.nodeId}`;tree.viewport.focus({preventScroll:true});}
  }catch(error){if(activeVirtualTree===tree)$('pointerFeedback').textContent=`${error.code||'NAVIGATION_ERROR'}：${error.message}`;}
});
$('parseBtn').addEventListener('click',()=>{void analyze();});
input.addEventListener('input',stale);
$('clearBtn').addEventListener('click',()=>{input.value='';stale();announce('已清空。');});
$('loadSampleBtn').addEventListener('click',()=>{input.value=legacyQuery?JSON.stringify(sample,null,2):PRODUCT_SAMPLES.precision;stale();void analyze();});
$('formatBtn').addEventListener('click',()=>{void format();});
$('downloadBtn').addEventListener('click',download);
for(const btn of document.querySelectorAll('[data-view]'))btn.addEventListener('click',()=>setView(btn.dataset.view));
virtualToggle.addEventListener('change',()=>{activeVirtualTree?.destroy();activeVirtualTree=null;activeVirtualTable?.destroy();activeVirtualTable=null;clearNavigation();
  if(experimental()&&controller.snapshot.phase==='ready'&&(view==='tree'||view==='table'))void drawLossless();});
toggle.addEventListener('change',()=>{virtualToggle.disabled=!toggle.checked;stale();if(input.value.trim())void analyze();else announce(experimental()?'V0.3 Worker 实验模式已启用。':'V0.2 兼容模式已启用。');});
cancelBtn.addEventListener('click',()=>{if(experimental()){controller.cancel();clearResult();announce('已取消当前解析。');}});
$('fileInput').addEventListener('change',async e=>{await importFile(e.target.files[0]);e.target.value='';});
const zone=$('dropZone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');void importFile(e.dataTransfer.files[0]);});
input.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void analyze();}});
for(const button of document.querySelectorAll('[data-demo]'))button.addEventListener('click',()=>{
  input.value=PRODUCT_SAMPLES[button.dataset.demo];stale();
  $('workbench').scrollIntoView({behavior:'smooth',block:'start'});
  if(!experimental()&&supportsWorker){toggle.checked=true;virtualToggle.checked=true;virtualToggle.disabled=false;stale();}
  void analyze();
});
$('trySampleHero').addEventListener('click',()=>document.querySelector('[data-demo="precision"]').click());
$('languageSelect').addEventListener('change',event=>{
  locale=event.target.value;applyStaticLocale(locale);
  activeFindings?.render();
  // Rebuild view chrome while retaining parsed state and all source bytes.
  if(experimental()&&controller.snapshot.phase==='ready')void drawLossless();
  if(!input.value)announce(t('resultEmpty'));
});
window.addEventListener('pagehide',()=>controller?.destroy(),{once:true});
announce(!input.value?t('resultEmpty'):(experimental()?t('inspectProgress'):t('rawNotChanged')));
