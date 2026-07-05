import assert from "assert";
import { AstNode } from "./common";
import {
  ParserNode, validatePartialCharRange, completeCharRange, completeCharSeq,
  ParserNodeKind
} from "./parser_node";
import * as SYNX_PARSER_NODE from "./synx_parser_node"

export enum SynxExprKind {
  ROOT,
  PARSER_NODE,
  ASSIGNMENT,
  UNKNOWN,
  ERROR_RANGE,
  ERROR_PATTERN_SET,
}

export type SynxErrorExpr = SynxUnknownExpr | SynxErrorRangeExpr | SynxErrorPatternSetExpr;
export type SynxExpr = SynxUnknownExpr | SynxRootExpr | SynxParserNodeExpr | SynxAssignmentExpr | SynxErrorExpr;
export type SynxAssignmentValueExpr = SynxParserNodeExpr | SynxErrorExpr;

export interface SynxUnknownExpr {
  kind: SynxExprKind.UNKNOWN;
  value: AstNode;
}

export interface SynxRootExpr {
  kind: SynxExprKind.ROOT;
  value: SynxExpr[];
}

export interface SynxParserNodeExpr {
  kind: SynxExprKind.PARSER_NODE;
  value: ParserNode;
}

export interface SynxAssignmentExpr {
  kind: SynxExprKind.ASSIGNMENT;
  value: SynxAssignmentValueExpr;
  target: string;
}

export interface SynxErrorRangeExpr {
  kind: SynxExprKind.ERROR_RANGE;
  value: [string, string];
}

export interface SynxErrorPatternSetExpr {
  kind: SynxExprKind.ERROR_PATTERN_SET;
  patterns: (SynxParserNodeExpr | SynxErrorExpr)[];
  associateby: SynxParserNodeExpr | SynxErrorExpr;
  ignore: SynxParserNodeExpr | SynxErrorExpr;
}

export interface SynxSemanticResult {
  root: SynxExpr;
  symbol_table: Map<string, SynxAssignmentValueExpr>;
  expr_to_ast_node_map: Map<SynxExpr, AstNode>;
  err_exprs: SynxErrorExpr[];
}

export interface SynxSemanticParserConfig {
}

export interface SynxSemanticParser {
  /**
   * node必须由SYNX_PARSER_NODE中定义的parser_node解析而来
   */
  parse(node: AstNode): SynxSemanticResult;
}

export function mkSynxSemanticParser(config: SynxSemanticParserConfig = {}): SynxSemanticParser {
  return new SynxSemanticParserImpl(config);
}

export function resolve_symbols(symbol_table: Map<string, ParserNode>) {
  throw "todo";
}



class SynxSemanticParserImpl implements SynxSemanticParser {
  symbol_table = new Map<string, SynxAssignmentValueExpr>;
  expr_to_ast_node_map = new Map<SynxExpr, AstNode>();
  err_exprs: SynxErrorExpr[] = [];

  constructor(config: SynxSemanticParserConfig) {
  }

  initParse() {
    this.symbol_table = new Map<string, SynxAssignmentValueExpr>;
    this.expr_to_ast_node_map = new Map<SynxExpr, AstNode>();
    this.err_exprs = [];
  }

  procUnexpectedParserNode(parser_node: ParserNode | undefined): never {
    throw new Error("unexpected parser_node");
  }

  parse(node: AstNode): SynxSemanticResult {
    this.initParse();
    let root = this.parseNode(node);
    return {
      root: root,
      symbol_table: this.symbol_table,
      expr_to_ast_node_map: this.expr_to_ast_node_map,
      err_exprs: this.err_exprs,
    };
  }

