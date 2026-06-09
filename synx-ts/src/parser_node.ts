export enum ParserNodeKind {
    AnyChar,
    CharMatchRange,
    CharMatchSet,
    PatternSeq,
    CharSeq,
    PatternSet,
    ParserNodeKindEnd,
}

export type Quantifier = ' '| '?' | '*' | '+';
type ParserNodePairInput = [ParserNode, ParserNode] | string | null;

/**
 * Range lower bound and upper bound: each is a single logical character, potentially composed of multiple UTF-16 code units (e.g., emoji). Must not be empty.
 *
 * 范围下界与上界：各为一个逻辑字符，可能由多个 UTF-16 码元组成（如 emoji）。不可为空。
 */
export interface CharMatchRange {
    kind: ParserNodeKind.CharMatchRange;
    name: string;
    start: string;
    end: string;
}

/**
 * Array of child nodes, or a string (indicating matching any logical character in the string, each character may consist of multiple code units). Must not be empty.
 *
 * 子节点数组，或字符串（表示匹配串中任意逻辑字符，每个字符可由多个码元组成）。不可为空。
 */
export interface CharMatchSet {
    kind: ParserNodeKind.CharMatchSet;
    name: string;
    sub_nodes: CharMatchNode[] | string;
}

/**
 * `literal`: non-empty string to match. Must not be empty.
 * 
 * `literal`：待匹配的字符串。不可为空。
 */
export interface CharSeq {
  kind: ParserNodeKind.CharSeq;
  name: string;
  literal: string;
}

/**
 * ============================== EN ==============================
 *
 * `sub_nodes` — child sequence; `sub_quantifiers` — quantifier sequence, one entry per child in order. Must not be empty (at least one sub-node).
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
 * When `raw` is true, `value` is the original matched source text for the sequence body; `raw_value` remains the structured child payload.
 * 
 * `greedy_flags` (same length as `sub_nodes`): `true` means greedy semantics for `*` / `+` / `?` on that slot.
 * Normalization (via {@link completePatternSeq}): {@link AnyChar} with `*` or `+` **must** be non-greedy; quantifier `' '` (single mandatory match) **must** be greedy; both override conflicting explicit `greedy_flags`.
 *
 * `enclosure` (when non-null): boundary pair corresponding to `\enclosedby`, requiring that the input matched by `sep` and the right closing delimiter do not overlap; otherwise the result is undefined.
 *
 * `sub_node_bindings` (when non-null, same length as `sub_nodes`): binding names for child parse results.
 * A non-null entry binds the corresponding child AST value into this PatternSeq's local context.
 * Duplicate binding names are not allowed in the same scope.
 *
 * `sub_node_isolated_scope_flags` (when non-null, same length as `sub_nodes`): controls whether each child
 * parses in an isolated binding scope.
 *
 * Referenced child nodes parse in isolated scope; inplace child nodes parse in non-isolated scope.
 * For example, `Wrapper=(pair:Pair)=>[.pair=pair]` cannot see bindings created inside `Pair`,
 * while `Wrapper=((left:Symbol, ":", right:Symbol))=>[.left=left, .right=right]` can see
 * `left` and `right` because the child node is inplace.
 *
 * `assignment_map` (when non-null):
 * - A string assigns the corresponding context variable directly to AST `value`, e.g. `=>comment` makes `value = comment`.
 * - A Map maps AST `value` keys to names in the parse context.
 *   For each entry, `value[key]` is assigned from the corresponding context variable; keys absent from the map are not assigned.
 * `raw_value` is not affected by binding-related rules.
 *
 * ============================== 中文 ==============================
 *
 * `sub_nodes` 为子节点序列；`sub_quantifiers` 为量词序列，与子节点序列逐项对应。不可为空（至少一个子节点）。
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
 * `raw` 为 true 时，`value` 是序列主体匹配到的原始源文本；`raw_value` 仍是结构化的子节点结果。
 *
 * `greedy_flags`（与 `sub_nodes` 等长）：`true` 表示该子槽量词 `*` / `+` / `?` 按贪婪语义解析。
 * 规范化（由 {@link completePatternSeq} 施加）：{@link AnyChar} 且量词为 `*` 或 `+` 时**必须**为非贪婪；量词为 `' '`（单次必配）的槽**必须**为贪婪；二者均覆盖与之冲突的显式 `greedy_flags`。
 *
 * `enclosure`（非 null 时）：对应 `\enclosedby` 的边界对，要求sep和右闭合符匹配到的输入没有交集，否则结果未定义。
 *
 * `sub_node_bindings`（非 null 时，与 `sub_nodes` 等长）：子节点解析结果的绑定名。
 * 非 null 项会把对应子节点 AST 的 value 绑定到当前 PatternSeq 的局部上下文。
 * 同一作用域中不允许出现同名变量。
 *
 * `sub_node_isolated_scope_flags`（非 null 时，与 `sub_nodes` 等长）：控制每个子节点是否在独立作用域中解析。
 *
 * 引用的子节点使用独立作用域；原地的子节点使用非独立作用域。
 * 例如 `Wrapper=(pair:Pair)=>[.pair=pair]` 看不到 `Pair` 内部创建的绑定；
 * 而 `Wrapper=((left:Symbol, ":", right:Symbol))=>[.left=left, .right=right]`
 * 可以看到 `left`、`right`，因为该子节点是原地的。
 *
 * `assignment_map`（非 null 时）：
 * - string 会把对应上下文变量直接赋值给 AST `value`，例如 `=>comment` 使 `value = comment`。
 * - Map 会将 AST `value` 的 key 映射到上下文变量名。
 *   对每个映射项，`value[key]` 会从对应上下文变量赋值；map 中不存在的 key 不会被赋值。
 * `raw_value` 不受 binding 相关规则影响。
 */
