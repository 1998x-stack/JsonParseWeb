/** PRODUCT-03: source-linked observations from user-supplied, local-only samples.
 * The Worker performs all AST analysis. Source bytes never enter links/storage/network.
 */
import {decodeUtf8} from '../../packages/json-core/import.mjs';
import {translate} from '../product/i18n.mjs';
const MAX_SAMPLES=5, MAX_BYTES=2*1024*1024;
const el=(tag,cls='',value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=String(value);return node;};
export class SchemaDriftPanel {
  constructor({target,controller,sourceInput,isCurrent,getLocale=()=> 'en',onMessage=()=>{},onAnalysisChange=()=>{}}){
    Object.assign(this,{target,controller,sourceInput,isCurrent,getLocale,onMessage,onAnalysisChange});
    this.samples=[];this.report=null;this.seq=0;this.disposed=false;this.observations=[];this.fields=[];
    this.nextObservations=null;this.nextFields=null;
  }
  get alive(){return !this.disposed&&this.isCurrent();}
  get t(){return key=>translate(this.getLocale(),key);}
  mount(){
    if(!this.alive)return;
    this.target.hidden=false;
    const details=el('details','drift-disclosure');details.id='driftDisclosure';
    const summary=el('summary','drift-toggle');summary.dataset.i18n='driftTitle';details.append(summary);
    const intro=el('p','drift-intro');intro.dataset.i18n='driftIntro';
    const actions=el('div','drift-actions');
    const label=el('label','drift-file-label');label.htmlFor='driftFiles';label.dataset.i18n='driftFilesLabel';
    const input=el('input');input.type='file';input.id='driftFiles';input.accept='.json,application/json';input.multiple=true;
    const run=el('button','drift-run');run.type='button';run.id='driftRunBtn';run.dataset.i18n='driftAnalyze';
    const clear=el('button','drift-clear');clear.type='button';clear.id='driftClearBtn';clear.dataset.i18n='driftClear';
    actions.append(label,input,run,clear);
    const names=el('p','drift-files');names.id='driftFileInfo';
    const feedback=el('p','drift-feedback');feedback.id='driftFeedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const result=el('div','drift-results');result.id='driftResults';
    const evidence=el('div','drift-evidence');evidence.id='driftEvidence';evidence.hidden=true;
    const title=el('p','drift-evidence-title');title.id='driftEvidenceTitle';
    const original=el('textarea','drift-evidence-source');original.id='driftEvidenceSource';original.readOnly=true;original.setAttribute('aria-label','Local sample source evidence');
    evidence.append(title,original);
    details.append(intro,actions,names,feedback,result,evidence);
    this.target.replaceChildren(details);
    this.nodes={details,summary,intro,label,input,run,clear,names,feedback,result,evidence,title,original};
    input.addEventListener('change',()=>{void this.loadFiles([...input.files]);input.value='';});
    run.addEventListener('click',()=>{void this.analyze();});
    clear.addEventListener('click',()=>{this.seq++;this.samples=[];this.report=null;this.observations=[];this.fields=[];this.onAnalysisChange();this.resetPresentation();});
    this.render();
  }
  resetPresentation(){
    const n=this.nodes;if(!n)return;
    n.result.replaceChildren();n.evidence.hidden=true;n.original.value='';n.feedback.textContent='';this.renderNames();
  }
  renderNames(){
    if(!this.nodes)return;
    const t=this.t;
    this.nodes.names.textContent=this.samples.length
      ? `${this.samples.length} ${t('driftAdded')}: ${this.samples.map(x=>x.name).join(', ')}`
      :t('driftNoFiles');
  }
  async loadFiles(files){
    if(!this.alive)return;
    const seq=++this.seq,n=this.nodes,t=this.t;
    n.feedback.textContent=t('driftLoading');
    if(files.length===0){n.feedback.textContent='';return;}
    if(files.length>MAX_SAMPLES){n.feedback.textContent=t('driftLimit');return;}
    try{
      const data=[];let bytes=new TextEncoder().encode(this.sourceInput.value).length;
      for(const [index,file] of files.entries()){
        if(!file.name.toLowerCase().endsWith('.json'))throw new Error(t('driftJsonOnly'));
        bytes+=file.size;
        if(bytes>MAX_BYTES)throw new Error(t('driftLimit'));
        const buffer=await file.arrayBuffer();
        if(!this.alive||seq!==this.seq)return;
        const {source}=decodeUtf8(buffer,{bom:'reject'});
        data.push({id:`sample-${index+1}`,name:file.name.slice(0,80),source});
      }
      if(!this.alive||seq!==this.seq)return;
      this.samples=data;this.report=null;this.observations=[];this.fields=[];this.onAnalysisChange();
      this.resetPresentation();n.feedback.textContent=t('driftReady');
    }catch(error){if(this.alive&&seq===this.seq){this.samples=[];this.report=null;this.observations=[];this.fields=[];this.onAnalysisChange();this.resetPresentation();n.feedback.textContent=`${t('driftReadError')}: ${error.code||''} ${error.message}`;}}
  }
  async analyze(){
    if(!this.alive)return null;
    const seq=++this.seq,t=this.t;
    this.report=null;this.observations=[];this.fields=[];this.nextObservations=null;this.nextFields=null;this.onAnalysisChange();
    this.nodes.details.open=true;this.nodes.feedback.textContent=t('driftProgress');this.nodes.result.replaceChildren();this.nodes.evidence.hidden=true;
    try{
      const reply=await this.controller.query('INSPECT_SCHEMA_DRIFT',{
        samples:this.samples.map(({id,source})=>({id,source}))});
      if(!this.alive||seq!==this.seq)return null;
      this.report=reply;this.observations=reply.observations;this.fields=reply.fields;this.onAnalysisChange();
      this.nextObservations=reply.retainedObservations>reply.observations.length?reply.observations.length:null;
      this.nextFields=reply.retainedFields>reply.fields.length?reply.fields.length:null;
      this.nodes.feedback.textContent=t('driftDone');this.render();return reply;
    }catch(error){
      if(this.alive&&seq===this.seq)this.nodes.feedback.textContent=`${error.code||'DRIFT_ERROR'}: ${error.message}`;
      return null;
    }
  }
  async more(kind){
    if(!this.alive||!this.report)return;
    const offset=kind==='fields'?this.nextFields:this.nextObservations;
    if(offset===null)return;
    const seq=++this.seq,runId=this.report.runId;
    try{
      const reply=await this.controller.query('GET_SCHEMA_DRIFT_PAGE',{runId,kind,offset,limit:16});
      if(!this.alive||seq!==this.seq||runId!==this.report?.runId)return;
      this[kind].push(...reply.items);this.onAnalysisChange();
      if(kind==='fields')this.nextFields=reply.nextOffset;else this.nextObservations=reply.nextOffset;
      this.render();
    }catch(error){if(this.alive&&seq===this.seq)this.nodes.feedback.textContent=error.message;}
  }
  reveal(ref){
    if(!this.alive||!ref)return;
    const t=this.t;
    const text=ref.sampleId==='current'?this.sourceInput.value:this.samples.find(x=>x.id===ref.sampleId)?.source;
    const span=ref.span;
    if(typeof text!=='string'||!Number.isSafeInteger(span?.start)||!Number.isSafeInteger(span?.end)||span.start<0||span.end>text.length||span.end<span.start){
      this.nodes.feedback.textContent=t('driftStale');return;
    }
    if(ref.sampleId==='current'){
      this.sourceInput.focus();this.sourceInput.setSelectionRange(span.start,span.end);
      this.onMessage(t('sourceHighlighted'));
    }else{
      const n=this.nodes;n.evidence.hidden=false;
      const sample=this.samples.find(x=>x.id===ref.sampleId);
      n.title.textContent=`${sample.name} · ${t('sourceLine')} ${ref.line} · ${t('driftSourceLocal')}`;
      n.original.value=text;n.original.focus();n.original.setSelectionRange(span.start,span.end);
      n.original.scrollIntoView({block:'nearest'});
    }
  }
  render(){
    if(!this.alive||!this.nodes)return;
    const n=this.nodes,t=this.t;
    for(const [name,key] of [['summary','driftTitle'],['intro','driftIntro'],['label','driftFilesLabel'],['run','driftAnalyze'],['clear','driftClear']])n[name].textContent=t(key);
    this.renderNames();
    if(!this.report)return;
    const r=this.report,container=el('div','drift-body');
    container.append(el('p','drift-method',`${t('driftScope')}: ${r.eligibleRecords} · ${t('driftExcluded')}: ${r.excludedValues} · ${t('driftFields')}: ${r.totalFields}. ${t('driftCaution')}`));
    const heading=el('h4','drift-heading',`${t('driftObservations')} · ${r.totalObservations}`);container.append(heading);
    const obs=el('div','drift-list');
    if(r.eligibleRecords<3)obs.append(el('p','drift-low',t('driftLowSample')));
    else if(r.totalObservations===0)obs.append(el('p','drift-low',t('driftNoObservations')));
    for(const item of this.observations){
      const card=el('article','drift-card');card.dataset.rule=item.ruleId;
      card.append(el('strong','',t(item.ruleId)),el('code','drift-field-name',`${item.key}${item.occurrence>0?` #${item.occurrence+1}`:''}`));
      card.append(el('p','drift-distribution',`${t('driftPresent')} ${item.present}/${item.eligible} · ${t('driftMissing')} ${item.missing} · null ${item.nullCount} · ${Object.entries(item.types).map(([kind,count])=>`${kind}: ${count}`).join(', ')}`));
      const refs=[item.primary,...item.related].filter(Boolean);const seen=new Set();
      const acts=el('div','drift-evidence-actions');
      for(const ref of refs){
        const id=`${ref.sampleId}:${ref.span.start}:${ref.span.end}`;if(seen.has(id))continue;seen.add(id);
        const btn=el('button','drift-locate',`${t('driftEvidence')} · ${ref.sampleId} · ${t('sourceLine')} ${ref.line}`);
        btn.type='button';btn.addEventListener('click',()=>this.reveal(ref));acts.append(btn);
      }
      card.append(acts);obs.append(card);
    }
    container.append(obs);
    if(this.nextObservations!==null){const more=el('button','drift-more',t('driftMore'));more.addEventListener('click',()=>void this.more('observations'));container.append(more);}
    if(r.observationsTruncated)container.append(el('p','drift-caution',t('driftTruncated')));
    container.append(el('h4','drift-heading',`${t('driftFields')} · ${r.totalFields}`));
    const scroll=el('div','drift-fields-scroll'),table=el('table','drift-fields-table'),thead=el('thead'),tr=el('tr');
    for(const title of [t('driftField'),t('driftPresent'),t('driftMissing'),t('driftTypeCounts')])tr.append(el('th','',title));
    thead.append(tr);table.append(thead);const tbody=el('tbody');
    for(const field of this.fields){
      const row=el('tr');
      for(const content of [`${field.key}${field.occurrence>0?` #${field.occurrence+1}`:''}`,`${field.present}/${r.eligibleRecords}`,String(field.missing),Object.entries(field.types).map(([kind,count])=>`${kind} ${count}`).join(' · ')])row.append(el('td','',content));
      tbody.append(row);
    }
    table.append(tbody);scroll.append(table);container.append(scroll);
    if(this.nextFields!==null){const more=el('button','drift-more',t('driftMoreFields'));more.addEventListener('click',()=>void this.more('fields'));container.append(more);}
    if(r.fieldsTruncated)container.append(el('p','drift-caution',t('driftTruncated')));
    n.result.replaceChildren(container);
  }
  destroy(){this.disposed=true;this.seq++;this.samples=[];this.report=null;this.target.replaceChildren();this.target.hidden=true;this.nodes=null;}
}
export const createSchemaDriftPanel=options=>new SchemaDriftPanel(options);
