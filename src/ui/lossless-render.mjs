/** M03 paginated projections (NOT viewport virtualization; that is M04). */
const elem=(tag,cls='',text=undefined)=>{
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(text!==undefined)node.textContent=String(text);return node;
};
const PAGE=40, DOM_CAP=500;
export function createLosslessView({target,controller,isCurrent}) {
  let mounted=0;
  const errorStatus=()=>{if(isCurrent())target.append(elem('p','muted','节点查询失败；重新解析后可重试。'));};
  function createNodeRow(node) {
    const wrap=elem('div','tree-row'), line=elem('div','lossless-line');
    const title=node.label===null?'根节点':node.label;
    line.append(elem('span','tree-key',title+' '));
    if(node.occurrence>0) line.append(elem('span','tree-kind',`(重复键 #${node.occurrence+1}) `));
    line.append(elem('span',`tree-${node.kind}`,node.preview));
    if(node.pointer!==null) line.title=`JSON Pointer: ${node.pointer}`;
    wrap.append(line);mounted++;
    if(node.hasChildren) {
      const details=elem('details','tree-group');
      const summary=elem('summary','','展开子节点');
      const content=elem('div','lossless-children');
      let initialized=false;
      details.append(summary,content);wrap.append(details);
      details.addEventListener('toggle',()=>{if(details.open&&!initialized){initialized=true;void addPage(0);}});
      async function addPage(offset) {
        if(!isCurrent())return;
        if(mounted>=DOM_CAP){content.append(elem('p','truncated',`当前最多挂载 ${DOM_CAP} 行；更多节点请在 M04 虚拟树中浏览。`));return;}
        try {
          const page=await controller.query('GET_CHILDREN',{id:node.id,offset,limit:Math.min(PAGE,DOM_CAP-mounted)});
          if(!isCurrent()||!details.open)return;
          for(const item of page.items) content.append(createNodeRow(item));
          if(page.nextOffset!==null) {
            const more=elem('button','load-more',`加载更多（${page.nextOffset}/${page.total}）`);
            more.addEventListener('click',()=>{more.remove();void addPage(page.nextOffset);});
            content.append(more);
          }
        } catch {errorStatus();}
      }
    }
    return wrap;
  }
  function tree(root) {
    mounted=0;target.replaceChildren(createNodeRow(root));
    const first=target.querySelector('details');if(first)first.open=true;
  }
  async function table(root) {
    mounted=0;
    if(root.kind!=='array'){target.replaceChildren(elem('p','muted','表格预览适用于顶层数组；完整列式与虚拟化表格在 M04 实现。'));return;}
    const wrap=elem('div','table-scroll'),table=elem('table','data-table');
    const head=elem('thead'),tr=elem('tr');
    for(const name of ['索引','类型','数据预览'])tr.append(elem('th','',name));
    head.append(tr);table.append(head);
    const body=elem('tbody');table.append(body);wrap.append(table);
    target.replaceChildren(wrap);
    async function page(offset=0) {
      try{
        const response=await controller.query('GET_CHILDREN',{id:root.id,offset,limit:PAGE});
        if(!isCurrent())return;
        for(const node of response.items){
          const row=elem('tr');
          for(const value of [node.label,node.kind,node.preview])row.append(elem('td','',value));
          body.append(row);
        }
        if(response.nextOffset!==null) {
          const button=elem('button','load-more',`下一页 ${response.nextOffset}/${response.total}`);
          button.addEventListener('click',()=>{button.remove();void page(response.nextOffset);});
          target.append(button);
        }
      }catch{errorStatus();}
    }
    await page();
  }
  return {tree,table};
}
