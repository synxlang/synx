export enum ParserNodeKind {
    AnyChar,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    /** Fixed UTF-16 substring to match (e.g. quoted strings in synx). */
    CharSeq,
    PatternSet,
    ParserNodeKindEnd,
}

export type Quantifier = '?' | '*' | '+' | ' ';

export interface CharMatchRange {
    kind: ParserNodeKind.CharMatchRange;
    /** Range lower bound: a single logical character, potentially composed of multiple UTF-16 code units (e.g., emoji) */
    start: string;
    /** Range upper bound: a single logical character, potentially composed of multiple UTF-16 code units (e.g., emoji) */
    end: string;
}

export interface CharMatchSet {
    kind: ParserNodeKind.CharMatchSet;
    /** Array of child nodes, or a string (indicating matching any logical character in the string, each character may consist of multiple code units) */
    sub_nodes: CharMatchNode[] | string;
}

/**
 * Ordered sequence of `sub_nodes` with per-child quantifiers in `sub_quantifiers`.
 *
 * `ignore` (when non-null): extra pattern consumed for layout only; it MUST NOT apply
 * before the first sub-node or after the last one. It applies only:
 * - between consecutive sub-nodes, and
 * - between successive matches of the same sub-node when its quantifier is `*` or `+`
 *   (i.e. inter-repetition gaps for that child).
 * Text matched solely via `ignore` is not represented in this sequence node's `raw_value`.
 * Must be `null` when `flat` is true.
 */
export interface PatternSeq {
    kind: ParserNodeKind.PatternSeq;
    sub_nodes: ParserNode[];
    sub_quantifiers: string;  // one char per sub_node: ' ' | '?' | '*' | '+'
    flat: boolean;
    ignore: ParserNode | null;
}

/**
 * Literal run to match with `startsWith`: same intent as a PatternSeq of successive character matches, but shorter to author.
 */
export interface CharSeq {
    kind: ParserNodeKind.CharSeq;
    /** Matched text as a contiguous substring; must be non-empty. */
    literal: string;
}

/**
 * PatternSet: ordered alternatives (try `patterns` from left to right).
 *
 * Conventions:
 * - Parsing prefers the first alternative that matches.
 * - On success, this PatternSet is only appended into the winning AST node's `parser_nodes`.
 */
export interface PatternSet {
    kind: ParserNodeKind.PatternSet;
    patterns: ParserNode[];
}

export const AnyChar = { kind: ParserNodeKind.AnyChar } as const;

export type CharMatchNode = CharMatchRange | CharMatchSet | typeof AnyChar;
export type ParserNode = CharMatchNode | PatternSeq | CharSeq | PatternSet;

/** All kinds that belong to CharMatchNode, used for branch checking to avoid hardcoding multiple kinds */
export const CHAR_MATCH_NODE_KINDS: ParserNodeKind[] = [
    ParserNodeKind.AnyChar,
    ParserNodeKind.CharMatchRange,
    ParserNodeKind.CharMatchSet,
];









export function mkCharRange(start: string, end: string): CharMatchRange {
  return { kind: ParserNodeKind.CharMatchRange, start, end };
}

export function mkCharSet(
  chars_or_nodes: string | CharMatchNode[],
): CharMatchSet {
  return { kind: ParserNodeKind.CharMatchSet, sub_nodes: chars_or_nodes };
}

export function mkPatternSeq(
  sub_nodes: ParserNode[],
  sub_quantifiers: string,
  flat: boolean = false,
  ignore: ParserNode | null = null,
): PatternSeq {
  return { kind: ParserNodeKind.PatternSeq, sub_nodes, sub_quantifiers, flat, ignore };
}

/** Builds a CharSeq; throws if `literal` is empty. */
export function mkCharSeq(literal: string): CharSeq {
  if (literal.length === 0) {
    throw new Error("CharSeq.literal must be non-empty");
  }
  return { kind: ParserNodeKind.CharSeq, literal };
}

export function mkPatternSet(patterns: ParserNode[]): PatternSet {
  return { kind: ParserNodeKind.PatternSet, patterns };
}