export interface PatternSeq {
    kind: ParserNodeKind.PatternSeq;
    name: string;
    sub_nodes: ParserNode[];
    sub_quantifiers: string;
    raw: boolean;
    sep: ParserNode | null;
    accept_trailing_sep: boolean;
    ignore: ParserNode | null;
    greedy_flags: boolean[];
    enclosure: [ParserNode, ParserNode] | null;
    sub_node_bindings: (string | null)[] | null;
    sub_node_isolated_scope_flags: boolean[] | null;
    assignment_map: Map<string, string> | string | null;
}

/**
 * ============================== EN ==============================
 *
 * `PatternSet`: ordered alternatives (try `sub_nodes` from left to right). Must not be empty (at least one alternative).
 *
 * Conventions:
 * - Parsing prefers the first alternative that matches.
 * - On success, this PatternSet is only appended into the winning AST node's `parser_nodes`.
 *
 * `neg_flags` (same length as `sub_nodes`): when `neg_flags[i]` is true, that alternative is negated.
 * If that alternative **matches successfully**, the whole PatternSet fails and no later alternatives are tried.
 * If it **fails**, behavior is the same as a non-negated failure:
 * rewind `pos` and try the next alternative.
 *
 * `charset_flag`: marks that this PatternSet should be interpreted as a general character set.
 * This corresponds to `GeneralCharSet` in `synx.synx`: normal alternatives are charset members,
 * while negated alternatives are rejecting patterns for the set.
 * When this flag is true, the PatternSet is handled with the same character-matching contract as `CharMatchSet`.
 *
 * Long infix chains: in synx, prefer collecting lists with `\sep`, then handle associativity in a later phase.
 * For left-recursion limits and other authoring shapes, see the JSDoc for
 * `pattern_set_node_parse_stack` in `ParserImpl`.
 *
 * `associateby` (when non-null): boundary pair corresponding to `\associateby`.
 * It is similar to `PatternSeq.enclosure`, but may match zero or more pairs around the selected alternative
 * and has the lowest matching priority.
 * Only PatternSet nodes whose `charset_flag` is false may have `associateby`.
 *
 * `ignore` (when non-null, only valid when `associateby` is also non-null): lowest priority.
 * Only applies to the `associateby` delimiters — it is used when matching the left and right boundary
 * nodes of `associateby`, with the same semantics as `PatternSeq.ignore`.
 *
 * ============================== 中文 ==============================
 *
 * `PatternSet`：有序分支（从左到右尝试 `sub_nodes`）。不可为空（至少一个分支）。
 *
 * 约定：
 * - 解析时优先采用第一个匹配成功的分支。
 * - 成功时，本 `PatternSet` 只会被追加到胜出 AST 节点的 `parser_nodes` 中。
 *
 * `neg_flags`（与 `sub_nodes` 等长）：`true` 表示该分支为否定分支。
 * 若该分支**匹配成功**，则整棵 `PatternSet` 失败且不再尝试后续分支。
 * 若**匹配失败**，与非否定分支失败相同：
 * 回绕并尝试下一分支。
 *
 * `charset_flag`：标记该 PatternSet 应按通用字符集解释。
 * 这对应 `synx.synx` 中的 `GeneralCharSet`：普通分支为字符集成员，
 * 否定分支为该集合的拒绝模式。
 * 当该标记为 true 时，PatternSet 按与 `CharMatchSet` 相同的字符匹配契约处理。
 *
 * 长中缀链：在 synx 中优先用 `\sep` 收列表，再结合性在后续阶段处理。
 * 左递归能力边界及其它写法见
 * `ParserImpl` 中 `pattern_set_node_parse_stack` 的 JSDoc。
 *
 * `associateby`（非 null 时）：对应 `\associateby` 的边界对。
 * 它类似于 `PatternSeq.enclosure`，但允许在选中的分支外匹配 0 个或多个边界对，
 * 且匹配优先级最低。
 * 只有 `charset_flag` 为 false 的 PatternSet 可以拥有 `associateby`。
 *
 * `ignore`（非 null 时，仅在 `associateby` 也非 null 时有效）：优先级最低。
 * 仅对 `associateby` 的边界符生效——在匹配 `associateby` 的左右边界节点时使用，
 * 语义与 `PatternSeq.ignore` 相同。
 */
