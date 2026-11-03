/** Evidence-first, DOM-safe issue list. No HTML from JSON ever enters innerHTML. */
import {translate} from '../product/i18n.mjs';
const elem=(tag,className='',value=null)=>{
  const el=document.createElement(tag);if(className)el.className=className;
  if(value!==null)el.textContent=String(value);return el;
};

export class FindingsPanel {
  constructor({target,controller,isCurrent,getLocale=()=> 'en',onLocate=()=>{},onMessage=()=>{}}) {
    Object.assign(this,{target,controller,isCurrent,getLocale,onLocate,onMessage});
    this.seq=0;this.disposed=false;this.items=[];this.nextOffset=0;this.total=0;
  }
  get alive(){return !this.disposed&&this.isCurrent();}
  async mount() {
    const seq=++this.seq;
    this.target.hidden=false;
    this.target.replaceChildren(elem('p','issues-loading',translate(this.getLocale(),'pendingIssue')));
    try {
      const reply=await this.controller.query('GET_FINDINGS',{offset:0,limit:12});
      if(!this.alive||seq!==this.seq)return;
      this.items=reply.items;this.nextOffset=reply.nextOffset;this.total=reply.total;this.truncated=reply.truncated;
      this.render();
    }catch(e){if(this.alive&&seq===this.seq)this.onMessage(e.message,true);}
  }
  async more() {
    if(!this.alive||this.nextOffset===null)return;
    const seq=++this.seq,offset=this.nextOffset;
    try{
      const reply=await this.controller.query('GET_FINDINGS',{offset,limit:12});
      if(!this.alive||seq!==this.seq)return;
      this.items.push(...reply.items);this.nextOffset=reply.nextOffset;this.render();
    }catch(e){if(this.alive&&seq===this.seq)this.onMessage(e.message,true);}
  }
  render() {
    if(!this.alive)return;
    const t=key=>translate(this.getLocale(),key),root=this.target;
    const heading=elem('div','issues-heading');
    heading.append(elem('h3','issues-title',`${t('issuesTitle')} · ${this.total}`),elem('p','issues-intro',t('issuesIntro')));
    const list=elem('div','issues-list');
    if(this.total===0){
      const clean=elem('div','issues-empty');
      clean.append(elem('strong','',t('cleanTitle')),elem('p','',t('cleanInfo')));list.append(clean);
    }
    for(const issue of this.items) {
      const card=elem('article','issue-card');card.dataset.rule=issue.ruleId;
      const top=elem('div','issue-head');
      top.append(elem('span','issue-severity',t('warningLabel')),elem('code','issue-code',issue.ruleId));
      card.append(top,elem('h4','issue-title',t(issue.titleKey)),elem('p','issue-explain',t(issue.explanationKey)));
      const summary=elem('div','issue-meta');
      summary.append(elem('span','',`${t('sourceLine')} ${issue.line}`),elem('code','issue-snippet',issue.snippet));
      if(issue.primary.pointer!==null)summary.append(elem('code','issue-pointer',issue.primary.pointer || '/'));
      card.append(summary);
      if(issue.related.length)card.append(elem('p','issue-related',`${issue.related.length+1} ${this.getLocale()==='zh'?'处属性名证据':'source locations'}`));
      const actions=elem('div','issue-actions');
      const locate=elem('button','issue-locate',t('focusIssue'));locate.type='button';
      locate.addEventListener('click',()=>{if(this.alive)void this.onLocate(issue);});
      const copy=elem('button','issue-copy',t('copyExact'));copy.type='button';
      copy.addEventListener('click',async()=>{
        if(!this.alive)return;
        try{
          const source=this.controller.source,span=issue.primary.span;
          if(typeof source!=='string'||span.start<0||span.end>source.length)throw new RangeError('Invalid source span');
          await navigator.clipboard.writeText(source.slice(span.start,span.end));
          if(this.alive)this.onMessage(t('copySuccess'));
        }catch{if(this.alive)this.onMessage(t('copyFail'),true);}
      });
      actions.append(locate,copy);card.append(actions);list.append(card);
    }
    root.replaceChildren(heading,list);
    if(this.nextOffset!==null){const more=elem('button','issues-more',t('loadMore'));more.type='button';more.addEventListener('click',()=>void this.more());root.append(more);}
    if(this.truncated)root.append(elem('p','issues-truncated',t('truncated')));
  }
  destroy(){this.seq++;this.disposed=true;this.target.hidden=true;this.target.replaceChildren();}
}
export const createFindingsPanel=options=>new FindingsPanel(options);
