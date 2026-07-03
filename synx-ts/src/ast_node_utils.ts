import { AstNode } from "./common";

/**
 * 遍历node，每个node只遍历一次，通过递归访问raw_value拿到所有的node
 */
function* iterAstNode(node: AstNode): Generator<AstNode> {
    const visited = new Set<AstNode>();
    const stack: AstNode[] = [node];
    while (stack.length > 0) {
        const n = stack.pop()!;
        if (visited.has(n)) continue;
        visited.add(n);
        yield n;

        if (Array.isArray(n.raw_value)) {
            for (const item of n.raw_value) {
                if (item === null) continue;
                if (Array.isArray(item)) {
                    stack.push(...item.filter((x): x is AstNode => x !== null));
                } else {
                    stack.push(item);
                }
            }
        }

        for (const sep of n.seps) stack.push(sep);
        if (n.enclosure !== null) { stack.push(n.enclosure[0]); stack.push(n.enclosure[1]); }
        if (n.associate_enclosures !== null) { stack.push(...n.associate_enclosures[0], ...n.associate_enclosures[1]); }
    }
}

/**
 * 将node中所有可引用到包括可间接引用到的AstNode按ref_map进行替换
 */
function replaceAstNodeRef(node: AstNode, ref_map: Map<AstNode, AstNode>) {
    const visited = new Set<AstNode>();

    function process(n: AstNode): void {
        if (visited.has(n)) return;
        visited.add(n);

        function replaceItem(item: any): any {
            return item !== null && typeof item === 'object' && ref_map.has(item)
                ? ref_map.get(item)!
                : item;
        }

        function processEntry(val: any): void {
            if (val === null || val === undefined || typeof val === 'string') return;
            if (Array.isArray(val)) {
                for (let i = 0; i < val.length; i++) {
                    const el = val[i];
                    if (el === null) continue;
                    if (Array.isArray(el)) {
                        processEntry(el);
                        continue;
                    }
                    const replaced = replaceItem(el);
                    val[i] = replaced;
                    if ('parser_nodes' in replaced) process(replaced);
                }
            } else if (typeof val === 'object') {
                for (const key of Object.keys(val)) {
                    processEntry(val[key]);
                }
            }
        }

        processEntry(n.value);
        processEntry(n.raw_value);

        for (let i = 0; i < n.seps.length; i++) {
            const replaced = replaceItem(n.seps[i]);
            n.seps[i] = replaced;
            process(replaced);
        }

        if (n.enclosure !== null) {
            for (let i = 0; i < 2; i++) {
                const replaced = replaceItem(n.enclosure[i]);
                n.enclosure[i] = replaced;
                process(replaced);
            }
        }

        if (n.associate_enclosures !== null) {
            for (const arr of n.associate_enclosures) {
                for (let i = 0; i < arr.length; i++) {
                    const replaced = replaceItem(arr[i]);
                    arr[i] = replaced;
                    process(replaced);
                }
            }
        }
    }

    process(node);
}

/**
 * 将parser_nodes中的ParserNode简单替换为name
 */
function replaceParserNodeToStringInAstNode(node: AstNode) {
    node.parser_nodes = node.parser_nodes.map(p => p.name) as any;
}

export function stringifyAstNode(node: AstNode) {
    let all_nodes = Array.from(iterAstNode(node));
    let all_node_copies: AstNode[] = [];
    let node_ref_map = new Map<AstNode, AstNode>();
    for (const n of all_nodes) {
        const copy = { ...n };
        all_node_copies.push(copy);
        node_ref_map.set(n, copy);
    }
    replaceAstNodeRef(node, node_ref_map);
    for (let node of all_node_copies) {
        replaceParserNodeToStringInAstNode(node);
    }
    return JSON.stringify(node);
}