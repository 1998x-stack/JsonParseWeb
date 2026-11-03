import pytest
from server.processor.service import parse_document, analyze, JSONDocumentError, MAX_BYTES

@pytest.mark.parametrize('source,expected', [('false',False),('0',0),('null',None),('""',''),('[]',[]),('{}',{}),('true',True)])
def test_root_values(source, expected):
    assert parse_document(source)['data'] == expected

def test_boolean_count():
    r = parse_document('{"ok":true,"n":1,"no":false}')
    assert r['analysis']['data_types']['boolean'] == 2
    assert r['analysis']['data_types']['number'] == 1

def test_structural_stats():
    result = parse_document('{"items":[{"a":1},{"b":null}]}')['analysis']
    assert (result['total_keys'],result['array_count'],result['object_count'],result['max_depth']) == (3,1,3,4)

@pytest.mark.parametrize('source,code', [('','EMPTY_INPUT'), ('{"a":1, "a":2}','DUPLICATE_KEY'), ('{"a":NaN}','INVALID_NUMBER'), ('{"bad":}','INVALID_JSON')])
def test_invalid_inputs(source,code):
    with pytest.raises(JSONDocumentError) as exc:
        parse_document(source)
    assert exc.value.code == code

def test_depth_limit():
    with pytest.raises(JSONDocumentError) as exc:
        analyze([[[0]]],max_depth=3)
    assert exc.value.code == 'DEPTH_LIMIT'

def test_size_limit():
    with pytest.raises(JSONDocumentError) as exc:
        parse_document('"' + 'a'*(MAX_BYTES+1) + '"')
    assert exc.value.code == 'SIZE_LIMIT'

def test_exact_integer_preserved_in_python():
    assert parse_document('9007199254740993')['data'] == 9007199254740993

def test_overflow_exponent():
    with pytest.raises(JSONDocumentError) as exc:
        parse_document('1e999')
    assert exc.value.code == 'INVALID_NUMBER'
