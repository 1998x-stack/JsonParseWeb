import {JsonFault} from './diagnostics.mjs';

export const LIMITS = Object.freeze({
  bytes: 2 * 1024 * 1024, depth: 128, keys: 50_000,
  nodes: 100_000, tokenChars: 1024 * 1024, diagnostics: 100,
});
const isDigit = c => c >= '0' && c <= '9';
const isDigit19 = c => c >= '1' && c <= '9';
const isHex = c => /[0-9A-Fa-f]/.test(c);
const punctuation = Object.freeze({'{':'{','}':'}','[':'[',']':']',':':':',',':','});
const whitespace = c => c === ' ' || c === '\t' || c === '\r' || c === '\n';

/** Streaming, strict RFC 8259 tokenizer. Does not convert numeric tokens to Number. */
export class JsonTokenizer {
  constructor(source, options = {}) {
    this.source = source;
    this.limit = options.tokenChars ?? LIMITS.tokenChars;
    this.pos = 0;
  }
  next() {
    const s = this.source, n = s.length;
    while (this.pos < n && whitespace(s[this.pos])) this.pos++;
    const start = this.pos;
    if (start === n) return {kind: 'eof', start, end: start};
    const c = s[start];
    if (punctuation[c]) {this.pos++; return {kind: punctuation[c], start, end: this.pos};}
    if (c === '"') return this.#string();
    if (c === '-' || isDigit(c)) return this.#number();
    for (const [text, kind] of [['true','true'],['false','false'],['null','null']]) {
      if (s.startsWith(text, start)) {
        this.pos += text.length;
        return {kind, start, end: this.pos};
      }
    }
    throw new JsonFault('INVALID_TOKEN', '无效的 JSON Token', start, start + 1);
  }
  #string() {
    const s = this.source, n = s.length, start = this.pos++;
    while (this.pos < n) {
      const i = this.pos, c = s[i];
      if (c === '"') {
        this.pos++;
        if (this.pos-start > this.limit) throw new JsonFault('TOKEN_LIMIT', '单个 Token 超过长度限制',start,this.pos);
        return {kind: 'string', start, end: this.pos};
      }
      if (c.charCodeAt(0) < 0x20) throw new JsonFault('UNESCAPED_CONTROL', 'JSON 字符串中包含未转义的控制字符', i, i + 1);
      const code = c.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdbff) {
        const nextCode = s.charCodeAt(i + 1);
        if (!(nextCode >= 0xdc00 && nextCode <= 0xdfff)) throw new JsonFault('INVALID_UNICODE_SCALAR', 'JSON 源文本包含不成对的 UTF-16 代理项',i,i+1);
        this.pos += 2;
        if (this.pos-start > this.limit) throw new JsonFault('TOKEN_LIMIT','单个 Token 超过长度限制',start,this.pos);
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) throw new JsonFault('INVALID_UNICODE_SCALAR', 'JSON 源文本包含不成对的 UTF-16 代理项',i,i+1);
      if (c === '\\') {
        this.pos++;
        if (this.pos >= n) throw new JsonFault('INVALID_ESCAPE', '未闭合的 JSON 转义', i, n);
        const e = s[this.pos];
        if ('"\\/bfnrt'.includes(e)) this.pos++;
        else if (e === 'u') {
          for (let j = 1; j <= 4; j++) {
            const p = this.pos + j;
            if (p >= n || !isHex(s[p])) throw new JsonFault('INVALID_UNICODE_ESCAPE', 'JSON Unicode 转义必须有四个十六进制字符', i, Math.min(n, p + 1));
          }
          this.pos += 5;
        } else throw new JsonFault('INVALID_ESCAPE', '不支持的 JSON 转义字符', i, this.pos + 1);
      } else this.pos++;
      if (this.pos - start > this.limit) throw new JsonFault('TOKEN_LIMIT', '单个 Token 超过长度限制', start, this.pos);
    }
    throw new JsonFault('UNCLOSED_STRING', 'JSON 字符串缺少结束引号', start, n);
  }
  #number() {
    const s = this.source, n = s.length, start = this.pos;
    let i = start;
    if (s[i] === '-') i++;
    if (i === n) throw new JsonFault('INVALID_NUMBER', '数字缺少整数部分', start, i);
    if (s[i] === '0') {
      i++;
      if (i < n && isDigit(s[i])) throw new JsonFault('LEADING_ZERO', 'JSON 数字不能包含前导零', start, i + 1);
    } else if (isDigit19(s[i])) {
      do {i++;} while (i < n && isDigit(s[i]));
    } else throw new JsonFault('INVALID_NUMBER', '数字缺少整数部分', start, i + 1);
    if (s[i] === '.') {
      i++;
      if (i === n || !isDigit(s[i])) throw new JsonFault('INVALID_NUMBER', '小数点后至少需要一位数字', start, i);
      do {i++;} while (i < n && isDigit(s[i]));
    }
    if (s[i] === 'e' || s[i] === 'E') {
      i++;
      if (s[i] === '+' || s[i] === '-') i++;
      if (i === n || !isDigit(s[i])) throw new JsonFault('INVALID_NUMBER', '指数部分缺少数字', start, i);
      do {i++;} while (i < n && isDigit(s[i]));
    }
    if (i - start > this.limit) throw new JsonFault('TOKEN_LIMIT', '数字 Token 超过长度限制', start, i);
    this.pos = i;
    return {kind: 'number', start, end: i};
  }
}

export function tokenize(source, options = {}) {
  const scanner = new JsonTokenizer(source, options), out = [];
  while (true) {
    const token = scanner.next();
    if (token.kind === 'eof') return out;
    out.push(token);
    if (out.length > (options.maxTokens ?? LIMITS.nodes * 5))
      throw new JsonFault('TOKEN_COUNT_LIMIT', 'Token 数量超过限制', token.start, token.end);
  }
}

export function significantLexemes(source) {
  return tokenize(source).map(t => source.slice(t.start, t.end));
}
