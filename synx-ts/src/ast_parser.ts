import type { ParserNode } from "./parser_node";
import { AstParserImpl } from "./ast_parser_impl";
export type {
  AstNode,
  AstParserConfig,
  AstParserInput,
  AstParseProfiling,
  AstParseResult,
  AstParseSingleNodeProfiling,
  PatternSetAlternativeProfiling,
} from "./common";
export { ParseResultKind } from "./common";
import type { AstNode, AstParserConfig, AstParserInput, AstParseResult } from "./common";

export interface AstParser {
    /**
     * Parse input starting from root.
     * @param root Must be one of the AstParserConfig.parser_nodes used when creating this AstParser (entry node)
     */
    parse(input: AstParserInput, root: ParserNode): AstParseResult;
    parseAll(input: AstParserInput, node: ParserNode): AstNode[];
}

export function mkAstParser(config: AstParserConfig): AstParser {
  return new AstParserImpl(config);
}
