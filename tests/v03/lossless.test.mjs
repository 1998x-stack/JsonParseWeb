import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLossless, tokenize, significantLexemes, formatLossless,
  pointerFor, resolvePointer, PointerFault, buildLineIndex, locate,
  decodeUtf8, parseUtf8,
} from '../../packages/json-core/index.mjs';

const valid = [
  'false','true','null','0','-0','""','[]','{}',
  '[-0,1.00,1e+9999,1e-9999,9007199254740993]',
  '{"a":1,"a":2}', '{"a":1,"\\u0061":2}',
  '{"a/b":{"m~n":[1,true,null]},"":2}',
  '{"__proto__":{"constructor":"safe"}}',
  '{"\\uD800":"\\uDC00","astral":"𠀀","\\n":"\\t"}',
  '\r\n { "a": [ 0 , {"b" : "z"} ] } \r\n',
  '"<img src=x onerror=alert(1)>"',
];
const invalid = [
  ['','EMPTY_INPUT'],[' ','EMPTY_INPUT'],['01','LEADING_ZERO'],['-01','LEADING_ZERO'],
  ['1.','INVALID_NUMBER'],['-','INVALID_NUMBER'],['1e+','INVALID_NUMBER'],
  ['[1,]','TRAILING_COMMA'],['{"x":1,}','TRAILING_COMMA'],
  ['{"x":01}','LEADING_ZERO'],['{x:1}','INVALID_TOKEN'],
  ['{"x" 1}','SYNTAX_ERROR'],['{"x":}','SYNTAX_ERROR'],
  ['[1 2]','SYNTAX_ERROR'],['// hi\n{}','INVALID_TOKEN'],
  ['NaN','INVALID_TOKEN'],['Infinity','INVALID_TOKEN'],
  ['true false','TRAILING_DATA'],['{"x":"bad\nline"}','UNESCAPED_CONTROL'],
  ['"\\q"','INVALID_ESCAPE'],['"\\u123Z"','INVALID_UNICODE_ESCAPE'],
  ['"hello','UNCLOSED_STRING'],['[','SYNTAX_ERROR'],
];
for (const s of valid) test(`valid and roundtrip: ${s.slice(0,45)}`, () => {
  const result = parseLossless(s);
  assert.equal(result.ok,true,JSON.stringify(result.error));
  const formatted = formatLossless(result);
  assert.deepEqual(significantLexemes(formatted), significantLexemes(s));
  assert.equal(formatLossless(parseLossless(formatted)), formatted);
  assert.equal(result.stats.nodes, result.nodes.length);
  assert.equal(result.stats.total_keys,result.members.length);
  assert.ok(result.nodes.every(node => s.slice(node.start,node.end).length>0));
});
for (const [s, code] of invalid) test(`invalid ${code}: ${JSON.stringify(s)}`, () => {
  const result = parseLossless(s);
  assert.equal(result.ok,false);
  assert.equal(result.error.code, code);
  assert.ok(result.error.line>=1 && result.error.column>=1);
});
test('source spans are UTF-16 and preserved across emoji and CRLF',()=>{
  const source='\r\n{"emoji":"😀","n":1.00}';
  const doc=parseLossless(source);
  assert.equal(doc.ok,true);
  assert.equal(source.slice(doc.nodes[2].start,doc.nodes[2].end),'1.00');
  assert.equal(doc.nodes[2].rawNumber,'1.00');
  const loc=locate(buildLineIndex(source),doc.nodes[2].start);
  assert.equal(loc.line,2);
  assert.equal(loc.column,19);
});
test('decoded duplicate keys retained as ordered members and warnings',()=>{
  const doc=parseLossless('{"a":1,"\\u0061":2}');
  assert.equal(doc.ok,true);
  assert.deepEqual(doc.members.map(m=>m.key),['a','a']);
  assert.deepEqual(doc.members.map(m=>m.occurrence),[0,1]);
  assert.equal(doc.diagnostics[0].code,'DUPLICATE_KEY');
  assert.equal(doc.stats.duplicate_keys,1);
  assert.throws(()=>pointerFor(doc,doc.members[0].valueId), e=>e.code==='AMBIGUOUS_MEMBER');
  assert.throws(()=>resolvePointer(doc,'/a'), e=>e.code==='AMBIGUOUS_MEMBER');
  assert.equal(parseLossless('{"a":1,"a":2}',{duplicate:'error'}).error.code,'DUPLICATE_KEY');
});
test('source pointer and empty keys and escaping',()=>{
  const d=parseLossless('{"a/b":{"m~n":[1,true,null]},"":2}');
  const n=resolvePointer(d,'/a~1b/m~0n/1');
  assert.equal(d.nodes[n].kind,'boolean');
  assert.equal(pointerFor(d,n),'/a~1b/m~0n/1');
  assert.equal(pointerFor(d,resolvePointer(d,'/')),'/');
  assert.equal(pointerFor(d,d.rootId),'');
  for(const x of ['/a~2b','noslash','/a~']) assert.throws(()=>resolvePointer(d,x));
  assert.throws(()=>resolvePointer(d,'/a~1b/m~0n/01'), e=>e.code==='NOT_FOUND');
});
test('prototype-looking names are stored as ordinary members',()=>{
  const d=parseLossless('{"__proto__":{"constructor":1}}');
  assert.equal(d.ok,true);
  assert.equal(d.members[0].key,'__proto__');
  assert.equal(d.members[1].key,'constructor');
  assert.equal({}.constructor,Object); // sanity check: no pollution
});
test('nested source spans include full container',()=>{
  const source=' {"a": [1, {"b":false}]} ';
  const d=parseLossless(source);
  assert.equal(source.slice(d.nodes[0].start,d.nodes[0].end),'{"a": [1, {"b":false}]}');
  assert.equal(source.slice(d.nodes[2].start,d.nodes[2].end),'1');
  assert.equal(source.slice(d.nodes[3].start,d.nodes[3].end),'{"b":false}');
});
test('independent byte, node, key, depth and token bounds',()=>{
  assert.equal(parseLossless('"中"',{bytes:4}).error.code,'SIZE_LIMIT');
  assert.equal(parseLossless('[1,2,3]',{nodes:3}).error.code,'NODE_LIMIT');
  assert.equal(parseLossless('{"a":1,"b":2}',{keys:1}).error.code,'KEY_LIMIT');
  assert.equal(parseLossless('[[[0]]]',{depth:3}).error.code,'DEPTH_LIMIT');
  assert.equal(parseLossless('"foobar"',{tokenChars:4}).error.code,'TOKEN_LIMIT');
});
test('massive numeric magnitude valid and preserved',()=>{
  const source='{"a":1e99999,"b":-0,"c":1.000000000000000000001}';
  const d=parseLossless(source);
  assert.equal(d.ok,true);
  assert.deepEqual(d.nodes.filter(n=>n.kind==='number').map(n=>n.rawNumber), ['1e99999','-0','1.000000000000000000001']);
  assert.match(formatLossless(d),/1e99999/);
});
test('strict UTF-8 file decoding',()=>{
  const data=new Uint8Array([0x7b,0x7d]);
  assert.equal(decodeUtf8(data).source,'{}');
  assert.equal(parseUtf8(data).ok,true);
  const invalidUtf8 = parseUtf8(new Uint8Array([0xc3,0x28]));
  assert.equal(invalidUtf8.error.code,'INVALID_UTF8');
  const bom=new Uint8Array([0xef,0xbb,0xbf,0x7b,0x7d]);
  assert.equal(parseUtf8(bom).error.code,'BOM_DISALLOWED');
  const d=parseUtf8(bom,{bom:'strip'});
  assert.equal(d.ok,true); assert.equal(d.diagnostics[0].code,'BOM_STRIPPED');
});
test('tokenizer lexical range extraction and keys',()=>{
  const s='{"a": -12.5e-2, "b": "hello\\n"}';
  const toks=tokenize(s);
  assert.deepEqual(toks.map(t=>t.kind), ['{','string',':','number',',','string',':','string','}']);
  assert.deepEqual(toks.filter(t=>t.kind==='number').map(t=>s.slice(t.start,t.end)),['-12.5e-2']);
});
test('whitespace formatter preserves quoted spaces, special chars, duplicate order',()=>{
  const s=' { "x" : "a b \\" c" , "x" : 1.00 } ';
  const d=parseLossless(s);
  assert.equal(d.ok,true);
  const formatted=formatLossless(d,{indent:4});
  assert.deepEqual(significantLexemes(formatted),significantLexemes(s));
  assert.match(formatted,/"x": "a b/);
  assert.equal(formatLossless(parseLossless(formatted),{indent:4}),formatted);
});
test('cross-check valid subset with JSON.parse, including key multiplicity aware exceptions',()=>{
  for(const s of valid) assert.doesNotThrow(()=>JSON.parse(s));
  for(const [s] of invalid) assert.throws(()=>JSON.parse(s));
});
// Deterministic bounded corpus with no external random or CI network dependency.
test('generated grammar corpus and lossless formatting',()=>{
  let seed=0x9e3779b9;
  const rand=()=> {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const scalar=()=>['null','true','false','-0','1.00','1e+9000','"中\uD83D\uDE00"','"\\u0061"'][rand()%8];
  const value=(depth=0)=>{
    if(depth>3 || rand()%3===0) return scalar();
    if(rand()%2===0) return '['+Array.from({length:rand()%5},()=>value(depth+1)).join(',')+']';
    return '{'+Array.from({length:rand()%4}, (_,i)=>JSON.stringify('k'+i)+':'+value(depth+1)).join(',')+'}';
  };
  for(let i=0;i<500;i++) {
    const source=value();
    const parsed=parseLossless(source);
    assert.equal(parsed.ok,true,source+' '+parsed.error?.message);
    const form=formatLossless(parsed);
    assert.deepEqual(significantLexemes(source),significantLexemes(form));
    assert.equal(formatLossless(parseLossless(form)),form);
  }
});
test('unpaired escaped surrogate accepted with warning, raw lone surrogate rejected',()=>{
  const escaped = parseLossless('"\\uD800"');
  assert.equal(escaped.ok,true);
  assert.equal(escaped.diagnostics[0].code,'UNPAIRED_SURROGATE');
  const raw = parseLossless('"\uD800"');
  assert.equal(raw.ok,false);
  assert.equal(raw.error.code,'INVALID_UNICODE_SCALAR');
});
test('diagnostic cap does not alter exact duplicate counts',()=>{
  const source = '{' + Array.from({length:15},(_,i)=>'"a":'+i).join(',') + '}';
  const d=parseLossless(source,{diagnostics:3});
  assert.equal(d.ok,true);assert.equal(d.diagnostics.length,3);assert.equal(d.stats.duplicate_keys,14);
});
test('pointer ambiguity on ancestor also rejects otherwise unique descendant',()=>{
  const d=parseLossless('{"a":{"x":1},"a":{"y":2}}');
  assert.equal(d.ok,true);
  const leaf = d.members.find(m=>m.key==='y').valueId;
  assert.throws(()=>pointerFor(d,leaf),e=>e.code==='AMBIGUOUS_MEMBER');
  assert.throws(()=>resolvePointer(d,'/a/y'),e=>e.code==='AMBIGUOUS_MEMBER');
});

test('file bytes rejected before decoding oversized buffer',()=>{
  const r=parseUtf8(new Uint8Array(100),{bytes:10});
  assert.equal(r.ok,false);
  assert.equal(r.error.code,'SIZE_LIMIT');
});
test('large boundary: 100000 nodes accepted; 100001 rejected',()=>{
  const valid='[' + Array(99_999).fill('0').join(',') + ']';
  const accepted=parseLossless(valid);
  assert.equal(accepted.ok,true);assert.equal(accepted.stats.nodes,100_000);
  const rejected=parseLossless('[' + Array(100_000).fill('0').join(',') + ']');
  assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'NODE_LIMIT');
});
test('large boundary: 50000 object member keys accepted; 50001 rejected',()=>{
  const build=n=>'{' + Array(n).fill('"a":0').join(',') + '}';
  const accepted=parseLossless(build(50_000));
  assert.equal(accepted.ok,true);assert.equal(accepted.stats.total_keys,50_000);
  const rejected=parseLossless(build(50_001));
  assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'KEY_LIMIT');
});