export interface PatternSet {
    kind: ParserNodeKind.PatternSet;
    name: string;
    sub_nodes: ParserNode[];
    neg_flags: boolean[];
    charset_flag: boolean;
    associateby: [ParserNode, ParserNode] | null;
    ignore: ParserNode | null;
}

/**
 * Matches any single Char (Unicode scalar or error code point). For `*` and `+` quantifiers, always non-greedy matching.
 *
 * 匹配任意单个字符（Unicode 标量值或错误码点）。对于`*`和`+`量词总是非贪婪匹配。
 */
export const AnyChar = { kind: ParserNodeKind.AnyChar, name: "AnyChar" } as const;

/**
 * Single character match node.
 *
 * 单字符匹配节点。
 */
export type CharMatchNode = CharMatchRange | CharMatchSet | typeof AnyChar;
export type GeneralCharMatchNode = CharMatchNode | (PatternSet & { charset_flag: true });
export type ParserNode = CharMatchNode | PatternSeq | CharSeq | PatternSet;

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

export function isGeneralCharMatchNode(node: ParserNode): node is GeneralCharMatchNode {
  return CHAR_MATCH_NODE_KINDS.includes(node.kind)
    || (node.kind === ParserNodeKind.PatternSet && (node as PatternSet).charset_flag);
}

function validatePartialCharRange(partial: Partial<CharMatchRange>): void {
  const start = partial.start ?? '';
  const end = partial.end ?? '';
  const startCp = start === '' ? 0 : (start.codePointAt(0) ?? 0);
  const endCp = end === '' ? 0x10ffff : (end.codePointAt(0) ?? 0x10ffff);
  if (startCp > endCp) {
    throw new Error(`completeCharRange: start (${JSON.stringify(start)}, U+${startCp.toString(16).toUpperCase()}) must not be greater than end (${JSON.stringify(end)}, U+${endCp.toString(16).toUpperCase()})`);
  }
}

/**
 * ============================== EN ==============================
 *
 * Complete a `CharMatchRange` from a partial input.
 *
 * - `start` and `end` can be empty strings:
 *   - Empty `start` means the minimum possible character (U+0000).
 *   - Empty `end` means the maximum possible character (U+10FFFF).
 * - The range `[start, end]` must contain at least one character.
 *   When both `start` and `end` are non-empty, `start` must be <= `end` (by code point).
 *
 * ============================== 中文 ==============================
 *
 * 从部分输入补全 `CharMatchRange`。
 *
 * - `start` 和 `end` 可以为空字符串：
 *   - `start` 为空表示最小字符（U+0000）。
 *   - `end` 为空表示最大字符（U+10FFFF）。
 * - 区间 `[start, end]` 必须至少包含一个字符。
 *   当 `start` 和 `end` 均非空时，`start` 必须 <= `end`（按码点比较）。
 */
export function completeCharRange(partial: Partial<CharMatchRange>): CharMatchRange {
  validatePartialCharRange(partial);
  return Object.assign(partial, {
    kind: ParserNodeKind.CharMatchRange,
    name: partial.name ?? "",
    start: partial.start === undefined || partial.start === ''
      ? String.fromCodePoint(0)
      : partial.start,
    end: partial.end === undefined || partial.end === ''
      ? String.fromCodePoint(0x10ffff)
      : partial.end,
  }) as CharMatchRange;
}

