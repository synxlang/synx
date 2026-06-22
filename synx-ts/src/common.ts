import type { ParserNode, PatternSet } from "./parser_node";

/**
 * ============================== EN ==============================
 *
 * - `parser_nodes`: Matched parser nodes, usually one; when there are multiple nodes, they represent multiple matches, in match order from left to right.
 * - `range`: Matched span `[start, end)` (half-open).
 * - `value`: By default the same as `raw_value`; for special cases see the `ParserNode` definitions.
 * - `raw_value`: Raw AST payload: for `CharMatchNode` it is a string; for other kinds it is `ASTNode[]`, with each entry in one-to-one correspondence with `sub_nodes`.
 * - `seps`: Separator matches for `PatternSeq` (see `PatternSeq.sep`); empty array for other node kinds.
 * - `enclosure`: See `PatternSeq` definition.
 * - `associate_enclosures`: Matched association boundary pairs produced by `PatternSet.associateby`; null when absent.
 * - `bindings`: Binding context produced by this AST node; empty object when no binding context is produced.
 *
 * ============================== 中文 ==============================
 *
 * - `parser_nodes`：匹配的 parser 节点，通常 1 个；多个节点时表示多次被匹配，匹配次序从左到右。
 * - `range`：匹配区间 `[start, end)`（左闭右开）。
 * - `value`：默认value和raw_value相同，特殊情况见ParserNode定义。
 * - `raw_value`：原始 AST 值，对于CharMatchNode为字符串，其它为ASTNode[]，每个节点和sub_nodes一一对应。
 * - `seps`：`PatternSeq` 的分隔符匹配（见 `PatternSeq.sep`）；其它节点类型为空数组。
 * - `enclosure`：见PatternSeq定义。
 * - `associate_enclosures`：由 `PatternSet.associateby` 产生的结合边界匹配对；不存在时为 null。
 * - `bindings`：该 AST 节点生成的绑定上下文；没有生成绑定上下文时为空对象。
 */
export interface ASTNode {
    parser_nodes: ParserNode[];
    range: [number, number];
    value: any;
    raw_value: any;
    seps: ASTNode[];
    enclosure: [ASTNode, ASTNode] | null;
    associate_enclosures: [ASTNode[], ASTNode[]] | null;
    bindings: Record<string, any>;
}

export interface AstParserInput {
    src: string;
    pos: number;
}

export enum ParseResultKind {
    Success,
    Failure,
    Partial,
}

export interface AstParseResult {
    kind: ParseResultKind;
    ast_nodes: ASTNode[];
    end_pos: number;    // not inclusive
    error?: string;
    profiling: AstParseProfiling;
}

export interface AstParseSingleNodeProfiling {
    node: ParserNode;
    pos: number;
    enter_count: number;
    success_count: number;
    success_null_count: number;
    failure_count: number;
}

export interface PatternSetAlternativeProfiling {
    node: PatternSet;
    pos: number;
    alt_idx: number;
    enter_count: number;
    success_count: number;
    failure_count: number;
}

export interface AstParseProfiling {
    parse_elapsed_s: number;
    parse_single_node_enter_count: number;
    parse_single_node_max_depth: number;
    parse_single_node_by_node_pos: Map<string, AstParseSingleNodeProfiling>;
    pattern_set_alternative_by_node_pos_alt: Map<string, PatternSetAlternativeProfiling>;
}

/** Parser configuration: parser_nodes is the set of optional entry nodes. The root passed to parse() must be one of them. */
export interface AstParserConfig {
    parser_nodes: ParserNode[];
    debug?: boolean;
    timeout_s?: number;
}
