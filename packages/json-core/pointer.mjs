/** RFC 6901 JSON Pointer paths; duplicate object names are intentionally ambiguous. */
export class PointerFault extends Error {
  constructor(code, message) {super(message); this.code=code; this.name='PointerFault';}
}
const encode = text => text.replaceAll('~','~0').replaceAll('/','~1');
const decode = segment => {
  if (/~(?![01])/.test(segment)) throw new PointerFault('INVALID_POINTER', 'JSON Pointer 包含非法 ~ 转义');
  return segment.replaceAll('~1','/').replaceAll('~0','~');
};
function assertDoc(doc) {if (!doc?.ok) throw new PointerFault('INVALID_DOCUMENT', '不能查询无效的文档');}
export function pointerFor(doc, nodeId) {
  assertDoc(doc);
  let node = doc.nodes[nodeId];
  if (!node) throw new PointerFault('INVALID_NODE', '节点不存在');
  const parts = [];
  while (node.parentId !== null) {
    const parent = doc.nodes[node.parentId], edge = node.edge;
    if (edge.kind === 'array') parts.push(String(edge.index));
    else {
      const member = doc.members[edge.memberIndex];
      if (parent.memberLookup.get(member.key) !== node.id)
        throw new PointerFault('AMBIGUOUS_MEMBER', '重复对象属性无法生成唯一 JSON Pointer');
      parts.push(encode(member.key));
    }
    node = parent;
  }
  return parts.reverse().map(p=>`/${p}`).join('');
}
export function resolvePointer(doc, pointer) {
  assertDoc(doc);
  if (pointer === '') return doc.rootId;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new PointerFault('INVALID_POINTER', 'JSON Pointer 必须以 / 开头或为空');
  let node = doc.nodes[doc.rootId];
  for (const raw of pointer.slice(1).split('/')) {
    const key = decode(raw);
    if (node.kind === 'object') {
      if (!node.memberLookup.has(key)) throw new PointerFault('NOT_FOUND', '路径不存在');
      const valueId = node.memberLookup.get(key);
      if (valueId === null) throw new PointerFault('AMBIGUOUS_MEMBER', 'JSON Pointer 指向重复属性');
      node = doc.nodes[valueId];
    } else if (node.kind === 'array') {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) throw new PointerFault('NOT_FOUND', '数组索引不是合法的非负整数');
      const n = Number(key);
      if (!Number.isSafeInteger(n) || n >= node.children.length) throw new PointerFault('NOT_FOUND', '数组索引超出范围');
      node = doc.nodes[node.children[n]];
    } else throw new PointerFault('NOT_FOUND', '无法从标量节点继续导航');
  }
  return node.id;
}
