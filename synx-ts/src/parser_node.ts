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
 * `sub_nodes` — ordered child sequence; `sub_quantifiers` — quantifier sequence, one entry per child in order.
 *
 * `ignore` (when non-null): ignore rules:
 * - Ignore is attempted only when a child match fails, or when the match succeeds but the quantified result is empty because of `?`, `*`, or `+`.
 * - Before the first sub-node;
 * - Between consecutive sub-nodes;
 * - Between successive matches of a sub-node whose quantifier is `*` or `+` (i.e. gaps between repetitions of that child);
 * Text matched solely through `ignore` is not represented in this sequence node's `raw_value`.
 * When `flat` is true, `ignore` still participates in matching, but does not affect the sequence node's `value`.
 *
 * `sub_nodes` 子节点序列，`sub_quantifiers` 量词序列依次对应子节点序列
 *
 * `ignore`（非 null 时）：忽略规则如下：
 * - 只有当子节点匹配失败或者匹配成功但结果因量词（`?`、`*`、`+`）为空时，才会尝试忽略。
 * - 第一个子节点之前；
 * - 相邻子节点之间；
 * - 当某子节点量词为 `*` 或 `+` 时，该子节点连续两次匹配之间（即该子重复的间隔）;
 * 仅通过 `ignore` 匹配到的文本不会出现在本序列节点的 `raw_value` 中。
 * `flat` 为 true 时 `ignore` 还是会起匹配上的作用，但是不会影响 `value` 的值。
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

