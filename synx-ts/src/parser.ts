import type { ParserNode } from "./parser_node";
import { ParserImpl } from "./parser_impl";
export type {
    ASTNode,
    ParserConfig,
    ParserInput,
    ParseProfiling,
    ParseResult,
    ParseSingleNodeProfiling,
    PatternSetAlternativeProfiling,
} from "./common";
export { ParseResultKind } from "./common";
import type { ASTNode, ParserConfig, ParserInput, ParseProfiling, ParseResult } from "./common";

export interface Parser {
    /**
     * Parse input starting from root.
     * @param root Must be one of the ParserConfig.parser_nodes used when creating this Parser (entry node)
     */
    parse(input: ParserInput, root: ParserNode): ParseResult;
    parseAll(input: ParserInput, node: ParserNode): ASTNode[];
    getParseProfiling(): ParseProfiling;
}

export function mkParser(config: ParserConfig): Parser {
    return new ParserImpl(config);
}
