import { SynxExpr, SynxExprKind, SynxUnknownExpr, SynxPatternExpr, SynxAssignmentExpr, SynxSemanticSymbolTable, SynxPatternWithUnaryOpExpr, SynxErrorPatternSetExpr, SynxErrorPatternWithUnaryOpExpr, SynxErrorTopLevelPatternExpr } from "./synx_semantic_parser";
import { stringifyAstNode } from "./ast_node_utils";

function stringifySynxExprKind(kind: SynxExprKind): string {
    switch (kind) {
        case SynxExprKind.ROOT: return "ROOT";
        case SynxExprKind.ASSIGNMENT: return "ASSIGNMENT";
        case SynxExprKind.PATTERN: return "PATTERN";
        case SynxExprKind.PATTERN_WITH_UNARY_OP: return "PATTERN_WITH_UNARY_OP";
        case SynxExprKind.UNKNOWN: return "UNKNOWN";
        case SynxExprKind.ERROR_RANGE: return "ERROR_RANGE";
        case SynxExprKind.ERROR_PATTERN_SET: return "ERROR_PATTERN_SET";
        case SynxExprKind.ERROR_PATTERN_WITH_UNARY_OP: return "ERROR_PATTERN_WITH_UNARY_OP";
        case SynxExprKind.ERROR_TOP_LEVEL_PATTERN: return "ERROR_TOP_LEVEL_PATTERN";
    }
}

function synxExprToJson(expr: SynxExpr, cache: Map<SynxExpr, any>): any {
    const cached = cache.get(expr);
    if (cached !== undefined) return cached;
    const kind_str = stringifySynxExprKind(expr.kind);
    let result: any;
    switch (expr.kind) {
        case SynxExprKind.UNKNOWN:
            result = { kind: kind_str, value: JSON.parse(stringifyAstNode((expr as SynxUnknownExpr).value)) };
            break;
        case SynxExprKind.PATTERN:
            result = { kind: kind_str, value: JSON.parse(JSON.stringify((expr as SynxPatternExpr).value)) };
            break;
        case SynxExprKind.ASSIGNMENT:
            result = { kind: kind_str, target: (expr as SynxAssignmentExpr).target, value: synxExprToJson((expr as SynxAssignmentExpr).value, cache) };
            break;
        case SynxExprKind.PATTERN_WITH_UNARY_OP: {
            const e = expr as SynxPatternWithUnaryOpExpr;
            result = { kind: kind_str, pattern: synxExprToJson(e.pattern, cache), prefix_op: e.prefix_op, postfix_op: e.postfix_op };
            break;
        }
        case SynxExprKind.ERROR_PATTERN_SET: {
            const e = expr as SynxErrorPatternSetExpr;
            result = { kind: kind_str, patterns: e.patterns.map(p => synxExprToJson(p, cache)), associateby: e.associateby ? synxExprToJson(e.associateby, cache) : null, ignore: e.ignore ? synxExprToJson(e.ignore, cache) : null };
            break;
        }
        case SynxExprKind.ERROR_PATTERN_WITH_UNARY_OP: {
            const e = expr as SynxErrorPatternWithUnaryOpExpr;
            result = { kind: kind_str, pattern: synxExprToJson(e.pattern, cache), prefix_op: e.prefix_op, postfix_op: e.postfix_op };
            break;
        }
        case SynxExprKind.ERROR_TOP_LEVEL_PATTERN: {
            const e = expr as SynxErrorTopLevelPatternExpr;
            result = { kind: kind_str, value: synxExprToJson(e.value, cache) };
            break;
        }
        default:
            result = { ...expr, kind: kind_str };
    }
    cache.set(expr, result);
    return result;
}

export function stringifySynxExpr(expr: SynxExpr): string {
    return JSON.stringify(synxExprToJson(expr, new Map()), null, 2);
}

export function stringifySynxExprSymbolTable(symbol_table: SynxSemanticSymbolTable): string {
    const cache = new Map<SynxExpr, any>();
    const obj: Record<string, any> = {};
    for (const [key, value] of symbol_table) {
        obj[key] = synxExprToJson(value, cache);
    }
    return JSON.stringify(obj, null, 2);
}