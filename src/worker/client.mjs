/** Browser/Node-compatible Worker transport with hard cancellation and bounded pending requests. */
export class WorkerRequestError extends Error {
  constructor(code,message) {super(message);this.code=code;this.name='WorkerRequestError';}
}
const fail = (code,message) => new WorkerRequestError(code,message);
const isValid = (n) => Number.isSafeInteger(n) && n >= 0;
export class WorkerClient {
  constructor({workerFactory,maxPending=32}={}) {
    if(typeof workerFactory!=='function') throw new TypeError('workerFactory required');
    this.workerFactory=workerFactory;this.maxPending=maxPending;
    this.worker=null;this.pending=new Map();this.requestId=0;this.generation=0;
    this.docId=null;this.revision=null;this.closed=false;
  }
  #ensureWorker() {
    if(this.closed) throw fail('CLOSED','Worker 客户端已关闭');
    if(this.worker) return this.worker;
    const worker=this.workerFactory(), generation=++this.generation;
    this.worker=worker;
    const message = event => {
      if(generation!==this.generation) return;
      const reply=event?.data;
      const p=this.pending.get(reply?.requestId);
      if(!p || reply?.docId!==p.docId || reply?.revision!==p.revision) return;
      this.pending.delete(reply.requestId);
      if(reply.ok) p.resolve(reply.payload);
      else p.reject(fail(reply.error?.code||'WORKER_FAILURE',reply.error?.message||'请求失败'));
    };
    const crash = event => {
      if(generation!==this.generation) return;
      const msg=typeof event?.message==='string'?event.message:'Worker 已异常退出';
      this.#reset(fail('WORKER_CRASH',msg));
    };
    if (typeof worker.addEventListener==='function') {
      worker.addEventListener('message',message);
      worker.addEventListener('error',crash);
      worker.addEventListener('messageerror',crash);
    } else if (typeof worker.on==='function') {
      worker.on('message',data=>message({data}));
      worker.on('error',crash);
      worker.on('exit',code=>{if(generation===this.generation) crash({message:`Worker 已退出：${code}`});});
    } else throw new TypeError('Unsupported Worker interface');
    return worker;
  }
  #reset(error) {
    this.generation++;
    const worker=this.worker;this.worker=null;this.docId=null;this.revision=null;
    for(const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    if(worker) {try {void worker.terminate();}catch{/* already exited */}}
  }
  cancel(reason='操作已取消') {this.#reset(fail('CANCELLED',reason));}
  close() {if(!this.closed){this.closed=true;this.#reset(fail('CLOSED','Worker 客户端已关闭'));}}
  #request(type,docId,revision,payload,transfer=[]) {
    if(this.closed) return Promise.reject(fail('CLOSED','Worker 客户端已关闭'));
    if(this.pending.size>=this.maxPending) return Promise.reject(fail('BACKPRESSURE','请求队列已满'));
    let worker;
    try{worker=this.#ensureWorker();}catch(error){return Promise.reject(error);}
    const requestId=++this.requestId;
    return new Promise((resolve,reject)=>{
      this.pending.set(requestId,{resolve,reject,docId,revision});
      try{worker.postMessage({type,requestId,docId,revision,payload},transfer);}
      catch(error){this.pending.delete(requestId);reject(fail('POST_MESSAGE_ERROR',error.message));}
    });
  }
  parse(docId,revision,source) {
    if(typeof docId!=='string'||!docId||docId.length>128||!isValid(revision)) return Promise.reject(fail('INVALID_REQUEST','文档标识无效'));
    this.cancel('新的解析请求替代旧版本');
    this.docId=docId;this.revision=revision;
    return this.#request('PARSE',docId,revision,{source});
  }
  parseBytes(docId,revision,buffer,{bom='reject'}={}) {
    if(!(buffer instanceof ArrayBuffer)) return Promise.reject(fail('INVALID_INPUT','buffer 必须为 ArrayBuffer'));
    if(typeof docId!=='string'||!docId||docId.length>128||!isValid(revision)) return Promise.reject(fail('INVALID_REQUEST','文档标识无效'));
    this.cancel('新的解析请求替代旧版本');
    this.docId=docId;this.revision=revision;
    return this.#request('PARSE_BYTES',docId,revision,{buffer,bom},[buffer]);
  }
  query(type,payload={},docId=this.docId,revision=this.revision) {
    if(docId!==this.docId||revision!==this.revision||docId===null)
      return Promise.reject(fail('STALE_DOCUMENT','文档版本已经变化'));
    if(!['GET_NODE','GET_CHILDREN','GET_SOURCE_SLICE','RESOLVE_POINTER','FORMAT','TREE_INIT','TREE_SET_EXPANDED','GET_TREE_WINDOW','TREE_REVEAL'].includes(type))
      return Promise.reject(fail('INVALID_OPERATION','禁止的查询类型'));
    return this.#request(type,docId,revision,payload);
  }
}
