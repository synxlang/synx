export enum ParserNodeKind {
    AnyChar,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    /** Fixed literal substring in the parse input, modeled as a binary string (raw bytes). */
    ByteSeq,
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
 * ============================== EN ==============================
 * `ByteSeq`: match a fixed contiguous literal in the parse input, treated as a **binary string** (sequence
 * of raw bytes). `pos` / `range` refer to **byte offsets and lengths** in that model. Implementation uses
 * `String.prototype.startsWith` / `slice` on `ParserInput.src` with the same offset arithmetic; authors
 * should supply `src` and `literal` as binary-safe payloads (e.g. one char per byte) when matching raw bytes.
 * Same convenience role as a `PatternSeq` of single-byte steps, but shorter to author (keywords, delimiters).
 *
 * ============================== 中文 ==============================
 * `ByteSeq`：在解析输入中匹配固定连续字面量；输入与字面量均按**二进制串**（字节序列）理解，`pos` / `range`
 * 表示**字节**偏移与跨度。实现上仍用 `startsWith` / `slice` 与当前 `pos` 做比较与截取；作者应保证 `src` 与
 * `literal` 在需要匹配原始字节时按字节安全方式存放（例如一字节一码元）。作用类似把逐字节写成 `PatternSeq`，
 * 但更便于书写关键字、分隔符等。
 */
export interface ByteSeq {
  kind: ParserNodeKind.ByteSeq;
  /** Non-empty binary substring to match (raw bytes; `string` holds them in this layer). */
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
 */
export interface PatternSeq {
    kind: ParserNodeKind.PatternSeq;
    sub_nodes: ParserNode[];
    sub_quantifiers: string;
    raw: boolean;
    sep: ParserNode | null;
    accept_trailing_sep: boolean;
    ignore: ParserNode | null;
}

/**
 * ============================== EN ==============================
 * `PatternSet`: ordered alternatives (try `patterns` from left to right).
 *
 * Conventions:
 * - Parsing prefers the first alternative that matches.
 * - On success, this PatternSet is only appended into the winning AST node's `parser_nodes`.
 *
 * Long infix chains: prefer `\sep` lists in synx, then resolve associativity in a later pass;
 * left-recursion limits and other authoring shapes: see `ParserImpl`'s JSDoc on
 * `pattern_set_node_parse_stack`.
 *
 * ============================== 中文 ==============================
 * `PatternSet`：有序分支（从左到右尝试 `patterns`）。
 *
 * 约定：
 * - 解析时优先采用第一个匹配成功的分支。
 * - 成功时，本 `PatternSet` 只会被追加到胜出 AST 节点的 `parser_nodes` 中。
 *
 * 长中缀链：在 synx 中优先用 `\sep` 收列表，再结合性在后续阶段处理；左递归能力边界及其它写法见
 * `ParserImpl` 中 `pattern_set_node_parse_stack` 的 JSDoc。
 */
export interface PatternSet {
    kind: ParserNodeKind.PatternSet;
    patterns: ParserNode[];
}

/** Matches any single Char (Unicode scalar or error code point). */
export const AnyChar = { kind: ParserNodeKind.AnyChar } as const;

// single character match node
export type CharMatchNode = CharMatchRange | CharMatchSet | typeof AnyChar;
export type ParserNode = CharMatchNode | PatternSeq | ByteSeq | PatternSet;

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

/** Builds a `ByteSeq`; throws if `literal` is empty. */
export function mkByteSeq(literal: string): ByteSeq {
  if (literal.length === 0) {
    throw new Error("ByteSeq.literal must be non-empty");
  }
  return { kind: ParserNodeKind.ByteSeq, literal };
}

export function mkPatternSet(patterns: ParserNode[]): PatternSet {
  return { kind: ParserNodeKind.PatternSet, patterns };
}

