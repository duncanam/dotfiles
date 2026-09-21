import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';

export function clean(text) {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '').replace(/\t/g, '  ');
}

export function jsonLines(stream, receive, fail, maxBytes = 8 * 1024 * 1024) {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  stream.on('data', (chunk) => {
    try {
      buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      let pos;
      while ((pos = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, pos).replace(/\r$/, '');
        buffer = buffer.slice(pos + 1);
        if (Buffer.byteLength(line) > maxBytes) throw new Error('JSONL frame too large');
        if (line) receive(JSON.parse(line));
      }
      if (Buffer.byteLength(buffer) > maxBytes) throw new Error('JSONL frame too large');
    } catch (error) { fail(error); }
  });
}
export function send(stream, data) {
  if (stream.destroyed || !stream.writable) throw new Error('Worker connection closed');
  if (stream.writableLength > 8 * 1024 * 1024) throw new Error('Worker connection backpressure limit exceeded');
  stream.write(JSON.stringify(data) + '\n');
}
