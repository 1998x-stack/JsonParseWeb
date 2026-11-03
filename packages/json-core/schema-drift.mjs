/** PRODUCT-03: observational schema analysis of supplied JSON samples.
 * Uses lossless AST member records; it never infers a normative API schema.
 * All references are per-document UTF-16 spans. No user JSON leaves the Worker.
 */
import {locate} from './diagnostics.mjs';
import {safePointer} from './findings.mjs';

const LIMITS=Object.freeze({maxRecords:100_000,maxFields:160,maxObservations:100,maxEvidence:3});
const NAME_LIMIT=120, PREVIEW_LIMIT=100;
const integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
function clip(text,max){if(text.length<=max)return text;let stop=max;if(stop>0){const n=text.charCodeAt(stop-1);if(n>=0xd800&&n<=0xdbff)stop--;}return text.slice(0,stop)+'…';}
function reference(sample,doc,nodeId,field=null){
  const node=doc.nodes[nodeId], key=field?.member;
  const span={start:node.start,end:node.end};
  const keySpan=key?{start:key.keyStart,end:key.keyEnd}:null;
  const raw=doc.source.slice(node.start,Math.min(node.end,node.start+PREVIEW_LIMIT));
  return {sampleId:sample.id,nodeId,span,keySpan,pointer:safePointer(doc,nodeId),
    line:locate(doc.lineStarts,span.start).line,kind:node.kind,
    preview:clip(raw,PREVIEW_LIMIT)};
}
function normalizeSamples(samples){
  if(!Array.isArray(samples)||samples.length<1||samples.length>6)throw new RangeError('Expected 1..6 documents');
  const ids=new Set();
  for(const item of samples){
    if(typeof item?.id!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(item.id)||ids.has(item.id)||!item.doc?.ok)
      throw new TypeError('Each sample requires a distinct id and valid lossless AST');
    ids.add(item.id);
  }
}
function rootObjects(sample){
  const doc=sample.doc,root=doc.nodes[doc.rootId];
  if(root.kind==='object')return {ids:[root.id],excluded:0};
  if(root.kind!=='array')return {ids:[],excluded:1};
  const ids=[];let excluded=0;
  for(const id of root.children){if(doc.nodes[id].kind==='object')ids.push(id);else excluded++;}
  return {ids,excluded};
}
/**
 * Scope: one root array of object records OR explicit 2..6 related JSON samples.
 * Never calls JSON.parse on source or coerces numeric literals to Number.
 * Missing fields are counted relative to eligible object records only.
 */
export function analyzeSchemaDrift(samples,{maxFields=LIMITS.maxFields,maxObservations=LIMITS.maxObservations}={}){
  normalizeSamples(samples);
  if(!integer(maxFields,1,500)||!integer(maxObservations,1,500))throw new RangeError('Invalid report limits');
  const mode=samples.length===1?'array':'multi_sample';
  const records=[],columns=new Map();let excluded=0;
  for(const sample of samples){
    const selected=rootObjects(sample);
    excluded+=selected.excluded;
    for(const id of selected.ids){
      if(records.length>=LIMITS.maxRecords)throw new RangeError('RECORD_LIMIT');
      const doc=sample.doc,node=doc.nodes[id],recordIndex=records.length;
      records.push({sample,doc,id});
      for(const memberIndex of node.members){
        const member=doc.members[memberIndex];
        // JSON.stringify is used on a *key+occurrence tuple*, never on source JSON.
        const identity=JSON.stringify([member.key,member.occurrence]);
        let f=columns.get(identity);
        if(!f){
          f={key:member.key,occurrence:member.occurrence,present:0,nullCount:0,types:new Map(),
            lastRecord:-1,firstMissingIndex:null,firstEvidence:null,examples:new Map()};
          columns.set(identity,f);
        }
        if(f.lastRecord<recordIndex-1&&f.firstMissingIndex===null)f.firstMissingIndex=f.lastRecord+1;
        f.lastRecord=recordIndex;f.present++;
        const value=doc.nodes[member.valueId];
        if(value.kind==='null')f.nullCount++;
        f.types.set(value.kind,(f.types.get(value.kind)??0)+1);
        if(!f.examples.has(value.kind))f.examples.set(value.kind,reference(sample,doc,value.id,{member}));
        if(!f.firstEvidence)f.firstEvidence=reference(sample,doc,value.id,{member});
      }
    }
  }
  // Ordinary single-object documents are not represented as a statistical sample.
  const eligible=records.length;
  let totalObservations=0;
  const observations=[];
  const add=(ruleId,f,primary,detail={})=>{
    totalObservations++;
    if(observations.length>=maxObservations)return;
    observations.push({id:`drift-${totalObservations}`,ruleId,basis:'sample_observation',severity:'info',
      key:clip(f.key,NAME_LIMIT),keyTruncated:f.key.length>NAME_LIMIT,occurrence:f.occurrence,
      eligible,present:f.present,missing:eligible-f.present,nullCount:f.nullCount,
      types:Object.fromEntries(f.types),primary,related:[...f.examples.values()].slice(0,LIMITS.maxEvidence),...detail});
  };
  for(const f of columns.values()){
    if(f.lastRecord<eligible-1&&f.firstMissingIndex===null)f.firstMissingIndex=f.lastRecord+1;
    if(eligible<3)continue; // Explicitly informational distributions only for low sample sizes.
    if(f.types.size>1){
      const rarest=[...f.types.entries()].sort((a,b)=>a[1]-b[1])[0][0];
      add('SCHEMA.TYPE_VARIANCE',f,f.examples.get(rarest));
    }
    if(f.present>0&&f.present<eligible){
      const missing=records[f.firstMissingIndex];
      add('SCHEMA.MISSING_FIELD',f,reference(missing.sample,missing.doc,missing.id),{missingExample:true});
    }
    if(f.nullCount>0&&f.nullCount<f.present){
      add('SCHEMA.NULL_VARIANCE',f,f.examples.get('null'));
    }
  }
  const fields=[];
  for(const f of columns.values()){
    if(fields.length>=maxFields)break;
    fields.push({key:clip(f.key,NAME_LIMIT),keyTruncated:f.key.length>NAME_LIMIT,
      occurrence:f.occurrence,present:f.present,missing:eligible-f.present,
      nullCount:f.nullCount,types:Object.fromEntries(f.types),
      examples:[...f.examples.values()].slice(0,LIMITS.maxEvidence)});
  }
  return {mode,scope:samples.map(s=>({id:s.id})),eligibleRecords:eligible,excludedValues:excluded,
    totalFields:columns.size,retainedFields:fields.length,fieldsTruncated:fields.length<columns.size,
    fields,totalObservations,retainedObservations:observations.length,
    observationsTruncated:observations.length<totalObservations,observations,
    methodology:{minimumForObservations:3,denominator:'eligible_object_records',
      meaning:'Observed in supplied samples; not a validated API schema or confirmed bug.'}};
}
