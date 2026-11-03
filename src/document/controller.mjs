import {WorkerRequestError} from '../worker/client.mjs';

/** Owns document revision; stale worker completions never update visible state. */
export class DocumentController {
  constructor(client,{docId='local',onChange=()=>{}}={}) {
    this.client=client;this.docId=docId;this.onChange=onChange;
    this.revision=0;this.phase='idle';this.summary=null;this.message='';this.source='';
  }
  get snapshot(){return {revision:this.revision,phase:this.phase,summary:this.summary,message:this.message};}
  #publish(){this.onChange(this.snapshot);}
  setSource(source) {
    if(typeof source!=='string') throw new TypeError('source 必须是字符串');
    this.source=source;this.revision++;this.summary=null;this.phase='idle';this.message='';
    this.client.cancel('文档输入已修改');this.#publish();return this.revision;
  }
  cancel() {this.client.cancel('用户已取消解析');this.summary=null;this.phase='cancelled';this.message='解析已取消';this.#publish();}
  async #receive(promise,revision) {
    try {
      const summary=await promise;
      if(revision!==this.revision) return null;
      this.summary=summary;
      if(typeof summary.importedSource==='string') this.source=summary.importedSource;
      this.phase=summary.validSyntax?'ready':'invalid';
      this.message=summary.validSyntax?'解析完成':(summary.diagnostics?.[0]?.message??'JSON 无效');
      this.#publish();return summary;
    } catch(error) {
      if(revision!==this.revision || this.phase==='cancelled' || (error instanceof WorkerRequestError && error.code==='CANCELLED')) return null;
      this.summary=null;this.phase='error';this.message=error.message||'Worker 故障';this.#publish();
      throw error;
    }
  }
  async parse(){
    const revision=this.revision;
    this.summary=null;this.phase='parsing';this.message='正在后台解析';this.#publish();
    return this.#receive(this.client.parse(this.docId,revision,this.source),revision);
  }
  async parseFile(buffer,{bom='reject'}={}){
    const revision=this.revision;
    this.summary=null;this.phase='parsing';this.message='正在后台解析文件';this.#publish();
    return this.#receive(this.client.parseBytes(this.docId,revision,buffer,{bom}),revision);
  }
  async query(type,payload){
    if(this.phase!=='ready') throw new WorkerRequestError('NOT_READY','当前文档尚未成功解析');
    const revision=this.revision;
    const result=await this.client.query(type,payload,this.docId,revision);
    if(revision!==this.revision||this.phase!=='ready') throw new WorkerRequestError('STALE_DOCUMENT','旧版本查询结果已丢弃');
    return result;
  }
  destroy(){this.client.close();}
}
