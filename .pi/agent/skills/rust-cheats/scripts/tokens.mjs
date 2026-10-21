import { countTokens as o200k } from 'gpt-tokenizer/encoding/o200k_base';
import { countTokens as cl100k } from 'gpt-tokenizer/encoding/cl100k_base';

// Text only: no tool envelopes, chat framing, system prompts, or output reserve.
// These encodings are reproducible proxies, not every provider's tokenizer.
export const TOKENIZER = 'gpt-tokenizer@4.1.0';
export function tokenCounts(text) {
  return { o200k_base: o200k(text), cl100k_base: cl100k(text) };
}
