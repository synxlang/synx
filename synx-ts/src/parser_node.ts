export enum ParserNodeKind {
    AnyChar,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    ByteSeq,
    PatternSet,
    ParserNodeKindEnd,
}

export type Quantifier = '?' | '*' | '+' | ' ';

/**
 * Range lower bound and upper bound: each is a single logical character, potentially composed of multiple UTF-16 code units (e.g., emoji).
 *
 * 范围下界与上界：各为一个逻辑字符，可能由多个 UTF-16 码元组成（如 emoji）。
 */
export interface CharMatchRange {
    kind: ParserNodeKind.CharMatchRange;
    start: string;
    end: string;
}

/**
 * Array of child nodes, or a string (indicating matching any logical character in the string, each character may consist of multiple code units).
 *
 * 子节点数组，或字符串（表示匹配串中任意逻辑字符，每个字符可由多个码元组成）。
 */
export interface CharMatchSet {
    kind: ParserNodeKind.CharMatchSet;
    sub_nodes: CharMatchNode[] | string;
}

/**
 * `literal`: non-empty string to match.
 * 
 * `literal`：待匹配的字符串。
 */
export interface ByteSeq {
  kind: ParserNodeKind.ByteSeq;
  literal: string;
}

/**
 * ============================== EN ==============================
 * `sub_nodes` — child sequence; `sub_quantifiers` — quantifier sequence, one entry per child in order.
 *
 * `sep` (when non-null):
 * - Separator node used to delimit the sub-node sequence; when `accept_trailing_sep` is true, a trailing separator at the end of the sequence is allowed.
 * - The separator applies between sub-nodes and in the gaps between successive matches of a sub-node whose quantifier is `*` or `+` (the repetition interval).
 * - Separator nodes appear in this sequence node's `seps` array; they do not appear in `value` or `raw_value`.
 *
 * `ignore` (when non-null): lowest priority. Ignore rules:
 * - Ignore is attempted only when a child match fails, or when the match succeeds but the quantified result is empty because of `?`, `*`, or `+`.
 * - Before the first sub-node;
 * - Between adjacent sub-nodes;
 * - Between two successive matches of a sub-node whose quantifier is `*` or `+` (i.e. the gap between repetitions of that child);
 * Text matched solely through `ignore` does not appear in this sequence node's `raw_value`.
 * When `raw` is true, `ignore` still participates in matching, but does not affect `value`.
 *
 * ============================== 中文 ==============================
 * `sub_nodes` 子节点序列，`sub_quantifiers` 量词序列依次对应子节点序列
 *
 * `sep` （非 null 时）：
 * - 分隔符节点，用于分隔子节点序列，`accept_trailing_sep` 为 true 时，允许序列末尾出现分隔符。
 * - 分隔符会作用于子节点间以及量词为 `*` 或 `+` 的子节点重复的间隔。
 * - sep 节点会出现在本序列节点的 `seps` 数组中，不会出现在 `value` 或 `raw_value` 中。
 *
 * `ignore`（非 null 时）：优先级最低，忽略规则如下：
 * - 只有当子节点匹配失败或者匹配成功但结果因量词（`?`、`*`、`+`）为空时，才会尝试忽略。
 * - 第一个子节点之前；
 * - 相邻子节点之间；
 * - 当某子节点量词为 `*` 或 `+` 时，该子节点连续两次匹配之间（即该子重复的间隔）;
 * 仅通过 `ignore` 匹配到的文本不会出现在本序列节点的 `raw_value` 中。
 * `raw` 为 true 时 `ignore` 还是会起匹配上的作用，但是不会影响 `value` 的值。
 *
 * `greedy_flags`（与 `sub_nodes` 等长）：`true` 表示该节点为贪婪匹配量词`*`, `+`, `?`。
 */
export interface PatternSeq {
    kind: ParserNodeKind.PatternSeq;
    sub_nodes: ParserNode[];
    sub_quantifiers: string;
    raw: boolean;
    sep: ParserNode | null;
    accept_trailing_sep: boolean;
    ignore: ParserNode | null;
    greedy_flags: boolean[];
}

