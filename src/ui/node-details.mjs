/** M04-D: revision-safe node details; authoritative source is already in the editor. */
export function exactSourceSpan(source, span) {
  if (typeof source !== 'string' || !span || !Number.isSafeInteger(span.start) ||
      !Number.isSafeInteger(span.end) || span.start < 0 || span.end < span.start || span.end > source.length)
    throw new RangeError('节点原文区间无效');
  return source.slice(span.start, span.end);
}

export function boundedSourcePreview(source, span, limit = 1800) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('预览长度无效');
  // Check the full span without allocating a giant intermediate string.
  exactSourceSpan(source, {start:span?.start, end:span?.start});
  if (!Number.isSafeInteger(span.end) || span.end < span.start || span.end > source.length)
    throw new RangeError('节点原文区间无效');
  let end = Math.min(span.end, span.start + limit);
  if (end < span.end) {
    const last = source.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
  }
  return {text:source.slice(span.start, end), truncated:end < span.end, totalLength:span.end-span.start};
}

const make = (tag, cls='', content=undefined) => {
  const node=document.createElement(tag);
  if (cls) node.className=cls;
  if (content!==undefined) node.textContent=String(content);
  return node;
};

export class NodeDetailsView {
  constructor({target,controller,sourceInput,isCurrent,locale='zh',onMessage=()=>{}}) {
    if (!target||!controller||!sourceInput||typeof isCurrent!=='function') throw new TypeError('缺少节点详情依赖');
    Object.assign(this,{target,controller,sourceInput,isCurrent,onMessage,locale});
    this.text=(zh,en)=>this.locale==='en'?en:zh;
    this.seq=0;this.selected=null;this.disposed=false;
    this.target.replaceChildren();
    const heading=make('h3','node-details-title',this.text('节点详情','Node details'));
    this.meta=make('p','node-details-meta',this.text('选择树形节点查看详细信息','Select a node to view exact source evidence'));
    this.path=make('p','node-details-pointer');
    this.preview=make('pre','node-details-preview');
    this.note=make('p','node-details-note');
    const controls=make('div','node-details-actions');
    this.copyPath=make('button','',this.text('复制 JSON Pointer','Copy JSON Pointer'));this.copyPath.type='button';this.copyPath.id='copyPointerBtn';
    this.copyRawButton=make('button','',this.text('复制完整原文','Copy exact source'));this.copyRawButton.type='button';this.copyRawButton.id='copyRawBtn';
    this.locateButton=make('button','',this.text('定位源码','Locate source'));this.locateButton.type='button';this.locateButton.id='locateSourceBtn';
    controls.append(this.copyPath,this.copyRawButton,this.locateButton);
    this.target.append(heading,this.meta,this.path,this.preview,this.note,controls);
    this.copyPath.addEventListener('click',()=>{void this.copyPointer();});
    this.copyRawButton.addEventListener('click',()=>{void this.copyRaw();});
    this.locateButton.addEventListener('click',()=>this.locateSource());
    this.reset();
  }
  get alive(){return !this.disposed&&this.isCurrent();}
  reset(){
    this.seq++;this.selected=null;
    this.meta.textContent=this.text('选择树形节点查看详细信息','Select a node to view exact source evidence');
    this.path.textContent='';this.preview.textContent='';this.note.textContent='';
    this.copyPath.disabled=true;this.copyRawButton.disabled=true;this.locateButton.disabled=true;
  }
  async select(nodeId) {
    if (!this.alive) return;
    const seq=++this.seq,rev=this.controller.revision;
    this.selected=null;
    this.meta.textContent=this.text('正在读取节点详情…','Loading node details…');
    this.copyPath.disabled=true;this.copyRawButton.disabled=true;this.locateButton.disabled=true;
    try {
      const {node}=await this.controller.query('GET_NODE',{id:nodeId});
      if (!this.alive||seq!==this.seq||rev!==this.controller.revision) return;
      const details=boundedSourcePreview(this.sourceInput.value,node.span);
      this.selected={node,revision:rev};
      const name=node.label===null?this.text('根节点','Root'):node.label;
      this.meta.textContent=this.locale==='en'?`${name} · ${node.kind} · depth ${node.depth} · UTF-16 [${node.span.start}, ${node.span.end})`:`${name} · ${node.kind} · 深度 ${node.depth} · UTF-16 [${node.span.start}, ${node.span.end})`;
      const ambiguous=node.pointer===null;
      this.path.textContent=ambiguous?this.text('JSON Pointer：重复键导致路径歧义','JSON Pointer: ambiguous duplicate property'):`JSON Pointer: ${node.pointer===''?this.text('（根节点，空字符串）','(root, empty string)'):node.pointer}`;
      this.preview.textContent=details.text+(details.truncated?this.text('\n…（预览截断，复制仍保留完整原文）','\n… (preview truncated; exact copy stays complete)'):'');
      this.note.textContent=this.locale==='en'?`Source length: ${details.totalLength} UTF-16 units${node.occurrence>0?` · occurrence ${node.occurrence+1}`:''}`:`原文长度：${details.totalLength} UTF-16 代码单元${node.occurrence>0?` · 同名属性第 ${node.occurrence+1} 次出现`:''}`;
      this.copyPath.disabled=ambiguous;this.copyRawButton.disabled=false;this.locateButton.disabled=false;
    }catch(error){
      if(!this.alive||seq!==this.seq)return;
      this.meta.textContent=`读取节点详情失败：${error.message}`;
      this.onMessage(error.message,true);
    }
  }
  currentSelection(){
    if(!this.alive||!this.selected||this.selected.revision!==this.controller.revision) return null;
    return this.selected.node;
  }
  async #copy(text,label) {
    if(!this.currentSelection())return false;
    try {
      if(!navigator.clipboard?.writeText) throw new Error('浏览器未提供剪贴板权限');
      await navigator.clipboard.writeText(text);
      if(!this.currentSelection())return false;
      this.onMessage(`${label}已复制`);return true;
    }catch(error){if(this.alive)this.onMessage(`${label}复制失败：${error.message}`,true);return false;}
  }
  async copyPointer(){
    const node=this.currentSelection();
    if(!node)return false;
    if(node.pointer===null){this.onMessage('重复键路径有歧义，不能复制标准 JSON Pointer',true);return false;}
    return this.#copy(node.pointer,'JSON Pointer');
  }
  async copyRaw(){
    const node=this.currentSelection();if(!node)return false;
    return this.#copy(exactSourceSpan(this.sourceInput.value,node.span),'节点完整原文');
  }
  locateSource(){
    const node=this.currentSelection();if(!node)return false;
    exactSourceSpan(this.sourceInput.value,node.span);
    this.sourceInput.focus();
    this.sourceInput.setSelectionRange(node.span.start,node.span.end);
    this.onMessage(`已定位原文 [${node.span.start}, ${node.span.end})`);
    return true;
  }
  destroy(){this.disposed=true;this.seq++;this.target.replaceChildren();}
}
export function createNodeDetailsView(options){return new NodeDetailsView(options);}
