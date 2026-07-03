import { ParserNode } from "./parser_node";

/**
 * 按dfs遍历所有可达node，需要确保没重复遍历
 */
function* dfsParserNodes(nodes: ParserNode[]): Generator<ParserNode> {
    throw "todo";
}

/**
 * 给每个node一个id，默认用node.name，如果有重复则name+数字的方式给id
 */
export function assignParserNodeIds(nodes: ParserNode[]): Map<ParserNode, string> {
    throw "todo";
}


/**
 * 将node中所有的ParserNode根据symbol_table换成UnresolvedPattern
 */
export function replaceParserNodeToSymbol(node: ParserNode, id_map: Map<ParserNode, string>): ParserNode {
    throw "todo";
}

