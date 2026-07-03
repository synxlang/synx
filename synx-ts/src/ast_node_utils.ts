import { AstNode } from "./common";

/**
 * 遍历node，每个node只遍历一次，通过递归访问raw_value拿到所有的node
 */
function* iterAstNode(node: AstNode): Generator<AstNode> {
    throw "todo";
}

/**
 * 将node中所有可引用到包括可间接引用到的AstNode按ref_map进行替换
 */
function replaceAstNodeRef(node: AstNode, ref_map: Map<AstNode, AstNode>) {
    throw "todo";
}

/**
 * 将parser_nodes中的ParserNode简单替换为name
 */
function replaceParserNodeToStringInAstNode(node: AstNode) {
    throw "todo";
}

export function stringifyAstNode(node: AstNode) {
    let all_nodes = Array.from(iterAstNode(node));
    let all_node_copies: AstNode[] = [];
    let node_ref_map = new Map<AstNode, AstNode>();
    // TODO: 浅拷贝all_nodes到all_node_copies并设置node_ref_map
    for (let node of all_node_copies) {
        replaceParserNodeToStringInAstNode(node);
    }
    replaceAstNodeRef(node, node_ref_map);
    return JSON.stringify(node);
}