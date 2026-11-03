/** Worker-owned preorder index of the nodes that are currently visible.
 *
 * AST identifiers are stable for one parsed document. Row positions are stable
 * only within one tree epoch. This structure never depends on DOM state.
 */
export class TreeIndexError extends Error {
  constructor(code, message) { super(message); this.name = 'TreeIndexError'; this.code = code; }
}

const error = (code, message) => new TreeIndexError(code, message);
const validId = id => Number.isSafeInteger(id) && id >= 0;

export class VisibleTreeIndex {
  constructor(doc, {expandRoot = false} = {}) {
    if (!doc?.ok || !Array.isArray(doc.nodes) || !validId(doc.rootId))
      throw error('INVALID_DOCUMENT', '需要有效的 JSON AST');
    this.doc = doc;
    this.epoch = 0;
    this.expanded = new Set();
    if (expandRoot && this.#childCount(doc.rootId) > 0) this.expanded.add(doc.rootId);
    this.visibleIds = [];
    this.#appendVisible(doc.rootId, this.visibleIds);
  }

  get totalVisible() { return this.visibleIds.length; }

  #node(id) {
    if (!validId(id) || id >= this.doc.nodes.length)
      throw error('INVALID_NODE', '目标节点不存在');
    return this.doc.nodes[id];
  }

  #childIds(id) {
    const node = this.#node(id);
    if (node.kind === 'array') return node.children;
    if (node.kind === 'object') return node.members.map(idx => this.doc.members[idx].valueId);
    return [];
  }

  #childCount(id) {
    const node = this.#node(id);
    return node.kind === 'array' ? node.children.length : node.kind === 'object' ? node.members.length : 0;
  }

  // Iterative DFS: avoids recursion even for deeply nested data.
  #appendVisible(id, output) {
    const stack = [id];
    while (stack.length) {
      const nodeId = stack.pop();
      output.push(nodeId);
      if (this.expanded.has(nodeId)) {
        const children = this.#childIds(nodeId);
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
    }
  }

  #checkEpoch(expectedEpoch) {
    if (!validId(expectedEpoch) || expectedEpoch !== this.epoch)
      throw error('TREE_EPOCH_CONFLICT', '树展开状态已变化，请获取最新树状态');
  }

  snapshot() {
    return {epoch: this.epoch, totalVisible: this.totalVisible, rootId: this.doc.rootId};
  }

  rowIndex(id) { return this.visibleIds.indexOf(this.#node(id).id); }
  isExpanded(id) { this.#node(id); return this.expanded.has(id); }

  /** Preserve already-expanded descendants when their parent is collapsed. */
  setExpanded(nodeId, expanded, expectedEpoch) {
    this.#checkEpoch(expectedEpoch);
    const node = this.#node(nodeId);
    if (typeof expanded !== 'boolean') throw error('INVALID_EXPANSION', 'expanded 必须是布尔值');
    if (node.kind !== 'array' && node.kind !== 'object')
      throw error('NOT_CONTAINER', '标量节点不能展开');
    const rowIndex = this.rowIndex(nodeId);
    if (rowIndex < 0) throw error('NODE_NOT_VISIBLE', '请先展开目标节点的祖先');
    if (this.#childCount(nodeId) === 0 || this.expanded.has(nodeId) === expanded)
      return {...this.snapshot(), rowIndex, changed: false};

    if (expanded) {
      this.expanded.add(nodeId);
      const inserted = [];
      for (const childId of this.#childIds(nodeId)) this.#appendVisible(childId, inserted);
      // Never spread a 100k-element array into one call (argument-limit crash).
      const chunkSize = 4096;
      for (let end = inserted.length; end > 0; end -= chunkSize) {
        const start = Math.max(0, end - chunkSize);
        this.visibleIds.splice(rowIndex + 1, 0, ...inserted.slice(start, end));
      }
    } else {
      this.expanded.delete(nodeId);
      let end = rowIndex + 1;
      while (end < this.totalVisible && this.doc.nodes[this.visibleIds[end]].depth > node.depth) end++;
      this.visibleIds.splice(rowIndex + 1, end - rowIndex - 1);
    }
    this.epoch++;
    return {...this.snapshot(), rowIndex, changed: true};
  }

  /** Reveal target and its ancestors atomically, bumping epoch just once. */
  reveal(nodeId, expectedEpoch) {
    this.#checkEpoch(expectedEpoch);
    const node = this.#node(nodeId);
    const ancestors = [];
    let parentId = node.parentId;
    while (parentId !== null) {
      ancestors.push(parentId);
      parentId = this.#node(parentId).parentId;
    }
    let changed = false;
    for (const id of ancestors) {
      if (this.#childCount(id) > 0 && !this.expanded.has(id)) {
        this.expanded.add(id);
        changed = true;
      }
    }
    if (changed) {
      this.visibleIds = [];
      this.#appendVisible(this.doc.rootId, this.visibleIds);
      this.epoch++;
    }
    const rowIndex = this.rowIndex(nodeId);
    if (rowIndex < 0) throw error('INDEX_INVARIANT', '目标节点未能显示');
    return {...this.snapshot(), nodeId, rowIndex, changed};
  }

  getWindow(epoch, offset, limit) {
    this.#checkEpoch(epoch);
    if (!validId(offset) || offset > this.totalVisible || !validId(limit) || limit < 1 || limit > 120)
      throw error('INVALID_WINDOW', '窗口范围必须有效，单次最多 120 行');
    return {...this.snapshot(), offset, ids: this.visibleIds.slice(offset, offset + limit)};
  }
}
