"""Pure-Python JSON processing. Independent of Django, disk and network."""
import json
import math
from typing import Any

MAX_BYTES = 2 * 1024 * 1024
MAX_DEPTH = 128
MAX_KEYS = 50_000
MAX_NODES = 100_000

class JSONDocumentError(ValueError):
    def __init__(self, code: str, message: str, *, line=None, column=None):
        super().__init__(message)
        self.code, self.line, self.column = code, line, column


def _reject_constant(token: str):
    raise JSONDocumentError('INVALID_NUMBER', f'JSON 不允许 {token}')


def _object_pairs(pairs: list[tuple[str, Any]]) -> dict:
    # Explicit, auditable policy instead of silently overwriting duplicate keys.
    result = {}
    for key, value in pairs:
        if key in result:
            raise JSONDocumentError('DUPLICATE_KEY', f'重复键：{key[:80]}')
        result[key] = value
    return result


def analyze(value: Any, *, max_depth=MAX_DEPTH, max_keys=MAX_KEYS, max_nodes=MAX_NODES) -> dict:
    counts = {'string': 0, 'number': 0, 'boolean': 0, 'null': 0, 'array': 0, 'object': 0}
    keys = depth_max = arrays = objects = nodes = 0
    stack = [(value, 1)]
    while stack:
        node, depth = stack.pop()
        nodes += 1
        if nodes > max_nodes:
            raise JSONDocumentError('NODE_LIMIT', '节点总数超过限制')
        if depth > max_depth:
            raise JSONDocumentError('DEPTH_LIMIT', '层级深度超过限制')
        depth_max = max(depth_max, depth)
        if node is None:
            counts['null'] += 1
        elif isinstance(node, bool):
            counts['boolean'] += 1
        elif isinstance(node, (int, float)):
            if isinstance(node, float) and not math.isfinite(node):
                raise JSONDocumentError('INVALID_NUMBER', 'JSON 数值超过有限浮点数范围')
            counts['number'] += 1
        elif isinstance(node, str):
            counts['string'] += 1
        elif isinstance(node, list):
            counts['array'] += 1
            arrays += 1
            for child in reversed(node):
                stack.append((child, depth + 1))
        elif isinstance(node, dict):
            counts['object'] += 1
            objects += 1
            keys += len(node)
            if keys > max_keys:
                raise JSONDocumentError('KEY_LIMIT', '属性总数超过限制')
            for child in reversed(list(node.values())):
                stack.append((child, depth + 1))
        else:
            raise JSONDocumentError('INVALID_TYPE', '不支持的数据类型')
    return {
        'total_keys': keys, 'max_depth': depth_max, 'array_count': arrays,
        'object_count': objects, 'nodes': nodes, 'data_types': counts,
    }


def parse_document(source: str) -> dict:
    if not isinstance(source, str):
        raise JSONDocumentError('INVALID_INPUT', '输入必须是 JSON 文本')
    size = len(source.encode('utf-8'))
    if size > MAX_BYTES:
        raise JSONDocumentError('SIZE_LIMIT', f'输入不得超过 {MAX_BYTES} 字节')
    if not source.strip():
        raise JSONDocumentError('EMPTY_INPUT', '请输入 JSON 数据')
    try:
        data = json.loads(source, parse_constant=_reject_constant, object_pairs_hook=_object_pairs)
    except json.JSONDecodeError as exc:
        raise JSONDocumentError('INVALID_JSON', exc.msg, line=exc.lineno, column=exc.colno) from exc
    except RecursionError as exc:
        raise JSONDocumentError('DEPTH_LIMIT', 'JSON 嵌套过深') from exc
    stats = analyze(data)
    stats['size_bytes'] = size
    return {'data': data, 'analysis': stats}
