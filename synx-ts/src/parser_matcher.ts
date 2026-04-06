import { CharMatchRange, CharMatchSet, CharMatchNode, ParserNodeKind, AnyChar } from './parser_node';

export {
  ParserNodeKind,
  mkCharRange,
  mkCharSet,
  mkPatternSeq,
} from './parser_node';
export type { CharMatchNode } from './parser_node';

export interface CharMatchSetResult {
  /** Matched nodes, ordered from child to parent */
  nodes: CharMatchNode[];
  /** Position after this match */
  new_pos: number;
}

/** Check if the code point at pos in src falls within the [start, end] range (by code point), returns whether matched and the new_pos after matching */
export function matchCharRange(
  src: string,
  pos: number,
  start: string,
  end: string,
): { matched: boolean; new_pos: number } {
  const cp = src.codePointAt(pos);
  if (cp === undefined) return { matched: false, new_pos: pos };
  const length = cp > 0xffff ? 2 : 1;
  const startCp = start.codePointAt(0);
  const endCp = end.codePointAt(0);
  if (startCp !== undefined && endCp !== undefined && cp >= startCp && cp <= endCp) {
    return { matched: true, new_pos: pos + length };
  }
  return { matched: false, new_pos: pos };
}

function charsOfCharMatchString(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i);
    if (cp === undefined) break;
    const len = cp > 0xffff ? 2 : 1;
    out.push(s.slice(i, i + len));
    i += len;
  }
  return out;
}

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;

/** Match one Char (Unicode scalar or error code point); returns whether matched and new_pos. */
export function matchAnyChar(
  src: string,
  pos: number,
): { matched: boolean; new_pos: number } {
  if (pos >= src.length) return { matched: false, new_pos: pos };
  const c0 = src.charCodeAt(pos);
  if (c0 >= HIGH_SURROGATE_MIN && c0 <= HIGH_SURROGATE_MAX) {
    const c1 = pos + 1 < src.length ? src.charCodeAt(pos + 1) : 0;
    if (c1 >= LOW_SURROGATE_MIN && c1 <= LOW_SURROGATE_MAX) {
      return { matched: true, new_pos: pos + 2 };
    }
  }
  return { matched: true, new_pos: pos + 1 };
}

/** Match a single character at pos in src using match_set (by code point, may be 1 or 2 code units), returns the list of matched nodes (from child to parent) */
export function matchChar(src: string, pos: number, match_set: CharMatchSet): CharMatchSetResult {
  const cp = src.codePointAt(pos);
  if (cp === undefined) {
    return { nodes: [], new_pos: pos };
  }
  const length = cp > 0xffff ? 2 : 1;
  const char = src.slice(pos, pos + length);
  const nodes: CharMatchNode[] = [];

  if (typeof match_set.sub_nodes === 'string') {
    const setChars = charsOfCharMatchString(match_set.sub_nodes);
    if (setChars.includes(char)) {
      nodes.push(match_set);
      return { nodes, new_pos: pos + length };
    }
    return { nodes, new_pos: pos };
  }

  for (const item of match_set.sub_nodes) {
    if (item.kind === ParserNodeKind.AnyChar) {
      const anyCharResult = matchAnyChar(src, pos);
      if (anyCharResult.matched) {
        nodes.push(AnyChar);
        nodes.push(match_set);
        return { nodes, new_pos: anyCharResult.new_pos };
      }
    } else if (item.kind === ParserNodeKind.CharMatchRange) {
      const range = item as CharMatchRange;
      const rangeResult = matchCharRange(src, pos, range.start, range.end);
      if (rangeResult.matched) {
        nodes.push(range);
        nodes.push(match_set);
        return { nodes, new_pos: rangeResult.new_pos };
      }
    } else {
      const nested_set = item as CharMatchSet;
      const nested_result = matchChar(src, pos, nested_set);
      if (nested_result.nodes.length > 0) {
        nodes.push(...nested_result.nodes);
        nodes.push(match_set);
        return { nodes, new_pos: nested_result.new_pos };
      }
    }
  }

  return { nodes, new_pos: pos };
}

