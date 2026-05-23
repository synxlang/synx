/**
 * Manual observation script for a four-arithmetic-expression grammar.
 * 手工观察四则运算表达式语法。
 *
 *   npm run build && node dist/test/manual_test/draft/parser_test_arithmetic.js
 *
 * If a TypeScript runner is installed:
 *   npx tsx test/manual_test/draft/parser_test_arithmetic.ts
 */
import type { ASTNode } from "../../../src/parser";
import { ParserImpl } from "../../../src/parser_impl";
import { SynxFmt } from "../../../src/synx_fmt";
import { completeCharRange, completeCharSeq, completePatternSeq, completePatternSet, ParserNodeKind, type ParserNode, type PatternSeq, type PatternSet } from "../../../src/parser_node";
function incompletePatternSet(overrides: Partial<PatternSet> = {}): PatternSet {
    return {
        kind: ParserNodeKind.PatternSet,
        sub_nodes: [],
        neg_flags: [],
        charset_flag: false,
        associateby: null,
        ignore: null,
        ...overrides,
    };
}
const Digit = completeCharRange({ start: "0", end: "9" });
const Space = completeCharSeq({ literal: " " });
const Plus = completeCharSeq({ literal: "+" });
const Minus = completeCharSeq({ literal: "-" });
const Star = completeCharSeq({ literal: "*" });
const Slash = completeCharSeq({ literal: "/" });
const LeftParen = completeCharSeq({ literal: "(" });
const RightParen = completeCharSeq({ literal: ")" });
const NumberLiteral: PatternSeq = completePatternSeq({ sub_nodes: [Digit], sub_quantifiers: "+", raw: true });
const AddOp = completePatternSet({ sub_nodes: [Plus, Minus] });
const MulOp = completePatternSet({ sub_nodes: [Star, Slash] });
const Expr: PatternSet = incompletePatternSet({ associateby: [LeftParen, RightParen], ignore: Space });
const Factor: PatternSet = incompletePatternSet();
const ProductTail: PatternSeq = completePatternSeq({ sub_nodes: [MulOp, Factor], sub_quantifiers: "  ", raw: false, sep: null, accept_trailing_sep: false, ignore: Space });
const Product: PatternSeq = completePatternSeq({ sub_nodes: [Factor, ProductTail], sub_quantifiers: " *", raw: false, sep: null, accept_trailing_sep: false, ignore: Space });
const SumTail: PatternSeq = completePatternSeq({ sub_nodes: [AddOp, Product], sub_quantifiers: "  ", raw: false, sep: null, accept_trailing_sep: false, ignore: Space });
const Sum: PatternSeq = completePatternSeq({ sub_nodes: [Product, SumTail], sub_quantifiers: " *", raw: false, sep: null, accept_trailing_sep: false, ignore: Space });
Expr.sub_nodes.push(Sum as unknown as ParserNode);
Expr.neg_flags.push(false);
Factor.sub_nodes.push(NumberLiteral as unknown as ParserNode, Expr as unknown as ParserNode);
Factor.neg_flags.push(false, false);
interface CaseDef {
    id: number;
    name: string;
    src: string;
    note: string;
    expected_value?: number;
}
function nodeText(src: string, node: ASTNode): string {
    return src.slice(node.range[0], node.range[1]);
}
function flattenAstNodes(slot: ASTNode[] | ASTNode | null): ASTNode[] {
    if (slot === null) {
        return [];
    }
    return Array.isArray(slot) ? slot : [slot];
}
function compactNode(src: string, node: ASTNode): object {
    return {
        range: node.range,
        text: nodeText(src, node),
        parser_node_count: node.parser_nodes.length,
        seps: node.seps.map((sep) => nodeText(src, sep)),
        associate_enclosures: node.associate_enclosures === null
            ? null
            : [
                node.associate_enclosures[0].map((left) => nodeText(src, left)),
                node.associate_enclosures[1].map((right) => nodeText(src, right)),
            ],
    };
}
function collectNodesByParserNode(root: ASTNode, target: ParserNode): ASTNode[] {
    const ret: ASTNode[] = [];
    const visit = (node: ASTNode): void => {
        if (node.parser_nodes.includes(target)) {
            ret.push(node);
        }
        if (Array.isArray(node.raw_value)) {
            for (const child of node.raw_value) {
                for (const childNode of flattenAstNodes(child)) {
                    visit(childNode);
                }
            }
        }
    };
    visit(root);
    return ret;
}
function printInputIndex(src: string): void {
    console.log([...src].map((ch, i) => `${i}:${JSON.stringify(ch)}`).join("  "), "| utf16_len=", src.length);
}
function parseCaseRoot(src: string): {
    parser: ParserImpl;
    result: ASTNode | null;
} {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src, pos: 0 });
    return {
        parser,
        result: parser.parsePatternSeq(Sum),
    };
}
function asAstNode(value: ASTNode[] | ASTNode | null, label: string): ASTNode {
    if (value === null || Array.isArray(value)) {
        throw new Error(`${label}: expected one ASTNode`);
    }
    return value;
}
function asAstNodeArray(value: ASTNode[] | ASTNode | null, label: string): ASTNode[] {
    if (value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error(`${label}: expected ASTNode[]`);
    }
    return value;
}
function evalOperator(node: ASTNode): string {
    if (typeof node.value !== "string") {
        throw new Error(`operator is not string at range ${node.range.join(":")}`);
    }
    return node.value;
}
function evalFactor(node: ASTNode): number {
    if (node.parser_nodes.includes(NumberLiteral)) {
        return Number(node.value);
    }
    if (node.parser_nodes.includes(Expr) || node.parser_nodes.includes(Sum)) {
        return evalSum(node);
    }
    throw new Error(`unknown Factor shape at range ${node.range.join(":")}`);
}
function evalProductTail(node: ASTNode): {
    op: string;
    value: number;
} {
    const [opSlot, factorSlot] = node.raw_value as [
        ASTNode | null,
        ASTNode | null
    ];
    const op = evalOperator(asAstNode(opSlot, "ProductTail op"));
    const value = evalFactor(asAstNode(factorSlot, "ProductTail factor"));
    return { op, value };
}
function evalProduct(node: ASTNode): number {
    const [firstSlot, tailSlot] = node.raw_value as [
        ASTNode | null,
        ASTNode[] | null
    ];
    let value = evalFactor(asAstNode(firstSlot, "Product first factor"));
    for (const tail of asAstNodeArray(tailSlot, "Product tails")) {
        const item = evalProductTail(tail);
        if (item.op === "*") {
            value *= item.value;
        }
        else if (item.op === "/") {
            value /= item.value;
        }
        else {
            throw new Error(`unknown product operator: ${item.op}`);
        }
    }
    return value;
}
function evalSumTail(node: ASTNode): {
    op: string;
    value: number;
} {
    const [opSlot, productSlot] = node.raw_value as [
        ASTNode | null,
        ASTNode | null
    ];
    const op = evalOperator(asAstNode(opSlot, "SumTail op"));
    const value = evalProduct(asAstNode(productSlot, "SumTail product"));
    return { op, value };
}
function evalSum(node: ASTNode): number {
    const [firstSlot, tailSlot] = node.raw_value as [
        ASTNode | null,
        ASTNode[] | null
    ];
    let value = evalProduct(asAstNode(firstSlot, "Sum first product"));
    for (const tail of asAstNodeArray(tailSlot, "Sum tails")) {
        const item = evalSumTail(tail);
        if (item.op === "+") {
            value += item.value;
        }
        else if (item.op === "-") {
            value -= item.value;
        }
        else {
            throw new Error(`unknown sum operator: ${item.op}`);
        }
    }
    return value;
}
function runCase(c: CaseDef): void {
    const { parser, result } = parseCaseRoot(c.src);
    console.log("\n" + "=".repeat(90));
    console.log(`#${c.id}: ${c.name}`);
    console.log(c.note);
    console.log("\n--- grammar sketch ---");
    console.log('Expr={ Sum; } \\associateby ("(", ")") \\ignore Space');
    console.log("Sum=(Product, (AddOp, Product)* \\ignore Space)");
    console.log("Product=(Factor, (MulOp, Factor)* \\ignore Space)");
    console.log("Factor={ NumberLiteral; Expr; }");
    console.log("\n--- input index ---");
    printInputIndex(c.src);
    console.log("\n--- parse state ---");
    console.log(SynxFmt.stringify({
        isSuccess: parser.isSuccess(),
        error: parser.getError(),
        end_pos: parser.input.pos,
        consumed_range: [0, parser.input.pos],
        tail_range: [parser.input.pos, c.src.length],
        result_is_null: result === null,
    }));
    console.log("\n--- consumed raw text ---");
    console.log(c.src.slice(0, parser.input.pos));
    console.log("\n--- tail raw text ---");
    console.log(c.src.slice(parser.input.pos));
    if (result === null) {
        return;
    }
    const products = collectNodesByParserNode(result, Product);
    const sumTails = collectNodesByParserNode(result, SumTail);
    const productTails = collectNodesByParserNode(result, ProductTail);
    const factors = collectNodesByParserNode(result, Factor);
    const exprs = collectNodesByParserNode(result, Expr);
    let evaluated_value: number | string;
    try {
        evaluated_value = evalSum(result);
    }
    catch (err) {
        evaluated_value = err instanceof Error ? `ERROR: ${err.message}` : String(err);
    }
    console.log("\n--- compact observation ---");
    console.log(SynxFmt.stringify({
        sum: compactNode(c.src, result),
        evaluated_value,
        expected_value: c.expected_value ?? null,
        expected_match: c.expected_value === undefined
            ? null
            : typeof evaluated_value === "number" && Math.abs(evaluated_value - c.expected_value) < 1e-9,
        expr_count: exprs.length,
        exprs: exprs.map((node) => compactNode(c.src, node)),
        product_count: products.length,
        products: products.map((node) => compactNode(c.src, node)),
        sum_tail_count: sumTails.length,
        sum_tails: sumTails.map((node) => compactNode(c.src, node)),
        product_tail_count: productTails.length,
        product_tails: productTails.map((node) => compactNode(c.src, node)),
        factor_count: factors.length,
        factors: factors.map((node) => compactNode(c.src, node)),
    }));
    if (simple_print) {
        return;
    }
    console.log("\n--- raw AST ---");
    console.log(SynxFmt.stringify(result));
}
const cases: CaseDef[] = [
    {
        id: 1,
        name: "Single number",
        src: "123 tail",
        note: "Observe the minimal path NumberLiteral -> Factor -> Product -> Sum and the unconsumed tail.",
        expected_value: 123,
    },
    {
        id: 2,
        name: "Addition and subtraction chain",
        src: "1+2-3 tail",
        note: "Observe AddOp separators collected on Sum while each term is a Product.",
        expected_value: 0,
    },
    {
        id: 3,
        name: "Multiplication and division chain",
        src: "2*3/4 tail",
        note: "Observe MulOp separators collected on Product without Sum-level separators.",
        expected_value: 1.5,
    },
    {
        id: 4,
        name: "Precedence by grammar layering",
        src: "1+2*3-4/5 tail",
        note: "Observe Sum separators split Products, and each Product keeps its own MulOp chain.",
        expected_value: 6.2,
    },
    {
        id: 5,
        name: "Parenthesized expression",
        src: "(1+2)*3 tail",
        note: "Observe Factor.associate_enclosures recording the parentheses around the inner Sum.",
        expected_value: 9,
    },
    {
        id: 6,
        name: "Parenthesized factors with spaces",
        src: "(1 + 2) * (3 - 4) / 5 tail",
        note: "Observe associate_enclosures and Space ignore around delimiters and operators.",
        expected_value: -0.6,
    },
    {
        id: 7,
        name: "Partial expression stops before invalid operator",
        src: "1+*2 tail",
        note: "Observe the parser consuming the valid prefix and leaving the invalid tail for inspection.",
        expected_value: 1,
    },
];
const AllTestCaseIds = cases.map((c) => c.id);
let TestCaseIds = AllTestCaseIds;
const simple_print = true;
console.log("Manual arithmetic parser observation: inspect ranges, separators, enclosures, and raw AST.");
for (const id of TestCaseIds) {
    const c = cases.find((item) => item.id === id);
    if (c === undefined) {
        console.log(`\nMissing test case id: ${id}`);
        continue;
    }
    runCase(c);
}
