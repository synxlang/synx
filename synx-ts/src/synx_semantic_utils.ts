import { SynxExpr, SynxExprKind, SynxUnknownExpr, SynxRootExpr, SynxParserNodeExpr, SynxAssignmentExpr, SynxErrorRangeExpr, SynxAssignmentValueExpr } from "./synx_semantic_parser";
import { stringifyAstNode } from "./ast_node_utils";

function synxExprToJson(expr: SynxExpr, cache: Map<SynxExpr, any>): any {
    const cached = cache.get(expr);
    if (cached !== undefined) return cached;
    let result: any;
    switch (expr.kind) {
        case SynxExprKind.UNKNOWN: {
            const node = (expr as SynxUnknownExpr).value;
            result = { kind: "UNKNOWN", value: JSON.parse(stringifyAstNode(node)) };
            break;
        }
        case SynxExprKind.ROOT:
            result = { kind: "ROOT", value: (expr as SynxRootExpr).value.map(sub => synxExprToJson(sub, cache)) };
            break;
        case SynxExprKind.PARSER_NODE:
            result = { kind: "PARSER_NODE", value: expr.value };
            break;
        case SynxExprKind.ASSIGNMENT:
            result = { kind: "ASSIGNMENT", target: (expr as SynxAssignmentExpr).target, value: synxExprToJson((expr as SynxAssignmentExpr).value, cache) };
            break;
        case SynxExprKind.ERROR_RANGE:
            result = { kind: "ERROR_RANGE", value: (expr as SynxErrorRangeExpr).value };
            break;
    }
    cache.set(expr, result);
    return result;
}

export function stringifySynxExpr(expr: SynxExpr): string {
    return JSON.stringify(synxExprToJson(expr, new Map()), null, 2);
}

export function stringifySynxExprSymbolTable(symbol_table: Map<string, SynxAssignmentValueExpr>): string {
    const cache = new Map<SynxExpr, any>();
    const obj: Record<string, any> = {};
    for (const [key, value] of symbol_table) {
        obj[key] = synxExprToJson(value, cache);
    }
    return JSON.stringify(obj, null, 2);
}