/**
 * ============================== EN ==============================
 * `PatternSet`: ordered alternatives (try `sub_nodes` from left to right).
 *
 * Conventions:
 * - Parsing prefers the first alternative that matches.
 * - On success, this PatternSet is only appended into the winning AST node's `parser_nodes`.
 *
 * `neg_flags` (same length as `sub_nodes`): when `neg_flags[i]` is true, that alternative is negated.
 * If matching that alternative **succeeds**, the whole PatternSet fails (no further alternatives).
 * If it **fails**, behavior is the same as a non-negated failure: rewind `pos` and try the next alternative.
 *
 * Long infix chains: prefer `\sep` lists in synx, then resolve associativity in a later pass;
 * left-recursion limits and other authoring shapes: see `ParserImpl`'s JSDoc on
 * `pattern_set_node_parse_stack`.
 *
 * ============================== 中文 ==============================
 * `PatternSet`：有序分支（从左到右尝试 `sub_nodes`）。
 *
 * 约定：
 * - 解析时优先采用第一个匹配成功的分支。
 * - 成功时，本 `PatternSet` 只会被追加到胜出 AST 节点的 `parser_nodes` 中。
 *
 * `neg_flags`（与 `sub_nodes` 等长）：`true` 表示该分支为否定分支；若该分支**匹配成功**，
 * 则整棵 `PatternSet` 失败且不再尝试后续分支；若**匹配失败**，与非否定分支失败相同，回绕并尝试下一分支。
 *
 * 长中缀链：在 synx 中优先用 `\sep` 收列表，再结合性在后续阶段处理；左递归能力边界及其它写法见
 * `ParserImpl` 中 `pattern_set_node_parse_stack` 的 JSDoc。
 */
export interface PatternSet {
    kind: ParserNodeKind.PatternSet;
    sub_nodes: ParserNode[];
    neg_flags: boolean[];
}

/**
 * Matches any single Char (Unicode scalar or error code point). For `*` and `+` quantifiers, always non-greedy matching.
 *
 * 匹配任意单个字符（Unicode 标量值或错误码点）。对于`*`和`+`量词总是非贪婪匹配。
 */
export const AnyChar = { kind: ParserNodeKind.AnyChar } as const;

/**
 * Single character match node.
 *
 * 单字符匹配节点。
 */
export type CharMatchNode = CharMatchRange | CharMatchSet | typeof AnyChar;
export type ParserNode = CharMatchNode | PatternSeq | ByteSeq | PatternSet;

/**
 * All kinds that belong to CharMatchNode, used for branch checking to avoid hardcoding multiple kinds.
 *
 * 属于 CharMatchNode 的 kind 集合，用于分支判断，避免硬编码多种 kind。
 */
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
  raw: boolean = false,
  sep: ParserNode | null = null,
  accept_trailing_sep: boolean = false,
  ignore: ParserNode | null = null,
): PatternSeq {
  return {
    kind: ParserNodeKind.PatternSeq,
    sub_nodes,
    sub_quantifiers,
    raw,
    sep,
    accept_trailing_sep,
    ignore,
  };
}

/**
 * Builds a `ByteSeq`; throws if `literal` is empty.
 *
 * 构造 `ByteSeq`；若 `literal` 为空则抛出。
 */
export function mkByteSeq(literal: string): ByteSeq {
  if (literal.length === 0) {
    throw new Error("ByteSeq.literal must be non-empty");
  }
  return { kind: ParserNodeKind.ByteSeq, literal };
}

export function mkPatternSet(
  patterns: ParserNode[],
  neg_flags?: boolean[],
): PatternSet {
  const n = patterns.length;
  const flags = neg_flags ?? Array.from({ length: n }, () => false);
  if (flags.length !== n) {
    throw new Error("mkPatternSet: neg_flags length must match patterns length");
  }
  return {
    kind: ParserNodeKind.PatternSet,
    sub_nodes: patterns,
    neg_flags: flags,
  };
}
