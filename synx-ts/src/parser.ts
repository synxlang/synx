import type { ParserNode } from "./parser_node";
import { AstParserImpl } from "./parser_impl";
export type {
    ASTNode,
    AstParserConfig as ParserConfig,
    AstParserInput as ParserInput,
    AstParseProfiling as ParseProfiling,
    AstParseResult as ParseResult,
    AstParseSingleNodeProfiling as ParseSingleNodeProfiling,
    PatternSetAlternativeProfiling,
} from "./common";
export { ParseResultKind } from "./common";
import type { ASTNode, AstParserConfig, AstParserInput, AstParseProfiling, AstParseResult } from "./common";

export interface AstParser {
    /**
     * Parse input starting from root.
     * @param root Must be one of the ParserConfig.parser_nodes used when creating this Parser (entry node)
     */
    parse(input: AstParserInput, root: ParserNode): AstParseResult;
    parseAll(input: AstParserInput, node: ParserNode): ASTNode[];
    getParseProfiling(): AstParseProfiling;
}

export function mkAstParser(config: AstParserConfig): AstParser {
    return new AstParserImpl(config);
}
