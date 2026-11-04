/** PRODUCT-04: deliberate local-only report export with explicit sensitive-data review. */
import {buildEvidenceReport,serializeEvidenceReport} from '../product/evidence-report.mjs';
import {translate} from '../product/i18n.mjs';
const el = (tag, cls='', text=null) => {
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(text!==null)node.textContent=String(text);
  return node;
};
export class EvidenceReportPanel {
  constructor({target,controller,isCurrent,getLocale=()=> 'en',getDrift=()=>null,onMessage=()=>{}}) {
    Object.assign(this,{target,controller,isCurrent,getLocale,getDrift,onMessage});
    this.disposed=false;this.version=0;this.output=null;this.driftRun=null;
  }
  get alive(){return !this.disposed&&this.isCurrent();}
  get t(){return key=>translate(this.getLocale(),key);}
  mount() {
    if(!this.alive)return;
    const panel=el('section','report-card');panel.setAttribute('aria-label','Privacy-aware inspection report');
    const heading=el('h3','report-heading');heading.id='reportHeading';
    const description=el('p','report-description');
    const options=el('div','report-options');
    const formatLabel=el('label');formatLabel.htmlFor='reportFormat';
    const format=el('select');format.id='reportFormat';
    for(const [value,key] of [['json','reportJson'],['markdown','reportMarkdown']]){
      const item=el('option','',this.t(key));item.value=value;item.dataset.i18n=key;format.append(item);
    }
    formatLabel.append(' ',format);
    const detailedLabel=el('label','report-sensitive-label');
    const detailed=el('input');detailed.type='checkbox';detailed.id='reportDetailed';
    const detailedText=el('span');detailedLabel.append(detailed,detailedText);
    const build=el('button','report-build');build.id='reportBuildBtn';build.type='button';
    options.append(formatLabel,detailedLabel,build);
    const status=el('p','report-feedback');status.id='reportFeedback';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const preview=el('pre','report-preview');preview.id='reportPreview';preview.tabIndex=0;
    const confirmLabel=el('label','report-confirm-label');confirmLabel.hidden=true;
    const confirm=el('input');confirm.type='checkbox';confirm.id='reportReviewed';
    const confirmText=el('span');confirmLabel.append(confirm,confirmText);
    const actions=el('div','report-export-actions');
    const copy=el('button','report-copy');copy.id='reportCopyBtn';copy.type='button';copy.disabled=true;
    const download=el('button','report-download');download.id='reportDownloadBtn';download.type='button';download.disabled=true;
    actions.append(copy,download);
    const privacy=el('p','report-privacy-note');
    const proof=el('a','report-privacy-link');proof.href='./privacy.html';proof.id='privacyProofLink';
    panel.append(heading,description,options,status,preview,confirmLabel,actions,privacy,proof);
    this.target.replaceChildren(panel);this.target.hidden=false;
    this.ui={heading,description,formatLabel,format,detailed,detailedText,build,status,preview,confirmLabel,confirm,confirmText,copy,download,privacy,proof};
    const reset=()=>this.invalidate();
    detailed.addEventListener('change',reset);
    format.addEventListener('change',reset);
    confirm.addEventListener('change',()=>this.updateActions());
    build.addEventListener('click',()=>void this.generate());
    copy.addEventListener('click',()=>void this.copy());
    download.addEventListener('click',()=>this.download());
    this.render();
  }
  invalidate(){this.version++;this.output=null;this.driftRun=null;if(this.ui){this.ui.preview.textContent='';this.ui.confirm.checked=false;this.ui.status.textContent='';this.updateActions();}}
  render(){
    if(!this.alive||!this.ui)return;
    const t=this.t,u=this.ui;
    for(const [node,key] of [[u.heading,'reportTitle'],[u.description,'reportIntro'],[u.detailedText,'reportSensitive'],
      [u.build,'reportPreviewBtn'],[u.confirmText,'reportReviewConfirm'],[u.copy,'reportCopyBtn'],
      [u.download,'reportDownloadBtn'],[u.privacy,'reportCaution'],[u.proof,'reportPrivacyLink']])node.textContent=t(key);
    u.formatLabel.firstChild.textContent=t('reportFormatLabel')+' ';
    for(const option of u.format.options)option.textContent=t(option.dataset.i18n);
    this.updateActions();
  }
  driftSignature(){const d=this.getDrift();return d?.report?`${d.report.runId}:${d.seq}`:null;}
  updateActions(){
    if(!this.ui)return;
    const u=this.ui;
    const reviewed=!u.detailed.checked||u.confirm.checked;
    const fresh=this.alive&&this.output!==null&&this.driftRun===this.driftSignature();
    u.confirmLabel.hidden=!u.detailed.checked;
    u.copy.disabled=u.download.disabled=!fresh||!reviewed;
  }
  async generate(){
    if(!this.alive)return;
    const u=this.ui,requestId=++this.version,revision=this.controller.revision;
    this.output=null;u.confirm.checked=false;this.updateActions();u.status.textContent=this.t('reportBuilding');
    const signature=this.driftSignature();
    try{
      const findings=[];let offset=0,reply;
      do {
        reply=await this.controller.query('GET_FINDINGS',{offset,limit:30});
        if(!this.alive||this.version!==requestId||revision!==this.controller.revision||signature!==this.driftSignature())return;
        findings.push(...reply.items);offset=reply.nextOffset;
      }while(offset!==null&&findings.length<100);
      const drift=this.getDrift()?.report?{report:this.getDrift().report,observations:this.getDrift().observations}:null;
      const source=this.controller.source;
      const report=buildEvidenceReport({findings,inspection:{...this.controller.snapshot.summary?.inspection,...reply},drift,source,includeDetails:u.detailed.checked});
      const output=serializeEvidenceReport(report,u.format.value);
      if(output.length>200_000)throw new RangeError('Report exceeds local export budget');
      if(!this.alive||this.version!==requestId||revision!==this.controller.revision||signature!==this.driftSignature())return;
      this.output=output;this.driftRun=signature;
      u.preview.textContent=output;u.status.textContent=this.t(u.detailed.checked?'reportDetailedReady':'reportSafeReady');
      this.updateActions();
    }catch(error){if(this.alive&&this.version===requestId){u.status.textContent=`${this.t('reportError')}: ${error.message}`;this.updateActions();}}
  }
  eligible(){this.updateActions();return Boolean(this.alive&&this.output!==null&&this.driftRun===this.driftSignature()&&(!this.ui.detailed.checked||this.ui.confirm.checked));}
  async copy(){
    if(!this.eligible())return;
    const value=this.output,revision=this.controller.revision;
    try{
      await navigator.clipboard.writeText(value);
      if(this.alive&&revision===this.controller.revision)this.ui.status.textContent=this.t('reportCopied');
    }catch{if(this.alive)this.ui.status.textContent=this.t('copyFail');}
  }
  download(){
    if(!this.eligible())return;
    const format=this.ui.format.value,filename=`jsonparse-inspection.${format==='json'?'json':'md'}`;
    const blob=new Blob([this.output],{type:format==='json'?'application/json;charset=utf-8':'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.download=filename;anchor.href=url;document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    this.ui.status.textContent=this.t('reportDownloaded');
  }
  destroy(){this.disposed=true;this.invalidate();this.target.replaceChildren();this.target.hidden=true;this.ui=null;}
}
export const createEvidenceReportPanel=opts=>new EvidenceReportPanel(opts);
