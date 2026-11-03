/** Two-axis virtual grid: viewport rows and columns only. AST stays inside the Worker. */
export const TABLE_ROW_HEIGHT=34, TABLE_HEAD_HEIGHT=36, TABLE_COL_WIDTH=190, TABLE_INDEX_WIDTH=74;
export function computeTableWindow(top,left,height,width,rows,cols,opts={}){
  const rh=opts.rowHeight??TABLE_ROW_HEIGHT,cw=opts.columnWidth??TABLE_COL_WIDTH,
    iw=opts.indexWidth??TABLE_INDEX_WIDTH,hh=opts.headHeight??TABLE_HEAD_HEIGHT;
  if(![top,left,height,width,rh,cw,iw,hh].every(Number.isFinite)||
     !Number.isSafeInteger(rows)||rows<0||!Number.isSafeInteger(cols)||cols<0||
     rh<=0||cw<=0||iw<0||hh<0)throw new RangeError('非法表格视口');
  const firstRow=Math.max(0,Math.floor(Math.max(0,top)/rh));
  const firstCol=Math.max(0,Math.floor(Math.max(0,left-iw)/cw));
  const rowOffset=Math.min(rows,Math.max(0,firstRow-(opts.overscanRows??6)));
  const colOffset=Math.min(cols,Math.max(0,firstCol-(opts.overscanCols??2)));
  const rowLimit=Math.min(48,Math.max(1,Math.ceil(height/rh)+2*(opts.overscanRows??6)));
  const colLimit=Math.min(16,Math.max(1,Math.ceil(Math.max(0,width-iw)/cw)+2*(opts.overscanCols??2)));
  return {rowOffset,rowLimit,colOffset,colLimit,totalHeight:hh+rows*rh,totalWidth:iw+cols*cw};
}
const el=(tag,cls='',value)=>{
  const x=document.createElement(tag);
  if(cls)x.className=cls;
  if(value!==undefined)x.textContent=String(value);
  return x;
};
export class VirtualTableView {
  constructor({target,controller,isCurrent,onError=()=>{},onSelectNode=()=>{}}={}){
    if(!target||!controller||typeof isCurrent!=='function')throw new TypeError('缺少虚拟表格依赖');
    Object.assign(this,{target,controller,isCurrent,onError,onSelectNode});
    this.disposed=false;this.epoch=null;this.rowCount=0;this.columnCount=0;
    this.seq=0;this.inFlight=false;this.queued=false;this.frame=null;this.loaded=null;
    this.selectedNodeId=null;
  }
  get alive(){return !this.disposed&&this.isCurrent();}
  async mount(){
    const viewport=el('div','virtual-table-viewport');
    viewport.tabIndex=0;viewport.setAttribute('role','grid');viewport.setAttribute('aria-label','JSON 虚拟表格');
    viewport.setAttribute('aria-busy','true');
    const spacer=el('div','virtual-table-spacer');
    const windowElement=el('div','virtual-table-window');
    const header=el('div','virtual-table-header');
    spacer.append(windowElement,header);viewport.append(spacer);
    const status=el('p','virtual-table-status','正在构建表格列索引…');
    status.setAttribute('role','status');
    this.target.replaceChildren(viewport,status);
    Object.assign(this,{viewport,spacer,windowElement,header,status});
    viewport.addEventListener('scroll',this.scrollListener=()=>this.schedule());
    viewport.addEventListener('click',this.clickListener=e=>{
      const cell=e.target.closest?.('[data-cell-node]');
      if(!cell||!this.windowElement.contains(cell))return;
      const id=Number(cell.dataset.cellNode);
      this.selectedNodeId=id;
      for(const x of this.windowElement.querySelectorAll('.is-selected'))x.classList.remove('is-selected');
      cell.classList.add('is-selected');this.onSelectNode(id);
    });
    try{
      const s=await this.controller.query('GET_TABLE_SCHEMA',{offset:0,limit:16});
      if(!this.alive)return;
      this.epoch=s.epoch;this.mode=s.mode;this.rowCount=s.rowCount;this.columnCount=s.columnCount;
      viewport.setAttribute('aria-rowcount',String(this.rowCount+1));
      viewport.setAttribute('aria-colcount',String(this.columnCount+1));
      spacer.style.height=(TABLE_HEAD_HEIGHT+this.rowCount*TABLE_ROW_HEIGHT)+'px';
      spacer.style.width=(TABLE_INDEX_WIDTH+this.columnCount*TABLE_COL_WIDTH)+'px';
      await this.loadWindow();
    }catch(e){if(this.alive)this.report(e);}
  }
  report(e){this.viewport?.setAttribute('aria-busy','false');this.status.textContent='表格查询失败：'+e.message;this.onError(e);}
  destroy(){
    if(this.disposed)return;
    this.disposed=true;this.seq++;
    if(this.frame!==null)cancelAnimationFrame(this.frame);
    this.viewport?.removeEventListener('scroll',this.scrollListener);
    this.viewport?.removeEventListener('click',this.clickListener);
  }
  schedule(){
    if(!this.alive||this.epoch===null)return;
    this.seq++;
    if(this.inFlight){this.queued=true;return;}
    if(this.frame!==null)return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;void this.loadWindow();});
  }
  async loadWindow(){
    if(!this.alive||this.epoch===null)return;
    if(this.inFlight){this.queued=true;return;}
    const r=computeTableWindow(this.viewport.scrollTop,this.viewport.scrollLeft,
      this.viewport.clientHeight||450,this.viewport.clientWidth||600,this.rowCount,this.columnCount);
    r.rowLimit=Math.min(r.rowLimit,Math.floor(800/r.colLimit));
    const sig=JSON.stringify([this.epoch,r.rowOffset,r.rowLimit,r.colOffset,r.colLimit]);
    if(sig===this.loaded)return;
    const seq=this.seq,epoch=this.epoch;
    this.inFlight=true;this.viewport.setAttribute('aria-busy','true');
    try{
      const data=await this.controller.query('GET_TABLE_WINDOW',{epoch,rowOffset:r.rowOffset,rowLimit:r.rowLimit,
        colOffset:r.colOffset,colLimit:r.colLimit});
      if(!this.alive||this.seq!==seq||this.epoch!==epoch)return;
      this.render(data);this.loaded=sig;this.viewport.setAttribute('aria-busy','false');
      this.status.textContent='虚拟表格：'+this.rowCount+' 行 × '+this.columnCount+
        ' 列 · 当前 '+data.rows.length+' 行 / '+data.columns.length+' 列';
    }catch(e){if(this.alive&&this.seq===seq)this.report(e);}
    finally{
      this.inFlight=false;
      if(this.queued&&this.alive){this.queued=false;this.schedule();}
    }
  }
  render(data){
    const fragment=document.createDocumentFragment();
    const headerRow=el('div','virtual-table-head-row');
    headerRow.setAttribute('role','row');headerRow.setAttribute('aria-rowindex','1');
    const indexHead=el('div','virtual-table-cell virtual-table-index','#');
    indexHead.setAttribute('role','columnheader');indexHead.setAttribute('aria-colindex','1');
    indexHead.style.left=this.viewport.scrollLeft+'px';headerRow.append(indexHead);
    for(let j=0;j<data.columns.length;j++){
      const c=data.columns[j],cell=el('div','virtual-table-cell virtual-table-heading',c.display);
      cell.setAttribute('role','columnheader');cell.setAttribute('aria-colindex',String(data.colOffset+j+2));
      cell.style.left=(TABLE_INDEX_WIDTH+(data.colOffset+j)*TABLE_COL_WIDTH)+'px';
      if(c.truncated)cell.title='完整属性名称已保留在 AST 中';headerRow.append(cell);
    }
    this.header.style.top=this.viewport.scrollTop+'px';this.header.replaceChildren(headerRow);
    for(const row of data.rows){
      const item=el('div','virtual-table-row');item.setAttribute('role','row');
      item.setAttribute('aria-rowindex',String(row.rowIndex+2));
      item.style.top=(TABLE_HEAD_HEIGHT+row.rowIndex*TABLE_ROW_HEIGHT)+'px';
      const index=el('div','virtual-table-cell virtual-table-index',row.rowIndex);
      index.setAttribute('role','rowheader');index.setAttribute('aria-colindex','1');
      index.style.left=this.viewport.scrollLeft+'px';item.append(index);
      for(let j=0;j<row.cells.length;j++){
        const c=row.cells[j],cell=el('div','virtual-table-cell',c.preview);
        cell.style.left=(TABLE_INDEX_WIDTH+(data.colOffset+j)*TABLE_COL_WIDTH)+'px';
        cell.setAttribute('role','gridcell');cell.setAttribute('aria-colindex',String(data.colOffset+j+2));
        cell.classList.add(c.state==='missing'?'is-missing':'cell-'+c.kind);
        if(c.state==='missing')cell.setAttribute('aria-label','属性缺失');
        if(c.nodeId!==null){cell.dataset.cellNode=String(c.nodeId);cell.tabIndex=-1;}
        if(c.nodeId===this.selectedNodeId)cell.classList.add('is-selected');
        item.append(cell);
      }
      fragment.append(item);
    }
    this.windowElement.replaceChildren(fragment);
  }
}
export function createVirtualTableView(options){return new VirtualTableView(options);}
