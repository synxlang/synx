import assert from "assert";
import { AstNode } from "./common";
import {
  ParserNode, validatePartialCharRange, completeCharRange, completeCharSeq, completePatternSeq,
  ParserNodeKind
} from "./parser_node";
import * as SYNX_PARSER_NODE from "./synx_parser_node"

export enum SynxExprKind {
  ROOT,
  ASSIGNMENT,
  PATTERN,
  PATTERN_WITH_UNARY_OP,
  UNKNOWN,
  ERROR_RANGE,
  ERROR_PATTERN_SET,
  ERROR_PATTERN_WITH_UNARY_OP,
  ERROR_TOP_LEVEL_PATTERN,
}

export type SynxErrorExpr = SynxUnknownExpr | SynxErrorRangeExpr | SynxErrorPatternSetExpr | SynxErrorPatternWithUnaryOpExpr | SynxErrorTopLevelPatternExpr;
export type SynxExpr = SynxUnknownExpr | SynxRootExpr | SynxAssignmentExpr | SynxPatternExpr | SynxPatternWithUnaryOpExpr | SynxErrorExpr;
export type SynxAssignmentValueExpr = SynxPatternExpr;

export interface SynxUnknownExpr {
  kind: SynxExprKind.UNKNOWN;
  value: AstNode;
}

export interface SynxRootExpr {
  kind: SynxExprKind.ROOT;
  value: SynxExpr[];
}

export interface SynxAssignmentExpr {
  kind: SynxExprKind.ASSIGNMENT;
  value: SynxAssignmentValueExpr | SynxErrorExpr;
  target: string;
}

export interface SynxPatternExpr {
  kind: SynxExprKind.PATTERN;
  value: ParserNode;
}

export interface SynxErrorTopLevelPatternExpr {
  kind: SynxExprKind.ERROR_TOP_LEVEL_PATTERN;
  value: SynxPatternWithUnaryOpExpr;
}

export interface SynxPatternWithUnaryOpExpr {
  kind: SynxExprKind.PATTERN_WITH_UNARY_OP;
  pattern: SynxPatternExpr;
  prefix_op: string | null;
  postfix_op: string | null;
}

export interface SynxErrorPatternWithUnaryOpExpr {
  kind: SynxExprKind.ERROR_PATTERN_WITH_UNARY_OP;
  pattern: SynxPatternExpr | SynxErrorExpr;
  prefix_op: string | null;
  postfix_op: string | null;
}

export interface SynxErrorRangeExpr {
  kind: SynxExprKind.ERROR_RANGE;
  value: [string, string];
}

export interface SynxErrorPatternSetExpr {
  kind: SynxExprKind.ERROR_PATTERN_SET;
  patterns: (SynxPatternExpr | SynxErrorExpr)[];
  associateby: SynxPatternExpr | SynxErrorExpr;
  ignore: SynxPatternExpr | SynxErrorExpr;
}

export type SynxSemanticSymbolTable = Map<string, SynxAssignmentValueExpr | SynxErrorExpr>;

export interface SynxSemanticResult {
  root: SynxExpr;
  symbol_table: SynxSemanticSymbolTable;
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
  symbol_table = new Map<string, SynxAssignmentValueExpr | SynxErrorExpr>;
  expr_to_ast_node_map = new Map<SynxExpr, AstNode>();
  err_exprs: SynxErrorExpr[] = [];

  constructor(config: SynxSemanticParserConfig) {
  }

