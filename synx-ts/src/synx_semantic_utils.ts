import { SynxExpr } from "./synx_semantic_parser";


export function stringifySynxExpr(expr: SynxExpr): string {
    let expr_copy;
    // TODO: 计算expr_copy，递归遍历复制并且把SynxUnknownExpr中的value换成由AstNode中的range得出的字符串即可。
    return JSON.stringify(expr_copy, null, 2);
}