function validatePartialCharSet(partial: Partial<CharMatchSet>): void {
  const sub_nodes = partial.sub_nodes;
  if (sub_nodes === undefined || sub_nodes === null) {
    throw new Error("completeCharSet: sub_nodes must not be empty");
  }
  if (typeof sub_nodes !== 'string' && !Array.isArray(sub_nodes)) {
    throw new Error("completeCharSet: sub_nodes must be a string or an array");
  }
  if (sub_nodes.length === 0) {
    throw new Error("completeCharSet: sub_nodes must not be empty");
  }
}

export function completeCharSet(
  partial: Partial<CharMatchSet>,
): CharMatchSet {
  validatePartialCharSet(partial);
  return Object.assign(partial, {
    kind: ParserNodeKind.CharMatchSet,
    name: partial.name ?? "",
    sub_nodes: partial.sub_nodes!,
  }) as CharMatchSet;
}

function validatePartialPatternSeq(partial: PatternSeqInput): void {
  if (partial.sub_nodes.length === 0) {
    throw new Error("completePatternSeq: sub_nodes must not be empty");
  }
  const n = partial.sub_nodes.length;
  if (partial.sub_quantifiers.length !== n) {
    throw new Error("completePatternSeq: sub_quantifiers length must match sub_nodes length");
  }
  if (partial.sub_node_bindings !== undefined && partial.sub_node_bindings !== null && partial.sub_node_bindings.length !== n) {
    throw new Error("completePatternSeq: sub_node_bindings length must match sub_nodes length");
  }
  if (partial.sub_node_isolated_scope_flags !== undefined && partial.sub_node_isolated_scope_flags !== null && partial.sub_node_isolated_scope_flags.length !== n) {
    throw new Error("completePatternSeq: sub_node_isolated_scope_flags length must match sub_nodes length");
  }
  if (partial.greedy_flags !== undefined && partial.greedy_flags !== null && partial.greedy_flags.length !== n) {
    throw new Error("completePatternSeq: greedy_flags length must match sub_nodes length");
  }
  validateParserNodePairInput(partial.enclosure, "completePatternSeq: enclosure");
}

function normalizeGreedyFlags(
  n: number,
  sub_quantifiers: string,
  sub_nodes: ParserNode[],
  greedy_flags: boolean[] | undefined | null,
): boolean[] {
  const flags =
    greedy_flags !== undefined && greedy_flags !== null
      ? greedy_flags.slice()
      : Array.from({ length: n }, () => true);
  for (let i = 0; i < n; i++) {
    const q = sub_quantifiers[i];
    if (q === " ") {
      flags[i] = true;
    } else if (sub_nodes[i].kind === ParserNodeKind.AnyChar && (q === "*" || q === "+")) {
      flags[i] = false;
    }
  }
  return flags;
}

function normalizeSubNodeBindings(
  n: number,
  sub_node_bindings: (string | null)[] | undefined | null,
): (string | null)[] | null {
  return sub_node_bindings !== undefined ? sub_node_bindings?.slice() ?? null : null;
}

function normalizeSubNodeIsolatedScopeFlags(
  n: number,
  sub_node_isolated_scope_flags: boolean[] | undefined | null,
  sub_node_bindings: (string | null)[] | null,
): boolean[] | null {
  if (sub_node_isolated_scope_flags !== undefined) {
    return sub_node_isolated_scope_flags?.slice() ?? null;
  }
  return sub_node_bindings !== null ? Array.from({ length: n }, () => true) : null;
}

function normalizeAssignmentMap(
  assignment_map: Map<string, string> | string | undefined | null,
): Map<string, string> | string | null {
  if (assignment_map === undefined) {
    return null;
  }
  return assignment_map instanceof Map ? new Map(assignment_map) : assignment_map;
}

type PatternSeqInput = Omit<Partial<PatternSeq>, "enclosure"> & {
  sub_nodes: ParserNode[];
  sub_quantifiers: string;
  enclosure?: ParserNodePairInput;
};

function normalizeParserNodePair(
  value: ParserNodePairInput | undefined,
): [ParserNode, ParserNode] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return value;
  }
  const chars = Array.from(value);
  return [
    completeCharSeq({ literal: chars[0]! }),
    completeCharSeq({ literal: chars[1]! }),
  ];
}

function validateParserNodePairInput(
  value: ParserNodePairInput | undefined,
  field_name: string,
): void {
  if (typeof value !== "string") {
    return;
  }
  if (Array.from(value).length !== 2) {
    throw new Error(`${field_name} string must contain exactly 2 characters`);
  }
}

