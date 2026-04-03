/**
 *   npx tsc && node dist/test/manual_test/draft/parser_manual_sample.js
 */
import { inspect } from "node:util";
import { type ASTNode, mkParser, ParseResultKind } from "../../../src/parser";
import { mkCharRange, mkCharSet, mkPatternSeq } from "../../../src/parser_node";


function isAstNode(x: unknown): x is ASTNode {
    return (
        typeof x === "object" &&
        x !== null &&
        "parser_nodes" in x &&
        "range" in x &&
        "value" in x &&
        "raw_value" in x
    );
}

function extractAstValue(node: ASTNode): any {
    const peel = (v: unknown): any => {
        if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            return v;
        }
        if (Array.isArray(v)) {
            return v.map(peel);
        }
        if (isAstNode(v)) {
            return extractAstValue(v);
        }
        return v;
    };
    return peel(node.value);
}

const inspectOpts = { depth: null, colors: true } as const;
const root = mkPatternSeq([mkCharRange("0", "9"), mkCharSet([mkCharRange("a", "z")])], "  ");
const input = { src: "5a", pos: 0 };
const parser = mkParser({ parser_nodes: [root] });
const result = parser.parse({ ...input }, root);

console.log("input:", input);
console.log("kind:", ParseResultKind[result.kind], "| end_pos:", result.end_pos);

console.log("---raw result---");
console.log(inspect(result, inspectOpts));

console.log("--- extractAstValue ---");
console.log(
    inspect(
        result.ast_nodes.length === 1
            ? extractAstValue(result.ast_nodes[0]!)
            : result.ast_nodes.map(extractAstValue),
        inspectOpts,
    ),
);
