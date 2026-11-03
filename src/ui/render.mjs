/** DOM-safe output: data always enters through textContent, never innerHTML. */
const el = (tag, className = '', text = undefined) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const kind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const clip = v => v.length > 220 ? `${v.slice(0, 220)}…` : v;

export function renderRaw(target, source) {
  target.replaceChildren(el('pre', 'raw-output', source));
}

export function renderTree(target, data, maxVisible = 2500) {
  let visible = 0;
  function node(value, label, depth) {
    if (++visible > maxVisible) return el('div', 'truncated', `已限制渲染 ${maxVisible} 个节点；请缩小数据范围。`);
    const type = kind(value);
    const row = el('div', 'tree-row');
    if (type === 'array' || type === 'object') {
      const details = el('details', 'tree-group');
      // Keep only the root opened by default, so large documents avoid expanded layout cost.
      details.open = depth === 0;
      const summary = el('summary');
      if (label !== null) summary.append(el('span', 'tree-key', `${label}: `));
      const size = type === 'array' ? value.length : Object.keys(value).length;
      summary.append(el('span', 'tree-kind', `${type === 'array' ? 'Array' : 'Object'} (${size})`));
      details.append(summary);
      if (depth <= 128) {
        const entries = type === 'array' ? value.map((v, i) => [i, v]) : Object.entries(value);
        for (const [key, child] of entries) {
          if (visible >= maxVisible) { details.append(el('div', 'truncated', `显示上限：${maxVisible} 个节点`)); break; }
          details.append(node(child, String(key), depth + 1));
        }
      }
      row.append(details);
    } else {
      if (label !== null) row.append(el('span', 'tree-key', `${label}: `));
      row.append(el('span', `tree-${type}`, type === 'string' ? `"${clip(value)}"` : String(value)));
    }
    return row;
  }
  target.replaceChildren(node(data, null, 0));
  return visible;
}

export function renderTable(target, data, maxRows = 500) {
  if (!Array.isArray(data)) {
    target.replaceChildren(el('p', 'muted', '表格视图支持顶层 JSON 数组。'));
    return;
  }
  if (!data.length) { target.replaceChildren(el('p', 'muted', '数组为空。')); return; }
  const flatObjects = data.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  const primitive = data.every(item => item === null || typeof item !== 'object');
  if (!flatObjects && !primitive) {
    target.replaceChildren(el('p', 'muted', '混合数组或嵌套数组请使用树形视图。'));
    return;
  }
  const keys = flatObjects ? [...new Set(data.flatMap(Object.keys))] : ['Value'];
  if (keys.length > 100) { target.replaceChildren(el('p', 'muted', '超过 100 列，请改用树形视图。')); return; }
  const wrap = el('div', 'table-scroll');
  const table = el('table', 'data-table'), thead = el('thead'), head = el('tr');
  for (const key of keys) head.append(el('th', '', key));
  thead.append(head); table.append(thead);
  const tbody = el('tbody');
  for (const item of data.slice(0, maxRows)) {
    const tr = el('tr');
    for (const key of keys) {
      const value = flatObjects ? item[key] : item;
      tr.append(el('td', '', value === undefined ? '' : (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value))));
    }
    tbody.append(tr);
  }
  table.append(tbody); wrap.append(table);
  target.replaceChildren(wrap);
  if (data.length > maxRows) target.append(el('p', 'muted', `只展示前 ${maxRows} / ${data.length} 行。`));
}
