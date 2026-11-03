/** Source-preserving AST table index. Entire AST stays in Worker. */
export class TableProjectionError extends Error {
  constructor(code,message){super(message);this.name='TableProjectionError';this.code=code;}
}
const fail=(code,message)=>new TableProjectionError(code,message);
const integer=(v,lo,hi)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const clip=(value,cap)=>{
  if(value.length<=cap)return value;
  let end=cap;
  const code=value.charCodeAt(end-1);
  if(code>=0xd800&&code<=0xdbff)end--;
  return value.slice(0,end)+'…';
};
export class TableProjection {
  constructor(doc,rootId=doc?.rootId){
    if(!doc?.ok||!Array.isArray(doc.nodes))throw fail('INVALID_DOCUMENT','需要有效的 AST');
    const root=doc.nodes[rootId];
    if(!root||root.kind!=='array')throw fail('NOT_ARRAY','表格视图需要顶层 JSON 数组');
    this.doc=doc;this.rootId=rootId;this.rowIds=root.children;this.rowCount=this.rowIds.length;this.epoch=0;
    this.mode=this.rowCount>0&&this.rowIds.every(id=>doc.nodes[id].kind==='object')?'records':'mixed';
    this.columns=[];
    if(this.mode==='records'){
      const seen=new Set();
      for(const id of this.rowIds)for(const memberId of doc.nodes[id].members){
        const m=doc.members[memberId],uid=JSON.stringify([m.key,m.occurrence]);
        if(!seen.has(uid)){
          seen.add(uid);
          this.columns.push({id:uid,key:m.key,occurrence:m.occurrence,
            display:clip(m.key,120)+(m.occurrence>0?' (#'+(m.occurrence+1)+')':''),
            truncated:m.key.length>120});
        }
      }
    } else this.columns=[{id:'@kind',display:'类型'},{id:'@value',display:'值'}];
    this.columnCount=this.columns.length;this.rowCache=new Map();
  }
  schema(offset=0,limit=16){
    if(!integer(offset,0,this.columnCount)||!integer(limit,1,24))throw fail('INVALID_TABLE_WINDOW','列窗口参数无效');
    return {epoch:this.epoch,rootId:this.rootId,rowCount:this.rowCount,columnCount:this.columnCount,
      mode:this.mode,offset,columns:this.columns.slice(offset,offset+limit).map(({key,...c})=>c),
      nextOffset:offset+limit<this.columnCount?offset+limit:null};
  }
  lookup(id){
    let index=this.rowCache.get(id);
    if(index){this.rowCache.delete(id);this.rowCache.set(id,index);return index;}
    index=new Map();
    for(const memberId of this.doc.nodes[id].members){
      const m=this.doc.members[memberId];index.set(JSON.stringify([m.key,m.occurrence]),m.valueId);
    }
    this.rowCache.set(id,index);
    if(this.rowCache.size>96)this.rowCache.delete(this.rowCache.keys().next().value);
    return index;
  }
  cell(id){
    const node=this.doc.nodes[id],count=node.kind==='array'?node.children.length:node.kind==='object'?node.members.length:0;
    const preview=node.kind==='array'||node.kind==='object'
      ?(node.kind==='array'?'Array':'Object')+' ('+count+')'
      :clip(this.doc.source.slice(node.start,Math.min(node.end,node.start+121)),120);
    return {state:'present',nodeId:id,kind:node.kind,preview,span:{start:node.start,end:node.end}};
  }
  window({epoch,rowOffset=0,rowLimit=30,colOffset=0,colLimit=12}={}){
    if(epoch!==this.epoch)throw fail('TABLE_EPOCH_CONFLICT','表格模型已更新');
    if(!integer(rowOffset,0,this.rowCount)||!integer(rowLimit,1,80)||
       !integer(colOffset,0,this.columnCount)||!integer(colLimit,1,24)||rowLimit*colLimit>800)
      throw fail('INVALID_TABLE_WINDOW','表格窗口过大或参数无效');
    const columns=this.columns.slice(colOffset,colOffset+colLimit),rows=[];
    for(let i=rowOffset;i<Math.min(this.rowCount,rowOffset+rowLimit);i++){
      const rowId=this.rowIds[i],node=this.doc.nodes[rowId],lookup=this.mode==='records'?this.lookup(rowId):null;
      const cells=columns.map(c=>{
        if(this.mode==='mixed')return c.id==='@kind'?{state:'present',nodeId:rowId,kind:'type',preview:node.kind}:this.cell(rowId);
        return lookup.has(c.id)?this.cell(lookup.get(c.id)):{state:'missing',nodeId:null,kind:null,preview:'—'};
      });
      rows.push({rowIndex:i,nodeId:rowId,cells});
    }
    return {epoch:this.epoch,mode:this.mode,rowCount:this.rowCount,columnCount:this.columnCount,
      rowOffset,colOffset,columns:columns.map(({key,...c})=>c),rows};
  }
}
