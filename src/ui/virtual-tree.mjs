/** M04-C: viewport-bounded, ARIA-aware virtual tree. The Worker owns all AST/index state. */
export const TREE_ROW_HEIGHT = 30;
export const TREE_OVERSCAN = 10;
export const TREE_WINDOW_LIMIT = 120;

export function computeTreeWindow(scrollTop, viewportHeight, total, {
  rowHeight = TREE_ROW_HEIGHT, overscan = TREE_OVERSCAN, limit = TREE_WINDOW_LIMIT,
} = {}) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isFinite(scrollTop) ||
      !Number.isFinite(viewportHeight) || rowHeight <= 0 || overscan < 0 || limit < 1)
    throw new RangeError('无效的虚拟滚动窗口参数');
  if (total === 0) return {offset:0, limit:0, end:0, totalHeight:0};
  const first = Math.min(total - 1, Math.floor(Math.max(0, scrollTop) / rowHeight));
  const count = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / rowHeight));
  let offset = Math.max(0, first - overscan);
  const desiredEnd = Math.min(total, first + count + overscan);
  const end = Math.min(total, Math.max(offset + 1, Math.min(desiredEnd, offset + limit)));
  // Always include the visible first row even in very small configured windows.
  if (end <= first) offset = first;
  return {offset, limit:end-offset, end, totalHeight:total*rowHeight};
}

const el = (tag, cls='', text=undefined) => {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (text !== undefined) item.textContent=String(text);
  return item;
};
const errorMessage = e => e?.message || '虚拟树操作失败';

