import {parseDocument, prettyPrint, LIMITS} from './core/json.mjs';
import {sample} from './core/sample.mjs';
import {renderRaw, renderTree, renderTable} from './ui/render.mjs';

const $ = id => document.getElementById(id);
const input = $('jsonInput'), result = $('jsonDisplay'), status = $('status');
let parsed = null, revision = 0, parsedRevision = -1, view = 'tree';
const announce = (message, error = false) => {
  status.textContent = message;
  status.className = error ? 'status error' : 'status';
};
const stale = () => { revision++; parsed = null; parsedRevision = -1; $('stats').hidden = true; $('warnings').replaceChildren(); announce('内容已修改，请重新解析。'); };

function draw() {
  if (!parsed?.ok || parsedRevision !== revision) return;
  if (view === 'tree') renderTree(result, parsed.data);
  else if (view === 'table') renderTable(result, parsed.data);
  else renderRaw(result, parsed.source); // preserves original tokens, including long integers
}
function analyze() {
  const output = parseDocument(input.value);
  parsed = output; parsedRevision = revision;
  if (!output.ok) {
    result.replaceChildren();
    $('stats').hidden = true;
    $('warnings').replaceChildren();
    announce(`解析失败：${output.error}`, true);
    return;
  }
  const {stats, warnings} = output;
  $('stats').hidden = false;
  for (const [id, value] of Object.entries({keys: stats.total_keys, depth: stats.max_depth, arrays: stats.array_count, objects: stats.object_count, nodes: stats.nodes})) $(id).textContent = String(value);
  $('warnings').replaceChildren();
  for (const warning of warnings.slice(0, 10)) {
    const p = document.createElement('p'); p.textContent = warning.message; $('warnings').append(p);
  }
  draw();
  announce(`解析成功 · ${stats.size_bytes} 字节 · ${stats.nodes} 节点${warnings.length ? ` · ${warnings.length} 条精度警告` : ''}`);
}
function setView(next) {
  view = next;
  for (const btn of document.querySelectorAll('[data-view]')) {
    const selected = btn.dataset.view === next;
    btn.setAttribute('aria-pressed', String(selected));
    btn.classList.toggle('selected', selected);
  }
  if (parsedRevision !== revision && input.value.trim()) analyze();
  else draw();
}
async function importFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.json')) { announce('请选择 .json 文件。', true); return; }
  if (file.size > LIMITS.bytes) { announce(`文件超过 ${LIMITS.bytes} 字节限制。`, true); return; }
  try { input.value = await file.text(); stale(); analyze(); }
  catch (err) { announce(`读取文件失败：${err.message}`, true); }
}
$('parseBtn').addEventListener('click', analyze);
$('jsonInput').addEventListener('input', stale);
$('clearBtn').addEventListener('click', () => { input.value = ''; stale(); result.replaceChildren(); announce('已清空。'); });
$('loadSampleBtn').addEventListener('click', () => { input.value = JSON.stringify(sample, null, 2); stale(); analyze(); });
$('formatBtn').addEventListener('click', () => {
  if (parsedRevision !== revision || !parsed?.ok) analyze();
  if (!parsed?.ok) return;
  try { input.value = prettyPrint(parsed); stale(); analyze(); }
  catch (error) { announce(error.message, true); }
});
$('downloadBtn').addEventListener('click', () => {
  if (parsedRevision !== revision || !parsed?.ok) analyze();
  if (!parsed?.ok) return;
  const blob = new Blob([parsed.source], {type: 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'document.json'; a.click();
  URL.revokeObjectURL(url);
});
for (const btn of document.querySelectorAll('[data-view]')) btn.addEventListener('click', () => setView(btn.dataset.view));
$('fileInput').addEventListener('change', async e => { await importFile(e.target.files[0]); e.target.value = ''; });
const zone = $('dropZone');
zone.addEventListener('dragover', e => {e.preventDefault(); zone.classList.add('drag');});
zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
zone.addEventListener('drop', async e => {e.preventDefault(); zone.classList.remove('drag'); await importFile(e.dataTransfer.files[0]);});
input.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {e.preventDefault(); analyze();} });
announce('浏览器本地解析模式：输入内容不会自动发送至服务器。');
