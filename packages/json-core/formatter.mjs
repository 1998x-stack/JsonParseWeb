import {JsonTokenizer} from './tokenizer.mjs';
/** Formats JSON by rewriting ONLY insignificant whitespace, preserving exact raw tokens. */
export function formatLossless(document, options={}) {
  if (!document?.ok) throw new TypeError('仅可格式化有效的 JSON 文档');
  const unit = options.indent === '\t' ? '\t' : ' '.repeat(options.indent ?? 2);
  if (unit !== '\t' && (unit.length > 8 || unit.length < 1)) throw new RangeError('缩进宽度必须为 1–8 或制表符');
  const maxBytes = options.maxOutputBytes ?? 16 * 1024 * 1024;
  const scanner = new JsonTokenizer(document.source);
  let tokens = [], t;
  do {t = scanner.next(); if (t.kind !== 'eof') tokens.push(t);} while(t.kind !== 'eof');
  let out = '', depth = 0;
  const stack = [];
  const pad = () => '\n' + unit.repeat(depth);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], next = tokens[i+1], raw = document.source.slice(token.start,token.end);
    switch(token.kind) {
      case '{': case '[': {
        const empty = next?.kind === (token.kind === '{' ? '}' : ']');
        out += raw; stack.push(empty);
        if (!empty) {depth++; out += pad();}
        break;
      }
      case '}': case ']': {
        const empty = stack.pop();
        if (!empty) {depth--; out += pad();}
        out += raw; break;
      }
      case ',': out += ',' + pad(); break;
      case ':': out += ': '; break;
      default: out += raw;
    }
    if (out.length > maxBytes) throw new RangeError('格式化结果超过输出大小限制');
  }
  return out;
}