  parseUnknownExpr(node: AstNode): SynxUnknownExpr {
    let ret: SynxUnknownExpr = {
      kind: SynxExprKind.UNKNOWN,
      value: node
    };
    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  pushErrExpr(expr: SynxErrorExpr) {
    this.err_exprs.push(expr);
  }

  parseStringLiteral(node: AstNode): string {
    const pieces = node.value as AstNode[];
    return pieces.map(p => {
      if (p.parser_nodes[0] === SYNX_PARSER_NODE.EscapeChar) {
        const ch = p.value.value as string;
        switch (ch) {
          case "t": return "\t";
          case "n": return "\n";
          case "r": return "\r";
          case "v": return "\v";
          case "f": return "\f";
          case "0": return "\0";
          default: return ch;
        }
      }
      return p.value[0].value;
    }).join('');
  }

  parseCharRangeBound(node: AstNode): string {
    const parser_node = node.parser_nodes.at(-2);
    if (parser_node === SYNX_PARSER_NODE.StringLiteral) {
      return this.parseStringLiteral(node);
    } else if (parser_node === SYNX_PARSER_NODE.SymbolChar) {
      return node.value;
    }
    this.procUnexpectedParserNode(parser_node);
  }

  parseCharRange(node: AstNode): SynxParserNodeExpr | SynxErrorRangeExpr {
    let partial = {
      start: this.parseCharRangeBound(node.value.start),
      end: this.parseCharRangeBound(node.value.end)
    }

    const err = validatePartialCharRange(partial);
    let ret: SynxParserNodeExpr | SynxErrorRangeExpr;
    if (err) {
      ret = {
        kind: SynxExprKind.ERROR_RANGE,
        value: [partial.start, partial.end]
      };
      this.pushErrExpr(ret);
    } else {
      ret = {
        kind: SynxExprKind.PARSER_NODE,
        value: completeCharRange(partial)
      };
    }

    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parseCharSeq(node: AstNode): SynxParserNodeExpr {
    const ret: SynxParserNodeExpr = {
      kind: SynxExprKind.PARSER_NODE,
      value: completeCharSeq({ literal: this.parseStringLiteral(node) }),
    };
    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parsePatternSet(node: AstNode): SynxParserNodeExpr | SynxErrorPatternSetExpr {
    const value = node.value;
    let has_error = false;
    let pattern_exprs: (SynxParserNodeExpr | SynxErrorExpr)[] = [];
    for (const pattern_ast_node of (value.patterns as AstNode[])) {
      if (pattern_ast_node.parser_nodes[0] === SYNX_PARSER_NODE.PatternBinding) {
        throw new Error("Notimplemented now");
      }
      let pattern_expr = this.parsePattern(pattern_ast_node);
      if (pattern_expr.kind !== SynxExprKind.PARSER_NODE) {
        has_error = true;
      }
      pattern_exprs.push(pattern_expr);
    }

    let associateby_pattern_expr = this.parsePattern(value.associateby.value);
    if (associateby_pattern_expr.kind !== SynxExprKind.PARSER_NODE) {
      has_error = true;
    }

    let ignore_pattern_expr = this.parsePattern(value.ignore.value);
    if (ignore_pattern_expr.kind !== SynxExprKind.PARSER_NODE) {
      has_error = true;
    }

    let ret: SynxParserNodeExpr | SynxErrorPatternSetExpr;
    if (has_error) {
      ret = {
        kind: SynxExprKind.ERROR_PATTERN_SET,
        patterns: pattern_exprs,
        associateby: associateby_pattern_expr,
        ignore: ignore_pattern_expr,
      };
    } else {
      throw "todo";
    }

    return ret;
  }

  parsePattern(node: AstNode): SynxParserNodeExpr | SynxErrorExpr {
    if (node.parser_nodes.at(-1) !== SYNX_PARSER_NODE.Pattern) {
      this.procUnexpectedParserNode(node.parser_nodes.at(-1));
    }
    let ret: SynxParserNodeExpr | SynxErrorExpr;
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.CharRange) {
      ret = this.parseCharRange(node);
    } else if (parser_node === SYNX_PARSER_NODE.StringLiteral) {
      ret = this.parseCharSeq(node);
    } else if (parser_node === SYNX_PARSER_NODE.PatternSet) {
      ret = this.parsePatternSet(node);
    } else {
      ret = this.parseUnknownExpr(node);
    }

    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parseAssignmentValue(node: AstNode): SynxAssignmentValueExpr {
    return this.parsePattern(node);
  }

  parseAssignment(node: AstNode): SynxAssignmentExpr {
    let target = node.value.target.value as string;
    let value = this.parseAssignmentValue(node.value.source);
    if (value.kind === SynxExprKind.PARSER_NODE) {
      assert.ok(value.value.kind !== ParserNodeKind.AnyChar);
      value.value.name = target;
    }
    let ret: SynxAssignmentExpr = {
      kind: SynxExprKind.ASSIGNMENT,
      value: value,
      target: target,
    };
    this.symbol_table.set(target, value);
    return ret;
  }

  parseSynx(node: AstNode): SynxRootExpr {
    let parsed_exprs: SynxExpr[] = [];
    for (const expr of node.value.exprs) {
      parsed_exprs.push(this.parseNode(expr));
    }
    let ret: SynxRootExpr = {
      kind: SynxExprKind.ROOT,
      value: parsed_exprs,
    };
    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parseNode(node: AstNode): SynxExpr {
    let ret: SynxExpr = {
      kind: SynxExprKind.UNKNOWN,
      value: node,
    }
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.Synx) {
      ret = this.parseSynx(node);
    } else if (parser_node === SYNX_PARSER_NODE.Assignment) {
      ret = this.parseAssignment(node);
    } else {
      ret = this.parsePattern(node);
    }

    return ret;
  }
}


