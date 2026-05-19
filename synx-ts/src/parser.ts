import { ParserNode } from "./parser_node";
import { ParserImpl } from "./parser_impl";

/**
 * ============================== EN ==============================
 *
 * - `parser_nodes`: Matched parser nodes, usually one; when there are multiple nodes, they represent multiple matches, in match order from left to right.
 * - `range`: Matched span `[start, end)` (half-open).
 * - `value`: By default the same as `raw_value`; for special cases see the `ParserNode` definitions.
 * - `raw_value`: Raw AST payload: for `CharMatchNode` it is a string; for other kinds it is `ASTNode[]`, with each entry in one-to-one correspondence with `sub_nodes`.
 * - `seps`: Separator matches for `PatternSeq` (see `PatternSeq.sep`); empty array for other node kinds.
 * - `enclosure`: See `PatternSeq` definition.
 *
 * ============================== 中文 ==============================
 *
 * - `parser_nodes`：匹配的 parser 节点，通常 1 个；多个节点时表示多次被匹配，匹配次序从左到右。
 * - `range`：匹配区间 `[start, end)`（左闭右开）。
 * - `value`：默认value和raw_value相同，特殊情况见ParserNode定义。
 * - `raw_value`：原始 AST 值，对于CharMatchNode为字符串，其它为ASTNode[]，每个节点和sub_nodes一一对应。
 * - `seps`：`PatternSeq` 的分隔符匹配（见 `PatternSeq.sep`）；其它节点类型为空数组。
 * - `enclosure`：见PatternSeq定义。
 */
export interface ASTNode {
    parser_nodes: ParserNode[];
    range: [number, number];
    value: any;
    raw_value: any;
    seps: ASTNode[];
    enclosure: [ASTNode, ASTNode] | null;
}

export interface ParserInput {
    src: string;
    pos: number;
}

export enum ParseResultKind {
    Success,
    Failure,
    Partial,
}

export interface ParseResult {
    kind: ParseResultKind;
    ast_nodes: ASTNode[];
    end_pos: number;    // not inclusive
}

/** Parser configuration: parser_nodes is the set of optional entry nodes. The root passed to parse() must be one of them. */
export interface ParserConfig {
    parser_nodes: ParserNode[];
}

export interface Parser {
    /**
     * Parse input starting from root.
     * @param root Must be one of the ParserConfig.parser_nodes used when creating this Parser (entry node)
     */
    parse(input: ParserInput, root: ParserNode): ParseResult;
    parseAll(input: ParserInput, node: ParserNode): ASTNode[];
}

export function mkParser(config: ParserConfig): Parser {
    return new ParserImpl(config);
}
