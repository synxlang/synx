import { ASTNode } from "./common";
import {
  ParserNode
} from "./parser_node";


export interface SynxSemanticResult {
  symbol_table: Map<string, ParserNode>;
}

export interface SynxSemanticParserConfig {
}

export interface SynxSemanticParser {
  /**
   * 所有synx_ast_nodes必须由synx_slim_parser_node.ts中定义的parser_node解析而来
   */
  parse(synx_ast_nodes: ASTNode[]): SynxSemanticResult;
}

export function mkSynxSemanticParser(config: SynxSemanticParserConfig): SynxSemanticParser {
  return new SynxSemanticParserImpl(config);
}

export function resolve_symbols(symbol_table: Map<string, ParserNode>) {
  throw "todo";
}



class SynxSemanticParserImpl implements SynxSemanticParser {
  constructor(config: SynxSemanticParserConfig) {
  }

  parse(synx_ast_nodes: ASTNode[]): SynxSemanticResult {
    symbol_table: Map<string, ParserNode>;
    // TODO: 把ast节点转换为symbol_table，但不要解析符号
    throw new Error("Method not implemented.");
  }
}


