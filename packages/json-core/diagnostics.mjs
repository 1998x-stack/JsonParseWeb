/** Location and bounded errors for the strict JSON grammar. All offsets are UTF-16 units. */
export class JsonFault extends Error {
  constructor(code, message, start, end = start) {
    super(message);
    this.name = 'JsonFault'; this.code = code;
    this.start = start; this.end = end;
  }
}

/** CRLF counts as a single line break; CR and LF alone are also line breaks. */
export function buildLineIndex(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\r') {
      if (source[i + 1] === '\n') i++;
      starts.push(i + 1);
    } else if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

export function locate(lineStarts, offset) {
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError('Invalid source offset');
  let lo = 0, hi = lineStarts.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid;
  }
  return {line: lo + 1, column: offset - lineStarts[lo] + 1};
}
export function diagnostic(fault, lineStarts) {
  const {line, column} = locate(lineStarts, fault.start);
  return {code: fault.code, severity: 'error', message: fault.message,
    span: {start: fault.start, end: fault.end}, line, column};
}
