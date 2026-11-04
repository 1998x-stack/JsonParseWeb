import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEvidenceReport,serializeEvidenceReport} from '../../src/product/evidence-report.mjs';
import {parseLossless} from '../../packages/json-core/parser.mjs';
import {inspectDocument} from '../../packages/json-core/findings.mjs';
import {analyzeSchemaDrift} from '../../packages/json-core/schema-drift.mjs';

const sensitive='{"apiSecret":"PRIVATE_VALUE_abc123","recordId":9007199254740993,"recordId":2}';
const parsed=parseLossless(sensitive);
const issues=inspectDocument(parsed);
const inspection={total:issues.total,truncated:issues.truncated,rules:issues.rules};
const make=(detailed=false,drift=null, source=sensitive)=>buildEvidenceReport({findings:issues.findings,inspection,source,drift,includeDetails:detailed});

test('default report redacts source, keys, pointers, exact number and opaque values',()=>{
 const result=make(); const json=serializeEvidenceReport(result);
 for(const needle of ['PRIVATE_VALUE_abc123','apiSecret','recordId','9007199254740993','/recordId','"rawExcerpt"','"pointer"','"nodeId"','"filename"'])
   assert.equal(json.includes(needle),false,needle);
 assert.equal(result.inspection.total,2);
 assert.deepEqual(result.inspection.items.map(x=>x.ruleId),['JSON.UNSAFE_INTEGER','JSON.DUPLICATE_KEY']);
 assert.equal(result.privacyMode,'redacted');
 assert.equal(result.inspection.rules.length,2);
 assert.match(json,/No finding means no issue detected/);
});
test('explicit detailed report preserves source offsets and source lexeme but never full document',()=>{
 const result=make(true);const text=serializeEvidenceReport(result);
 assert.match(text,/9007199254740993/);
 assert.match(text,/recordId/);
 assert.equal(text.includes('PRIVATE_VALUE_abc123'),false);
 assert.equal(result.privacyMode,'review-required');
 assert.equal(result.inspection.items[0].evidence.rawExcerpt,'9007199254740993');
 assert.equal(result.inspection.items[1].evidence.pointer,null);
});
test('detailed report refuses stale/out-of-bounds evidence spans',()=>{
 assert.throws(()=>make(true,null,'{}'),/Evidence span/);
 assert.doesNotThrow(()=>make(false,null,'{}')); // safe mode needs no source slices
});
test('default drift report contains only counts and rule labels, never field names or sample values',()=>{
 const source='[{"secret_field":"CONFIDENTIAL_ABC"},{"secret_field":null},{}]';
 const doc=parseLossless(source);const report=analyzeSchemaDrift([{id:'current',doc}]);
 const result=buildEvidenceReport({findings:[],inspection:{total:0},source,
   drift:{report:{...report,runId:1},observations:report.observations}});
 const json=serializeEvidenceReport(result,'json');
 for(const secret of ['secret_field','CONFIDENTIAL_ABC','"pointer"','"field"','"sampleId"'])
   assert.equal(json.includes(secret),false,secret);
 assert.equal(result.schemaDrift.eligibleRecords,3);
 assert.equal(result.schemaDrift.items.length,3);
 assert.equal(result.schemaDrift.totalObservations,3);
});
test('detailed drift metadata discloses fields on explicit opt-in only',()=>{
 const source='[{"private_key":1},{"private_key":"a"},{}]';
 const doc=parseLossless(source);const drift=analyzeSchemaDrift([{id:'current',doc}]);
 const result=buildEvidenceReport({findings:[],inspection:{total:0},source,
   drift:{report:drift,observations:drift.observations},includeDetails:true});
 const out=serializeEvidenceReport(result,'markdown');
 assert.match(out,/private\\_key/);assert.match(out,/reviewed export only/);
 assert.equal(out.includes('"a"'),false); // drift sample values stay in source
});
test('Markdown special characters are escaped for optional pointer and JSON text',()=>{
 const source='{"<secret> [x] *":9007199254740993}';
 const doc=parseLossless(source);const findings=inspectDocument(doc).findings;
 const report=buildEvidenceReport({source,inspection:{total:1},findings,includeDetails:true});
 const markdown=serializeEvidenceReport(report,'markdown');
 assert.match(markdown,/\\</);assert.match(markdown,/\\\[/);assert.match(markdown,/\\\*/);
 assert.ok(!markdown.includes('<script>'));
});
test('bounded inputs and invalid formats are explicitly rejected',()=>{
 assert.throws(()=>serializeEvidenceReport(make(), 'html'),/Unsupported/);
 assert.throws(()=>buildEvidenceReport({findings:Array(101).fill(issues.findings[0])}),/budget/);
 assert.throws(()=>buildEvidenceReport({findings:[],source:null}),/string/);
});
test('truncation is explicit and safe report has no accidental non-allowlisted properties',()=>{
 const result=buildEvidenceReport({source:sensitive,findings:issues.findings.slice(0,1),inspection:{total:30,truncated:true}});
 assert.equal(result.inspection.total,30);assert.equal(result.inspection.retained,1);assert.equal(result.inspection.truncated,true);
 assert.deepEqual(Object.keys(result.inspection.items[0]),['ruleId','severity','basis']);
});