export class VirtualTreeView {
  constructor({target, controller, isCurrent, onError=()=>{}, rowHeight=TREE_ROW_HEIGHT, overscan=TREE_OVERSCAN}={}) {
    if (!target || !controller || typeof isCurrent !== 'function') throw new TypeError('缺少虚拟树渲染依赖');
    this.target=target;this.controller=controller;this.isCurrent=isCurrent;this.onError=onError;
    this.rowHeight=rowHeight;this.overscan=overscan;
    this.disposed=false;this.epoch=null;this.totalVisible=0;this.loaded=null;
    this.requestSeq=0;this.inFlight=false;this.queued=false;this.mutation=false;
    this.frame=null;this.activeId=null;this.activeIndex=0;this.selectedId=null;
    this.idPrefix=`json-tree-r${controller.revision}-`;
  }
  get alive() {return !this.disposed && this.isCurrent();}
  async mount() {
    const viewport=el('div','virtual-tree-viewport');
    viewport.setAttribute('role','tree');
    viewport.setAttribute('aria-label','JSON 节点树');
    viewport.setAttribute('tabindex','0');
    viewport.setAttribute('aria-busy','true');
    const spacer=el('div','virtual-tree-spacer');
    const windowElement=el('div','virtual-tree-window');
    spacer.append(windowElement);viewport.append(spacer);
    const status=el('div','virtual-tree-count','正在初始化虚拟树…');
    status.setAttribute('aria-live','polite');
    this.viewport=viewport;this.spacer=spacer;this.windowElement=windowElement;this.status=status;
    this.target.replaceChildren(viewport,status);
    viewport.addEventListener('scroll',this.onScroll=()=>this.scheduleWindow());
    viewport.addEventListener('click',this.onClick=event=>{void this.handleClick(event);});
    viewport.addEventListener('keydown',this.onKey=event=>{void this.handleKey(event);});
    try {
      const init=await this.controller.query('TREE_INIT',{expandRoot:true});
      if(!this.alive)return;
      this.epoch=init.epoch;this.totalVisible=init.totalVisible;
      this.activeId=init.rootId;this.selectedId=init.rootId;this.activeIndex=0;
      this.spacer.style.height=`${this.totalVisible*this.rowHeight}px`;
      await this.loadWindow();
    } catch(error) {if(this.alive)this.report(error);}
  }
  report(error){this.viewport?.setAttribute('aria-busy','false');this.status.textContent=`虚拟树错误：${errorMessage(error)}`;this.onError(error);}
  destroy(){
    if(this.disposed)return;
    this.disposed=true;this.requestSeq++;
    if(this.frame!==null)cancelAnimationFrame(this.frame);
    if(this.viewport){this.viewport.removeEventListener('scroll',this.onScroll);this.viewport.removeEventListener('click',this.onClick);this.viewport.removeEventListener('keydown',this.onKey);}
  }
  scheduleWindow(){
    if(!this.alive||this.epoch===null)return;
    this.requestSeq++;
    if(this.inFlight){this.queued=true;return;}
    if(this.frame!==null)return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;void this.loadWindow();});
  }
  async loadWindow(){
    if(!this.alive||this.epoch===null||this.mutation)return;
    if(this.inFlight){this.queued=true;return;}
    const range=computeTreeWindow(this.viewport.scrollTop,this.viewport.clientHeight||480,this.totalVisible,{rowHeight:this.rowHeight,overscan:this.overscan});
    if(range.limit===0){this.windowElement.replaceChildren();this.viewport.setAttribute('aria-busy','false');return;}
    if(this.loaded && this.loaded.epoch===this.epoch && this.loaded.offset===range.offset && this.loaded.limit===range.limit) return;
    const seq=this.requestSeq,epoch=this.epoch;
    this.inFlight=true;
    this.viewport.setAttribute('aria-busy','true');
    try {
      const page=await this.controller.query('GET_TREE_WINDOW',{epoch,offset:range.offset,limit:range.limit});
      if(!this.alive||seq!==this.requestSeq||epoch!==this.epoch)return;
      this.totalVisible=page.totalVisible;
      this.spacer.style.height=`${this.totalVisible*this.rowHeight}px`;
      this.renderWindow(page.items,page.offset);
      this.loaded={epoch,offset:range.offset,limit:range.limit};
      this.viewport.setAttribute('aria-busy','false');
      this.status.textContent=`已显示 ${page.items.length} / ${this.totalVisible} 个可见节点`;
    }catch(error){if(this.alive && seq===this.requestSeq && epoch===this.epoch)this.report(error);}
    finally {this.inFlight=false;if(this.queued&&this.alive){this.queued=false;this.scheduleWindow();}}
  }
  renderWindow(items,offset){
    const fragment=document.createDocumentFragment();
    const base=this.idPrefix;
    for(let i=0;i<items.length;i++){
      const row=items[i],index=offset+i;
      const item=el('div','virtual-tree-row');
      item.setAttribute('role','treeitem');item.id=`${base}${row.nodeId}`;
      item.dataset.nodeId=String(row.nodeId);item.dataset.rowIndex=String(index);
      if(row.parentId!==null)item.dataset.parentId=String(row.parentId);
      item.setAttribute('aria-level',String(row.depth));
      item.setAttribute('aria-posinset',String(row.posInSet));
      item.setAttribute('aria-setsize',String(row.setSize));
      item.setAttribute('aria-selected',String(row.nodeId===this.selectedId));
      if(row.hasChildren)item.setAttribute('aria-expanded',String(row.expanded));
      if(row.nodeId===this.activeId)item.classList.add('is-active');
      if(row.nodeId===this.selectedId)item.classList.add('is-selected');
      item.style.paddingLeft=`${Math.min((row.depth-1)*16,180)}px`;
      const disclosure=el('button','virtual-tree-disclosure',row.hasChildren?(row.expanded?'▾':'▸'):'');
      disclosure.type='button'; disclosure.tabIndex=-1;
      disclosure.dataset.action='toggle';disclosure.disabled=!row.hasChildren;
      disclosure.setAttribute('aria-label',row.hasChildren?(row.expanded?'折叠节点':'展开节点'):'叶子节点');
      item.append(disclosure);
      if(row.label!==null)item.append(el('span','tree-key',`${row.label}${row.occurrence>0?` (#${row.occurrence+1})`:''}: `));
      item.append(el('span',`tree-${row.kind} virtual-tree-value`,row.preview));
      fragment.append(item);
    }
    this.windowElement.style.transform=`translateY(${offset*this.rowHeight}px)`;
    this.windowElement.replaceChildren(fragment);
    // A scroll can unmount the formerly active row. Re-anchor keyboard focus
    // to the first mounted row, but preserve the selected data node.
    if(items.length && (this.activeIndex<offset || this.activeIndex>=offset+items.length)){
      this.activeIndex=offset;this.activeId=items[0].nodeId;
    }
    this.refreshSelection();
  }
  syncActive(){
    if(!this.viewport)return;
    const active=this.activeId!==null?document.getElementById(`${this.idPrefix}${this.activeId}`):null;
    // aria-activedescendant MUST refer to a currently mounted node.
    if(active && this.windowElement.contains(active))this.viewport.setAttribute('aria-activedescendant',active.id);
    else this.viewport.removeAttribute('aria-activedescendant');
  }
  async handleClick(event){
    if(!this.alive)return;
    const row=event.target.closest?.('[role="treeitem"]');
    if(!row||!this.windowElement.contains(row))return;
    const id=Number(row.dataset.nodeId),index=Number(row.dataset.rowIndex);
    this.activeId=id;this.activeIndex=index;this.selectedId=id;
    this.refreshSelection();this.viewport.focus({preventScroll:true});
    if(event.target.closest?.('[data-action="toggle"]'))await this.toggleNode(id);
  }
  refreshSelection(){
    for(const row of this.windowElement.querySelectorAll('[role="treeitem"]')) {
      const id=Number(row.dataset.nodeId),selected=id===this.selectedId,active=id===this.activeId;
      row.classList.toggle('is-selected',selected);row.classList.toggle('is-active',active);
      row.setAttribute('aria-selected',String(selected));
    }
    this.syncActive();
  }
  async toggleNode(nodeId,forceExpanded=undefined){
    if(!this.alive||this.mutation)return;
    const row=this.windowElement.querySelector(`[data-node-id="${nodeId}"]`);
    if(!row||!row.hasAttribute('aria-expanded'))return;
    const oldExpanded=row.getAttribute('aria-expanded')==='true';
    const expanded=forceExpanded===undefined?!oldExpanded:forceExpanded;
    if(oldExpanded===expanded)return;
    this.mutation=true;
    // Any outstanding window reply becomes stale as soon as mutation starts.
    this.requestSeq++;this.loaded=null;
    const previousCount=this.totalVisible;
    const pivot=Number(row.dataset.rowIndex);
    const firstVisible=Math.floor(this.viewport.scrollTop/this.rowHeight);
    try {
      const reply=await this.controller.query('TREE_SET_EXPANDED',{nodeId,expanded,expectedEpoch:this.epoch});
      if(!this.alive)return;
      this.epoch=reply.epoch;this.totalVisible=reply.totalVisible;
      if(pivot<this.activeIndex){
        const delta=reply.totalVisible-previousCount;
        if(!expanded && this.activeIndex<=pivot-delta){
          // The focused descendant was removed from the visible preorder.
          this.activeId=nodeId;this.activeIndex=pivot;this.selectedId=nodeId;
        }else this.activeIndex=Math.max(0,this.activeIndex+delta);
      }
      // Preserve a stable scroll anchor when a subtree above the viewport changes size.
      if(pivot<firstVisible){
        const delta=reply.totalVisible-previousCount;
        // A collapse can remove the anchor itself. In that case place it on the parent.
        const nextFirst=delta<0 && firstVisible<pivot-delta+1 ? pivot : Math.max(0,firstVisible+delta);
        this.viewport.scrollTop=nextFirst*this.rowHeight;
      }
      this.spacer.style.height=`${this.totalVisible*this.rowHeight}px`;
    }catch(error){if(this.alive)this.report(error);}
    finally {this.mutation=false;if(this.alive)this.scheduleWindow();}
  }
  async moveTo(index,select=true){
    if(!this.alive||this.mutation||this.totalVisible===0)return;
    const clamped=Math.max(0,Math.min(this.totalVisible-1,index));
    this.activeIndex=clamped;
    const top=clamped*this.rowHeight,bottom=top+this.rowHeight;
    if(top<this.viewport.scrollTop)this.viewport.scrollTop=top;
    else if(bottom>this.viewport.scrollTop+this.viewport.clientHeight)
      this.viewport.scrollTop=bottom-this.viewport.clientHeight;
    const page=await this.controller.query('GET_TREE_WINDOW',{epoch:this.epoch,offset:clamped,limit:1});
    if(!this.alive||page.epoch!==this.epoch||this.activeIndex!==clamped)return;
    this.activeId=page.items[0].nodeId;
    if(select)this.selectedId=this.activeId;
    this.requestSeq++;this.loaded=null;
    if(this.inFlight)this.queued=true;
    else await this.loadWindow();
    this.refreshSelection();
  }
  async handleKey(event){
    if(!this.alive||this.mutation||event.altKey||event.ctrlKey||event.metaKey)return;
    const key=event.key;
    if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End','Enter',' '].includes(key))return;
    event.preventDefault();
    if(key==='ArrowDown')return this.moveTo(this.activeIndex+1);
    if(key==='ArrowUp')return this.moveTo(this.activeIndex-1);
    if(key==='Home')return this.moveTo(0);
    if(key==='End')return this.moveTo(this.totalVisible-1);
    const row=this.windowElement.querySelector(`[data-node-id="${this.activeId}"]`);
    if(!row)return;
    if(key==='ArrowRight' || key==='Enter' || key===' '){
      if(row.getAttribute('aria-expanded')==='false')return this.toggleNode(this.activeId,true);
      if(key==='ArrowRight' && row.getAttribute('aria-expanded')==='true')return this.moveTo(this.activeIndex+1);
      return;
    }
    if(key==='ArrowLeft'){
      if(row.getAttribute('aria-expanded')==='true')return this.toggleNode(this.activeId,false);
      if(row.dataset.parentId===undefined)return;
      const parentId=Number(row.dataset.parentId);
      try {
        const located=await this.controller.query('TREE_REVEAL',{nodeId:parentId,expectedEpoch:this.epoch});
        if(!this.alive||located.epoch!==this.epoch)return;
        return this.moveTo(located.rowIndex);
      }catch(error){if(this.alive)this.report(error);}
    }
  }
}

export function createVirtualTreeView(options){return new VirtualTreeView(options);}
