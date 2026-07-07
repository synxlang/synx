import assert from "assert";
import { AstNode } from "./common";
import {
  ParserNode, validatePartialCharRange, completeCharRange, completeCharSeq, completePatternSeq,
  ParserNodeKind,
  completePatternSet
} from "./parser_node";
import * as SYNX_PARSER_NODE from "./synx_parser_node"
import Graphemer from 'graphemer';
const graphemer = new Graphemer;

export enum SynxExprKind {
  ROOT,
  ASSIGNMENT,
  PATTERN,
  PATTERN_WITH_UNARY_OP,
  PATTERN_PAIR,
  UNKNOWN,
  ERROR_RANGE,
  ERROR_PATTERN_SET,
  ERROR_PATTERN_WITH_UNARY_OP,
  ERROR_PATTERN_PAIR,
  ERROR_TOP_LEVEL_PATTERN,
}

export type SynxErrorExpr = SynxUnknownExpr | SynxErrorRangeExpr | SynxErrorPatternSetExpr
  | SynxErrorPatternWithUnaryOpExpr | SynxErrorPatternPairExpr | SynxErrorTopLevelPatternExpr;

export type SynxExpr = SynxUnknownExpr | SynxRootExpr | SynxAssignmentExpr | SynxPatternExpr
  | SynxPatternWithUnaryOpExpr | SynxPatternPairExpr | SynxErrorExpr;

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
  pattern: SynxPatternExpr | SynxPatternWithUnaryOpExpr | SynxErrorExpr;
  prefix_op: string | null;
  postfix_op: string | null;
}

export interface SynxPatternPairExpr {
  kind: SynxExprKind.PATTERN_PAIR;
  value: string | [ParserNode, ParserNode];
}

export interface SynxErrorPatternPairExpr {
  kind: SynxExprKind.ERROR_PATTERN_PAIR;
  value: string | [ParserNode | SynxErrorExpr, ParserNode | SynxErrorExpr];
}

export interface SynxErrorRangeExpr {
  kind: SynxExprKind.ERROR_RANGE;
  value: [string, string];
}

export interface SynxErrorPatternSetExpr {
  kind: SynxExprKind.ERROR_PATTERN_SET;
  patterns: (SynxPatternExpr | SynxPatternWithUnaryOpExpr | SynxErrorExpr)[];
  associateby: SynxPatternPairExpr | SynxErrorPatternPairExpr | null;
  ignore: SynxPatternExpr | SynxErrorExpr | null;
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

  parsePatternPair(node: AstNode): SynxPatternPairExpr | SynxErrorPatternPairExpr {
    const parser_node = node.parser_nodes[0];
    const value = node.value;

    let ret_value: string | [ParserNode | SynxErrorExpr, ParserNode | SynxErrorExpr];
    let has_error = false;
    if (parser_node === SYNX_PARSER_NODE.StringLiteral) {
      ret_value = this.parseStringLiteral(node);
      if (graphemer.countGraphemes(ret_value) !== 2) {
        has_error = true;
      }
    } else {
      assert.ok(Array.isArray(value) && value.length === 2);
      const pattern_expr_pair = [this.parseTopLevelPattern(value[0]), this.parseTopLevelPattern(value[1])];
      let tmp_value = [];
      for (const pattern_expr of pattern_expr_pair) {
        if (pattern_expr.kind === SynxExprKind.PATTERN) {
          tmp_value.push(pattern_expr.value);
        } else {
          has_error = true;
          tmp_value.push(pattern_expr);
        }
      }
      ret_value = tmp_value as [ParserNode | SynxErrorExpr, ParserNode | SynxErrorExpr];
    }

    if (has_error) {
      return {
        kind: SynxExprKind.ERROR_PATTERN_PAIR,
        value: ret_value
      };
    } else {
      return {
        kind: SynxExprKind.PATTERN_PAIR,
        value: ret_value as string | [ParserNode, ParserNode]
      };
    }
  }