  initParse() {
    this.symbol_table = new Map<string, SynxAssignmentValueExpr | SynxErrorExpr>;
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

  parseCharRange(node: AstNode): SynxPatternExpr | SynxErrorRangeExpr {
    let partial = {
      start: this.parseCharRangeBound(node.value.start),
      end: this.parseCharRangeBound(node.value.end)
    }

    const err = validatePartialCharRange(partial);
    let ret: SynxPatternExpr | SynxErrorRangeExpr;
    if (err) {
      ret = {
        kind: SynxExprKind.ERROR_RANGE,
        value: [partial.start, partial.end]
      };
      this.pushErrExpr(ret);
    } else {
      ret = {
        kind: SynxExprKind.PATTERN,
        value: completeCharRange(partial)
      };
    }

    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parseCharSeq(node: AstNode): SynxPatternExpr {
    const ret: SynxPatternExpr = {
      kind: SynxExprKind.PATTERN,
      value: completeCharSeq({ literal: this.parseStringLiteral(node) }),
    };
    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parsePatternSet(node: AstNode): SynxPatternExpr | SynxErrorPatternSetExpr {
    const value = node.value;
    let has_error = false;
    let pattern_exprs: (SynxPatternExpr | SynxErrorExpr)[] = [];
    for (const pattern_ast_node of (value.patterns as AstNode[])) {
      if (pattern_ast_node.parser_nodes[0] === SYNX_PARSER_NODE.PatternBinding) {
        throw new Error("not implemented");
      }
      let pattern_expr = this.parsePattern(pattern_ast_node);
      if (pattern_expr.kind !== SynxExprKind.PATTERN) {
        has_error = true;
      }
      pattern_exprs.push(pattern_expr);
    }

    let associateby_pattern_expr = this.parsePattern(value.associateby.value);
    if (associateby_pattern_expr.kind !== SynxExprKind.PATTERN) {
      has_error = true;
    }

    let ignore_pattern_expr = this.parsePattern(value.ignore.value);
    if (ignore_pattern_expr.kind !== SynxExprKind.PATTERN) {
      has_error = true;
    }

    let ret: SynxPatternExpr | SynxErrorPatternSetExpr;
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

  parsePattern(node: AstNode): SynxPatternExpr | SynxErrorExpr {
    if (node.parser_nodes.at(-1) !== SYNX_PARSER_NODE.Pattern) {
      this.procUnexpectedParserNode(node.parser_nodes.at(-1));
    }
    let ret: SynxPatternExpr | SynxErrorExpr;
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.CharRange) {
      ret = this.parseCharRange(node);
    } else if (parser_node === SYNX_PARSER_NODE.StringLiteral) {
      ret = this.parseCharSeq(node);
    }
    // TODO

    // else if (parser_node === SYNX_PARSER_NODE.PatternSet) {
    //   ret = this.parsePatternSet(node);
    // } 

    else {
      ret = this.parseUnknownExpr(node);
    }

    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parsePatternWithUnaryOp(node: AstNode): SynxPatternWithUnaryOpExpr | SynxErrorPatternWithUnaryOpExpr {
    const value = node.value;
    let has_error = false;
    const pattern = this.parsePattern(value.pattern);
    if (pattern.kind !== SynxExprKind.PATTERN) {
      has_error = true;
    }
    const prefix_op = value.prefix_op?.value ?? null;
    const postfix_op = value.postfix_op?.value ?? null;
    let ret: SynxPatternWithUnaryOpExpr | SynxErrorPatternWithUnaryOpExpr;
    if (has_error) {
      ret = {
        kind: SynxExprKind.ERROR_PATTERN_WITH_UNARY_OP,
        pattern: pattern,
        prefix_op: prefix_op,
        postfix_op: postfix_op
      };
    } else {
      assert.ok(pattern.kind === SynxExprKind.PATTERN);
      ret = {
        kind: SynxExprKind.PATTERN_WITH_UNARY_OP,
        pattern: pattern,
        prefix_op: prefix_op,
        postfix_op: postfix_op
      }
    }

    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parseTopLevelPattern(node: AstNode): SynxPatternExpr | SynxErrorExpr {
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.PatternWithUnaryOp) {
      const pattern_wtih_unary_op_expr = this.parsePatternWithUnaryOp(node);
      if (pattern_wtih_unary_op_expr.kind === SynxExprKind.PATTERN_WITH_UNARY_OP) {
        if (pattern_wtih_unary_op_expr.prefix_op === "-") {
          return {
            kind: SynxExprKind.ERROR_TOP_LEVEL_PATTERN,
            value: pattern_wtih_unary_op_expr
          };
        }
        const parsed_pattern = pattern_wtih_unary_op_expr.pattern.value;
        const prefix_op = pattern_wtih_unary_op_expr.prefix_op;
        const postfix_op = pattern_wtih_unary_op_expr.postfix_op;
        let ret_value: ParserNode | null = null;

        if (postfix_op === null) {
          if (prefix_op === null) {
            ret_value = parsed_pattern;
          } else if (prefix_op === "\\raw") {
            if (parsed_pattern.kind === ParserNodeKind.PatternSet) {
              throw new Error("not implemented");
            }
            if (parsed_pattern.kind !== ParserNodeKind.UnresolvedPattern) {
              ret_value = parsed_pattern;
              if (ret_value.kind === ParserNodeKind.PatternSeq) {
                ret_value.raw = true;
              }
            }
          } else {
            assert.ok(false);
          }
        }

        if (!ret_value) {
          let partial = {
            sub_nodes: [parsed_pattern],
            sub_quantifiers: prefix_op ?? " "
          };
          ret_value = completePatternSeq(partial);
        }

        let ret: SynxPatternExpr = {
          kind: SynxExprKind.PATTERN,
          value: ret_value
        };

        this.expr_to_ast_node_map.set(ret, node);
        return ret;
      } else {
        return pattern_wtih_unary_op_expr;
      }
    } else {
      return this.parseUnknownExpr(node);
    }
  }

  parseAssignmentValue(node: AstNode): SynxAssignmentValueExpr | SynxErrorExpr {
    return this.parseTopLevelPattern(node);
  }

  parseAssignment(node: AstNode): SynxAssignmentExpr {
    let target = node.value.target.value as string;
    let value = this.parseAssignmentValue(node.value.source);
    if (value.kind === SynxExprKind.PATTERN) {
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
      parsed_exprs.push(this.parseExpr(expr));
    }
    let ret: SynxRootExpr = {
      kind: SynxExprKind.ROOT,
      value: parsed_exprs,
    };
    this.expr_to_ast_node_map.set(ret, node);
    return ret;
  }

  parseExpr(node: AstNode): SynxExpr {
    let ret: SynxExpr;
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.Assignment) {
      ret = this.parseAssignment(node);
    } else {
      ret = this.parseTopLevelPattern(node);
    }
    return ret;
  }

  parseNode(node: AstNode): SynxExpr {
    let ret: SynxExpr;
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.Synx) {
      ret = this.parseSynx(node);
    } else {
      ret = this.parseExpr(node);
    }

    return ret;
  }
}


