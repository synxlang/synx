import { ParserNode } from "./parser_node";
import { ParserImpl } from "./parser_impl";

export interface ASTNode {
    /** Matched parser nodes, usually 1; multiple nodes indicate multiple interpretations with decreasing priority from left to right */
    parser_nodes: ParserNode[];
    range: [number, number];    // [start, end)
    /** Semantic value, constructed exactly according to the => return value on the right side of the rule definition (e.g., [.symbol=symbol, .pattern=pattern], exprs, field_assignments, etc.) */
    value: any;
    /** Raw AST value; when no custom AST construction is used, value and raw_value are identical */
    raw_value: any;
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
}

export function mkParser(config: ParserConfig): Parser {
    return new ParserImpl(config);
}
