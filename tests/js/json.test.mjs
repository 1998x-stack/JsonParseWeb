import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument, statistics, inspectNumbers, prettyPrint} from '../../src/core/json.mjs';

for (const [source, expected] of [['false', false], ['0', 0], ['null', null], ['""', ''], ['[]', []], ['{}', {}], ['true', true]]) {
  test(`valid top-level ${source}`, () => { const r = parseDocument(source); assert.equal(r.ok, true); assert.deepEqual(r.data, expected); });
}
test('boolean is not number', () => {
  const r = parseDocument('{"ok":true,"n":1,"no":false}');
  assert.equal(r.stats.data_types.boolean, 2);
  assert.equal(r.stats.data_types.number, 1);
  assert.equal(r.stats.total_keys, 3);
});
test('count nested arrays and objects', () => {
  const r = parseDocument('{"items":[{"a":1},{"b":null}]}');
  assert.deepEqual([r.stats.object_count,r.stats.array_count,r.stats.max_depth,r.stats.total_keys], [3,1,4,3]);
});
test('invalid JSON returns diagnostic', () => { const r = parseDocument('{broken'); assert.equal(r.ok, false); assert.ok(r.error); });
test('empty returns diagnostic', () => assert.equal(parseDocument('  ').ok, false));
test('input byte cap', () => assert.match(parseDocument('"hello"',{bytes:2,depth:128,keys:50000,nodes:100000}).error,/字节/));
test('depth limit', () => assert.equal(parseDocument('[[1]]',{bytes:100,depth:2,keys:5,nodes:5}).ok,false));
test('node limit', () => assert.equal(parseDocument('[1,2,3]',{bytes:100,depth:10,keys:20,nodes:3}).ok,false));
test('long integers are warned and formatting blocked', () => {
  const r=parseDocument('{"id":9007199254740993}');
  assert.equal(r.ok,true); assert.equal(r.warnings[0].code,'UNSAFE_INTEGER');
  assert.throws(()=>prettyPrint(r));
});
test('long digit sequence in quoted string is not a warning',()=>assert.deepEqual(inspectNumbers('{"v":"9007199254740993"}'),[]));
test('formatting valid document',()=>assert.equal(prettyPrint(parseDocument('{"a":1}')),'{\n  "a": 1\n}'));
test('unicode size uses UTF-8 bytes',()=>assert.equal(parseDocument('"中"').stats.size_bytes,5));

test('overflow exponent rejects nonfinite value',()=>assert.equal(parseDocument('1e999').ok,false));