export function completePatternSeq(
  partial: PatternSeqInput,
): PatternSeq {
  validatePartialPatternSeq(partial);
  const n = partial.sub_nodes.length;
  const greedy_flags = normalizeGreedyFlags(n, partial.sub_quantifiers, partial.sub_nodes, partial.greedy_flags);
  const sub_node_bindings = normalizeSubNodeBindings(n, partial.sub_node_bindings);
  const sub_node_isolated_scope_flags = normalizeSubNodeIsolatedScopeFlags(n, partial.sub_node_isolated_scope_flags, sub_node_bindings);
  const assignment_map = normalizeAssignmentMap(partial.assignment_map);
  const enclosure = normalizeParserNodePair(partial.enclosure);
  return Object.assign(partial, {
    kind: ParserNodeKind.PatternSeq,
    name: partial.name ?? "",
    sub_nodes: partial.sub_nodes,
    sub_quantifiers: partial.sub_quantifiers,
    raw: partial.raw ?? false,
    sep: partial.sep ?? null,
    accept_trailing_sep: partial.accept_trailing_sep ?? false,
    ignore: partial.ignore ?? null,
    greedy_flags,
    enclosure,
    sub_node_bindings,
    sub_node_isolated_scope_flags,
    assignment_map,
  }) as PatternSeq;
}

function validatePartialCharSeq(partial: Partial<CharSeq> & { literal: string }): void {
  if (partial.literal.length === 0) {
    throw new Error("CharSeq.literal must be non-empty");
  }
}

/**
 * Builds a `CharSeq`; throws if `literal` is empty.
 *
 * 构造 `CharSeq`；若 `literal` 为空则抛出。
 */
export function completeCharSeq(partial: Partial<CharSeq> & { literal: string }): CharSeq {
  validatePartialCharSeq(partial);
  return Object.assign(partial, {
    kind: ParserNodeKind.CharSeq,
    name: partial.name ?? partial.literal,
    literal: partial.literal,
  }) as CharSeq;
}

type PatternSetInput = Omit<Partial<PatternSet>, "associateby"> & {
  sub_nodes: ParserNode[];
  associateby?: ParserNodePairInput;
};

function validatePartialPatternSet(partial: PatternSetInput): void {
  if (partial.sub_nodes.length === 0) {
    throw new Error("completePatternSet: sub_nodes must not be empty");
  }
  const n = partial.sub_nodes.length;
  if (partial.neg_flags !== undefined && partial.neg_flags.length !== n) {
    throw new Error("completePatternSet: neg_flags length must match patterns length");
  }
  const charset_flag = inferPatternSetCharsetFlag(partial.sub_nodes, partial.neg_flags ?? Array.from({ length: n }, () => false));
  validateParserNodePairInput(partial.associateby, "completePatternSet: associateby");
  const associateby = normalizeParserNodePair(partial.associateby);
  if (charset_flag && associateby !== null) {
    throw new Error("completePatternSet: associateby is only allowed when charset_flag is false");
  }
  const ignore = partial.ignore ?? null;
  if (ignore !== null && associateby === null) {
    throw new Error("completePatternSet: ignore is only allowed when associateby is also non-null");
  }
}

function normalizeNegFlags(n: number, neg_flags: boolean[] | undefined): boolean[] {
  return neg_flags !== undefined ? neg_flags.slice() : Array.from({ length: n }, () => false);
}

export function completePatternSet(
  partial: PatternSetInput,
): PatternSet {
  validatePartialPatternSet(partial);
  const n = partial.sub_nodes.length;
  const neg_flags = normalizeNegFlags(n, partial.neg_flags);
  const charset_flag = inferPatternSetCharsetFlag(partial.sub_nodes, neg_flags);
  const associateby = normalizeParserNodePair(partial.associateby);
  return Object.assign(partial, {
    kind: ParserNodeKind.PatternSet,
    name: partial.name ?? "",
    sub_nodes: partial.sub_nodes,
    neg_flags,
    charset_flag,
    associateby,
    ignore: partial.ignore ?? null,
  }) as PatternSet;
}

function isPatternSetCharsetMember(node: ParserNode): boolean {
  return isGeneralCharMatchNode(node);
}

function inferPatternSetCharsetFlag(
  patterns: ParserNode[],
  neg_flags: boolean[],
): boolean {
  if (patterns.length === 0) {
    return false;
  }
  for (let i = 0; i < patterns.length; i++) {
    if (neg_flags[i]) {
      continue;
    }
    if (!isPatternSetCharsetMember(patterns[i])) {
      return false;
    }
  }
  return true;
}
