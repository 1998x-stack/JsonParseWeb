import {parseLossless} from './parser.mjs';
import {LIMITS} from './tokenizer.mjs';
import {JsonFault} from './diagnostics.mjs';
/** Fatal UTF-8 decoding: malformed bytes must not be silently replaced. */
export function decodeUtf8(bytes, {bom='reject', bytes: maxBytes=LIMITS.bytes} = {}) {
  if (!(bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)) throw new TypeError('输入必须是 Uint8Array 或 ArrayBuffer');
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength > maxBytes) throw new JsonFault('SIZE_LIMIT', `文件不得超过 ${maxBytes} 字节`, 0,0);
  const hasBom = view.length >= 3 && view[0]===0xef && view[1]===0xbb && view[2]===0xbf;
  if (hasBom && bom === 'reject') throw new JsonFault('BOM_DISALLOWED', '检测到 UTF-8 BOM，请使用显式 BOM 兼容策略',0,1);
  if (bom !== 'reject' && bom !== 'strip') throw new RangeError('未知 BOM 策略');
  let source;
  try {source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(view);}
  catch (_) {throw new JsonFault('INVALID_UTF8','输入包含无效 UTF-8 字节',0,0);}
  // TextDecoder removes a BOM by default. Treat that explicitly, not silently.
  return {source, bomStripped:hasBom};
}
export function parseUtf8(bytes, opts = {}) {
  try {
    const {source,bomStripped} = decodeUtf8(bytes,opts);
    const result = parseLossless(source,opts);
    if(result.ok && bomStripped) result.diagnostics.unshift({code:'BOM_STRIPPED',severity:'warning',message:'已根据显式策略去除 UTF-8 BOM',span:{start:0,end:0},line:1,column:1});
    return result;
  } catch (error) {
    if (!(error instanceof JsonFault)) throw error;
    return {ok:false,validSyntax:false,error:{code:error.code,message:error.message,span:{start:error.start,end:error.end},line:1,column:1},diagnostics:[]};
  }
}
