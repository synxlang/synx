import { ASTNode } from "./common";
import {
  ParserNode
} from "./parser_node";
import * as SYNX_PARSER_NODE from "./synx_parser_node"


export interface SynxSemanticResult {
  symbol_table: Map<string, ParserNode>;
}

export interface SynxSemanticParserConfig {
}

export interface SynxSemanticParser {
  /**
   * 所有synx_ast_nodes必须由SYNX_PARSER_NODE中定义的parser_node解析而来
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
    for(const node of synx_ast_nodes){
      if(node.parser_nodes.includes(SYNX_PARSER_NODE.Synx)){
        
      }
    }

    throw new Error("Method not implemented.");
  }
}


