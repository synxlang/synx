export enum ParserNodeKind {
    AnyChar,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    ParserNodeKindEnd,
}

export type Quantifier = '?' | '*' | '+' | ' ';

export interface CharMatchRange {
    kind: ParserNodeKind;
    /** Range lower bound: a single logical character, potentially composed of multiple UTF-16 code units (e.g., emoji) */
    start: string;
    /** Range upper bound: a single logical character, potentially composed of multiple UTF-16 code units (e.g., emoji) */
    end: string;
}

export interface CharMatchSet {
    kind: ParserNodeKind;
    /** Array of child nodes, or a string (indicating matching any logical character in the string, each character may consist of multiple code units) */
    sub_nodes: CharMatchNode[] | string;
}

export interface PatternSeq {
    kind: ParserNodeKind;
    sub_nodes: ParserNode[];
    sub_quantifiers: string;  // one char per sub_node: ' ' | '?' | '*' | '+'
    flat:boolean;
}

export const AnyChar = {kind: ParserNodeKind.AnyChar};

export type CharMatchNode = CharMatchRange | CharMatchSet | typeof AnyChar;
export type ParserNode = CharMatchNode | PatternSeq;

/** All kinds that belong to CharMatchNode, used for branch checking to avoid hardcoding multiple kinds */
export const CHAR_MATCH_NODE_KINDS: ParserNodeKind[] = [
    ParserNodeKind.AnyChar,
    ParserNodeKind.CharMatchRange,
    ParserNodeKind.CharMatchSet,
];









export function mkCharRange(start: string, end: string): CharMatchRange {
  return { kind: ParserNodeKind.CharMatchRange, start, end };
}

export function mkCharSet(chars: string): CharMatchSet;
export function mkCharSet(nodes: CharMatchNode[]): CharMatchSet;
export function mkCharSet(
  chars_or_nodes: string | CharMatchNode[],
): CharMatchSet {
  if (typeof chars_or_nodes === 'string') {
    return { kind: ParserNodeKind.CharMatchSet, sub_nodes: chars_or_nodes };
  }
  return { kind: ParserNodeKind.CharMatchSet, sub_nodes: chars_or_nodes };
}

export function mkPatternSeq(sub_nodes: ParserNode[], sub_quantifiers: string, flat: boolean = false): PatternSeq {
  return { kind: ParserNodeKind.PatternSeq, sub_nodes, sub_quantifiers, flat };
}