  parsePatternSet(node: AstNode): SynxPatternExpr | SynxErrorPatternSetExpr {
    const value = node.value;
    let has_error = false;
    let pattern_exprs: (SynxPatternExpr | SynxPatternWithUnaryOpExpr | SynxErrorExpr)[] = [];
    let neg_flags: boolean[] = [];
    for (const pattern_ast_node of (value.patterns as AstNode[])) {
      const pattern_with_unary_op_expr = this.parsePatternWithUnaryOp(pattern_ast_node);
      if (pattern_with_unary_op_expr.kind === SynxExprKind.PATTERN_WITH_UNARY_OP) {
        const pattern_eval = this.evalPatternWithUnaryOpExpr(pattern_with_unary_op_expr);
        this.expr_to_ast_node_map.set(pattern_eval, pattern_ast_node);
        pattern_exprs.push(pattern_eval);
        neg_flags.push(pattern_with_unary_op_expr.prefix_op === "-");
      } else {
        has_error = true;
        pattern_exprs.push(pattern_with_unary_op_expr);
        neg_flags.push(false);
      }
    }

    let associateby_pattern_expr = null;
    if (value.associateby !== null) {
      associateby_pattern_expr = this.parsePatternPair(value.associateby.value);
      if (associateby_pattern_expr.kind !== SynxExprKind.PATTERN_PAIR) {
        has_error = true;
      }
    }

    let ignore_pattern_expr = null;
    if (value.ignore !== null) {
      const prefix_value = value.ignore.value.prefix.value;
      if (prefix_value !== "\\ignore") {
        throw new Error("not implemented");
      }
      ignore_pattern_expr = this.parseTopLevelPattern(value.ignore.value.pattern);
      if (ignore_pattern_expr.kind !== SynxExprKind.PATTERN) {
        has_error = true;
      }
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
      let sub_nodes: ParserNode[] = [];
      for (const pattern_expr of pattern_exprs) {
        assert.ok(pattern_expr.kind === SynxExprKind.PATTERN);
        sub_nodes.push(pattern_expr.value);
      }

      if (ignore_pattern_expr !== null) {
        assert.ok(ignore_pattern_expr.kind === SynxExprKind.PATTERN);
      }

      if (associateby_pattern_expr !== null) {
        assert.ok(associateby_pattern_expr.kind === SynxExprKind.PATTERN_PAIR);
      }

      let partial = {
        sub_nodes: sub_nodes,
        neg_flags: neg_flags,
        associateby: associateby_pattern_expr?.value,
        ignore: ignore_pattern_expr?.value
      }

      ret = {
        kind: SynxExprKind.PATTERN,
        value: completePatternSet(partial)
      };
    }

    this.expr_to_ast_node_map.set(ret, node);
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
    } else if (parser_node === SYNX_PARSER_NODE.PatternSet) {
      ret = this.parsePatternSet(node);
    } else {
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

  /**
   * 不会eval prefix_op，如果无法eval则返回原值
   */
  evalPatternWithUnaryOpExpr(pattern_wtih_unary_op_expr: SynxPatternWithUnaryOpExpr): SynxPatternExpr | SynxPatternWithUnaryOpExpr {
    const parsed_pattern = pattern_wtih_unary_op_expr.pattern.value;
    const postfix_op = pattern_wtih_unary_op_expr.postfix_op;
    let sub_quantifiers = " ";
    if (postfix_op !== null) {
      if (postfix_op.length !== 1) {
        return pattern_wtih_unary_op_expr;
      }
      sub_quantifiers = postfix_op;
    }

    let partial = {
      sub_nodes: [parsed_pattern],
      sub_quantifiers: sub_quantifiers
    };

    return {
      kind: SynxExprKind.PATTERN,
      value: completePatternSeq(partial)
    };
  }

  parseTopLevelPattern(node: AstNode): SynxPatternExpr | SynxErrorExpr {
    const parser_node = node.parser_nodes[0];
    if (parser_node === SYNX_PARSER_NODE.PatternWithUnaryOp) {
      let ret: SynxPatternExpr | null = null;
      const pattern_with_unary_op_expr = this.parsePatternWithUnaryOp(node);
      if (pattern_with_unary_op_expr.kind === SynxExprKind.PATTERN_WITH_UNARY_OP) {
        if (pattern_with_unary_op_expr.prefix_op !== '-') {
          let pattern_eval = this.evalPatternWithUnaryOpExpr(pattern_with_unary_op_expr);
          if (pattern_eval.kind == SynxExprKind.PATTERN) {
            ret = pattern_eval;
          }
        }
        if (ret == null) {
          return {
            kind: SynxExprKind.ERROR_TOP_LEVEL_PATTERN,
            value: pattern_with_unary_op_expr
          }
        } else {
          this.expr_to_ast_node_map.set(ret, node);
          return ret;
        }
      } else {
        return pattern_with_unary_op_expr;
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


