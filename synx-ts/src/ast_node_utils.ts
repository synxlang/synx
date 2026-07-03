import { AstNode } from "./common";

/**
 * 遍历node，每个node只遍历一次，通过递归访问raw_value拿到所有的node
 */
function* iterAstNode(node: AstNode): Generator<AstNode> {
    const visited = new Set<AstNode>();
    function* walk(n: AstNode): Generator<AstNode> {
        if (visited.has(n)) return;
        visited.add(n);
        yield n;
        if (Array.isArray(n.raw_value)) {
            for (const item of n.raw_value) {
                if (item === null) continue;
                if (Array.isArray(item)) {
                    for (const sub of item) {
                        if (sub !== null) yield* walk(sub);
                    }
                } else {
                    yield* walk(item);
                }
            }
        }
    }
    yield* walk(node);
}

/**
 * 将node中所有可引用到包括可间接引用到的AstNode按ref_map进行替换
 */
function replaceAstNodeRef(node: AstNode, ref_map: Map<AstNode, AstNode>) {
    function walk(obj: any): void {
        if (obj === null || obj === undefined || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i];
                if (ref_map.has(item)) {
                    obj[i] = ref_map.get(item)!;
                } else {
                    walk(obj[i]);
                }
            }
        } else {
            for (const key of Object.keys(obj)) {
                if (key === 'parser_nodes') continue;
                const item = obj[key];
                if (ref_map.has(item)) {
                    obj[key] = ref_map.get(item)!
                } else {
                    walk(obj[key]);
                }
            }
        }
    }

    walk(node);
}

/**
 * 将parser_nodes中的ParserNode简单替换为name
 */
function replaceParserNodeToStringInAstNode(node: AstNode) {
    node.parser_nodes = node.parser_nodes.map(p => p.name) as any;
}

export function stringifyAstNode(node: AstNode) {
    let all_nodes = Array.from(iterAstNode(node));
    const node_set = new Set(all_nodes);
    let all_node_copies: AstNode[] = [];
    let node_ref_map = new Map<AstNode, AstNode>();

    function cloneArray(arr: (AstNode | AstNode[] | null)[]): (AstNode | AstNode[] | null)[] {
        return arr.map(item => item !== null && Array.isArray(item) ? item.slice() : item);
    }

    function cloneValue(val: any): any {
        if (val === null || val === undefined || typeof val !== 'object') return val;
        if (node_set.has(val)) return val;
        if (Array.isArray(val)) return cloneArray(val);
        const result: any = {};
        for (const key of Object.keys(val)) {
            result[key] = cloneValue(val[key]);
        }
        return result;
    }

    function cloneBindings(b: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const key of Object.keys(b)) {
            result[key] = cloneValue(b[key]);
        }
        return result;
    }

    function cloneNode(n: AstNode): any {
        const copy: any = { parser_nodes: n.parser_nodes.slice(), range: n.range };
        copy.value = cloneValue(n.value);
        if (n.seps.length > 0) copy.seps = n.seps.slice();
        const b = cloneBindings(n.bindings);
        if (Object.keys(b).length > 0) copy.bindings = b;
        if (n.enclosure) copy.enclosure = [n.enclosure[0], n.enclosure[1]];
        if (n.associate_enclosures) {
            copy.associate_enclosures = [n.associate_enclosures[0].slice(), n.associate_enclosures[1].slice()];
        }
        return copy;
    }

    for (const n of all_nodes) {
        const copy = cloneNode(n);
        all_node_copies.push(copy);
        node_ref_map.set(n, copy);
    }

    for (const copy of all_node_copies) {
        replaceAstNodeRef(copy, node_ref_map);
        replaceParserNodeToStringInAstNode(copy as AstNode);
    }

    return JSON.stringify(all_node_copies[0]);
}
