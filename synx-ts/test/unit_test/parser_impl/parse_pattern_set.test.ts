import { strict as assert } from 'assert';
import { ParserImpl } from '../../../src/parser_impl';
import { AnyChar, completeCharSeq, completeCharRange, completePatternSeq, completePatternSet } from '../../../src/parser_node';
import type { PatternSet, ParserNode } from '../../../src/parser_node';
import type { ASTNode, ParserInput } from '../../../src/parser';
function test_parsePatternSet_basic(): void {
    const set: PatternSet = completePatternSet({ sub_nodes: [completeCharSeq({ literal: 'ab' }), completeCharSeq({ literal: 'a' })] });
    const cases: Array<{
        id: number;
        input: ParserInput;
        expected: ASTNode | null;
        expected_error: boolean;
    }> = [
        {
            id: 1,
            input: { src: 'ab', pos: 0 },
            expected: {
                parser_nodes: [set.sub_nodes[0] as ParserNode, set],
                range: [0, 2],
                value: 'ab',
                raw_value: 'ab',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            },
            expected_error: false,
        },
        {
            id: 2,
            input: { src: 'a', pos: 0 },
            expected: {
                parser_nodes: [set.sub_nodes[1] as ParserNode, set],
                range: [0, 1],
                value: 'a',
                raw_value: 'a',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            },
            expected_error: false,
        },
        { id: 3, input: { src: 'x', pos: 0 }, expected: null, expected_error: true },
    ];
    for (const c of cases) {
        const parser = new ParserImpl({ parser_nodes: [] });
        parser.initParse(c.input);
        const result = parser.parseSingleNode(set);
        assert.deepStrictEqual(result, c.expected, `case ${c.id} AST mismatch`);
        if (!parser.isSuccess()) {
            assert.strictEqual(c.expected_error, parser.getError() !== null, `case ${c.id} error flag mismatch`);
            continue;
        }
    }
}
function test_parsePatternSet_direct_char_match_alt(): void {
    const lower = completeCharRange({ start: 'a', end: 'z' });
    const fallback = completeCharSeq({ literal: 'ab' });
    const set: PatternSet = completePatternSet({ sub_nodes: [lower, fallback] });
    assert.strictEqual(set.charset_flag, false);
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: 'a', pos: 0 });
    const result = parser.parsePatternSet(set);
    assert(parser.isSuccess());
    assert.deepStrictEqual(result, {
        parser_nodes: [lower, set],
        range: [0, 1],
        value: 'a',
        raw_value: 'a',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
}
function test_parsePatternSet_associateby(): void {
    const A = completeCharSeq({ literal: 'a' });
    const Left = completeCharSeq({ literal: '(' });
    const Right = completeCharSeq({ literal: ')' });
    const set: PatternSet = completePatternSet({ sub_nodes: [A], neg_flags: undefined, associateby: [Left, Right] });
    const leaf = (parser_nodes: ParserNode[], start: number, end: number, value: string): ASTNode => ({
        parser_nodes,
        range: [start, end],
        value,
        raw_value: value,
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const cases: Array<{
        id: number;
        input: ParserInput;
        expected: ASTNode | null;
        expected_pos: number;
        expected_success: boolean;
    }> = [
        {
            id: 1,
            input: { src: 'a', pos: 0 },
            expected: leaf([A, set], 0, 1, 'a'),
            expected_pos: 1,
            expected_success: true,
        },
        {
            id: 2,
            input: { src: '(a)', pos: 0 },
            expected: {
                ...leaf([A, set], 0, 3, 'a'),
                associate_enclosures: [[leaf([Left], 0, 1, '(')], [leaf([Right], 2, 3, ')')]],
            },
            expected_pos: 3,
            expected_success: true,
        },
        {
            id: 3,
            input: { src: '((a))', pos: 0 },
            expected: {
                ...leaf([A, set], 0, 5, 'a'),
                associate_enclosures: [
                    [leaf([Left], 0, 1, '('), leaf([Left], 1, 2, '(')],
                    [leaf([Right], 3, 4, ')'), leaf([Right], 4, 5, ')')],
                ],
            },
            expected_pos: 5,
            expected_success: true,
        },
        {
            id: 4,
            input: { src: '(x)', pos: 0 },
            expected: null,
            expected_pos: 0,
            expected_success: false,
        },
    ];
    for (const c of cases) {
        const parser = new ParserImpl({ parser_nodes: [] });
        parser.initParse(c.input);
        const result = parser.parseSingleNode(set);
        assert.deepStrictEqual(result, c.expected, `case ${c.id} AST mismatch`);
        assert.strictEqual(parser.input.pos, c.expected_pos, `case ${c.id} pos mismatch`);
        assert.strictEqual(parser.isSuccess(), c.expected_success, `case ${c.id} success mismatch`);
    }
}
function test_parsePatternSet_associateby_ignore(): void {
    const A = completeCharSeq({ literal: 'a' });
    const Left = completeCharSeq({ literal: '(' });
    const Right = completeCharSeq({ literal: ')' });
    const Space = completeCharSeq({ literal: ' ' });
    const set: PatternSet = completePatternSet({ sub_nodes: [A], neg_flags: undefined, associateby: [Left, Right], ignore: Space });
    const leaf = (parser_nodes: ParserNode[], start: number, end: number, value: string): ASTNode => ({
        parser_nodes,
        range: [start, end],
        value,
        raw_value: value,
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const cases: Array<{
        id: number;
        input: ParserInput;
        expected: ASTNode | null;
        expected_pos: number;
        expected_success: boolean;
    }> = [
        {
            id: 1,
            input: { src: '(a )', pos: 0 },
            expected: {
                ...leaf([A, set], 0, 4, 'a'),
                associate_enclosures: [[leaf([Left], 0, 1, '(')], [leaf([Right], 3, 4, ')')]],
            },
            expected_pos: 4,
            expected_success: true,
        },
        {
            id: 2,
            input: { src: '( a )', pos: 0 },
            expected: {
                ...leaf([A, set], 0, 5, 'a'),
                associate_enclosures: [[leaf([Left], 0, 1, '(')], [leaf([Right], 4, 5, ')')]],
            },
            expected_pos: 5,
            expected_success: true,
        },
        {
            id: 3,
            input: { src: ' (a )', pos: 0 },
            expected: null,
            expected_pos: 0,
            expected_success: false,
        },
        {
            id: 4,
            input: { src: '( (a) )', pos: 0 },
            expected: {
                ...leaf([A, set], 0, 7, 'a'),
                associate_enclosures: [
                    [leaf([Left], 0, 1, '('), leaf([Left], 2, 3, '(')],
                    [leaf([Right], 4, 5, ')'), leaf([Right], 6, 7, ')')],
                ],
            },
            expected_pos: 7,
            expected_success: true,
        },
    ];
    for (const c of cases) {
        const parser = new ParserImpl({ parser_nodes: [] });
        parser.initParse(c.input);
        const result = parser.parseSingleNode(set);
        assert.deepStrictEqual(result, c.expected, `case ${c.id} AST mismatch`);
        assert.strictEqual(parser.input.pos, c.expected_pos, `case ${c.id} pos mismatch`);
        assert.strictEqual(parser.isSuccess(), c.expected_success, `case ${c.id} success mismatch`);
    }
}
function test_parsePatternSet_alternative_precedes_associateby(): void {
    const A = completeCharSeq({ literal: 'a' });
    const Left = completeCharSeq({ literal: '(' });
    const Right = completeCharSeq({ literal: ')' });
    const set: PatternSet = completePatternSet({ sub_nodes: [Left, A], associateby: [Left, Right] });
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: '(a)', pos: 0 });
    const result = parser.parseSingleNode(set);
    assert(parser.isSuccess());
    assert.strictEqual(parser.input.pos, 1);
    assert.deepStrictEqual(result, {
        parser_nodes: [Left, set],
        range: [0, 1],
        value: '(',
        raw_value: '(',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
}
function test_parsePatternSet_infinite_recursion_self(): void {
    const set = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    // Self-recursive: attempting the only alternative re-enters the same (node,pos) on the call stack.
    set.sub_nodes.push(set as unknown as ParserNode);
    set.neg_flags.push(false);
    completePatternSet(set);
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: 'x', pos: 0 });
    const result = parser.parseSingleNode(set);
    assert.strictEqual(result, null);
    assert.ok(!parser.isSuccess());
}
function test_parsePatternSet_infinite_recursion_cycle(): void {
    const a = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const b = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    a.sub_nodes.push(b as unknown as ParserNode);
    b.sub_nodes.push(a as unknown as ParserNode);
    a.neg_flags.push(false);
    b.neg_flags.push(false);
    completePatternSet(a);
    completePatternSet(b);
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: 'x', pos: 0 });
    const result = parser.parseSingleNode(a);
    assert.strictEqual(result, null);
    assert.ok(!parser.isSuccess());
}
function test_parsePatternSet_nested_seq_and_set(): void {
    // Synx shape:
    // innerSet = { "ab" ; "a" }
    const innerSet: PatternSet = completePatternSet({ sub_nodes: [completeCharSeq({ literal: 'ab' }), completeCharSeq({ literal: 'a' })] });
    // outerSet = { innerSet ; "x" }
    const outerSet: PatternSet = completePatternSet({ sub_nodes: [innerSet, completeCharSeq({ literal: 'x' })] });
    // seq = outerSet , "!"
    //
    // Equivalent Synx-style pattern (schematically):
    // ( { { "ab" ; "a" } ; "x" } , "!" )
    const bang = completeCharSeq({ literal: '!' });
    const seq = completePatternSeq({ sub_nodes: [outerSet, bang], sub_quantifiers: '  ' });
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: 'ab!', pos: 0 });
    const result = parser.parseSingleNode(seq);
    // Expect: PatternSeq with two children.
    // - child[0] comes from outerSet picking innerSet picking "ab"
    //   flatten rules append sets into parser_nodes of the winning CharSeq.
    assert.deepStrictEqual(result, {
        parser_nodes: [seq],
        range: [0, 3],
        value: [
            {
                parser_nodes: [innerSet.sub_nodes[0] as ParserNode, innerSet, outerSet],
                range: [0, 2],
                value: 'ab',
                raw_value: 'ab',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            },
            {
                parser_nodes: [bang],
                range: [2, 3],
                value: '!',
                raw_value: '!',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            },
        ],
        raw_value: [
            {
                parser_nodes: [innerSet.sub_nodes[0] as ParserNode, innerSet, outerSet],
                range: [0, 2],
                value: 'ab',
                raw_value: 'ab',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            },
            {
                parser_nodes: [bang],
                range: [2, 3],
                value: '!',
                raw_value: '!',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            },
        ],
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    assert(parser.isSuccess());
}
function test_parsePatternSet_infinite_recursion_nested_cycle(): void {
    // Synx shape (schematically; each Seq has 2+ nodes and the cycle is reached via the SECOND node):
    // A = { "q" ; ("x", B) }
    // B = { "r" ; ("y", C) }
    // C = { "s" ; ("z", A) }
    //
    // Note: this would only be detected by node-only recursion checks.
    // Our implementation detects recursion by (node,pos), so we build the input such that the cycle
    // re-enters the same node at the same position (pos=0).
    const a = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const b = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const c = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const q = completeCharSeq({ literal: 'q' });
    const r = completeCharSeq({ literal: 'r' });
    const s = completeCharSeq({ literal: 's' });
    const x = completeCharSeq({ literal: 'x' });
    const y = completeCharSeq({ literal: 'y' });
    const z = completeCharSeq({ literal: 'z' });
    const seqA = completePatternSeq({ sub_nodes: [x, b], sub_quantifiers: '  ' });
    const seqB = completePatternSeq({ sub_nodes: [y, c], sub_quantifiers: '  ' });
    const seqC = completePatternSeq({ sub_nodes: [z, a], sub_quantifiers: '  ' });
    a.sub_nodes.push(q as unknown as ParserNode, seqA as unknown as ParserNode);
    b.sub_nodes.push(r as unknown as ParserNode, seqB as unknown as ParserNode);
    c.sub_nodes.push(s as unknown as ParserNode, seqC as unknown as ParserNode);
    a.neg_flags.push(false, false);
    b.neg_flags.push(false, false);
    c.neg_flags.push(false, false);
    completePatternSet(a);
    completePatternSet(b);
    completePatternSet(c);
    const parser = new ParserImpl({ parser_nodes: [] });
    // Make the first literal fail at pos=0 so the cycle starts immediately at the same position.
    parser.initParse({ src: 'x', pos: 0 });
    const result = parser.parseSingleNode(a);
    assert.strictEqual(result, null);
    // Error message may be set by mandatory callers (e.g. parsePatternSeq / parseNode turning null into "Parse match failed").
    assert(!parser.isSuccess());
    assert.notStrictEqual(parser.getError(), null);
}
/**
 * Left recursion: Expr ::= Expr '+' '1' | '1'
 * First alternative is left-recursive; re-entry at the same `pos` skips to the next index (base case).
 */
function test_parsePatternSet_left_recursive_plus_chain(): void {
    const one = completeCharSeq({ literal: '1' });
    const plus = completeCharSeq({ literal: '+' });
    const expr = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const seq = completePatternSeq({ sub_nodes: [expr, plus, one], sub_quantifiers: '   ' });
    expr.sub_nodes.push(seq as unknown as ParserNode, one as unknown as ParserNode);
    expr.neg_flags.push(false, false);
    completePatternSet(expr);
    const parser1 = new ParserImpl({ parser_nodes: [] });
    parser1.initParse({ src: '1', pos: 0 });
    const r1 = parser1.parseSingleNode(expr);
    assert(parser1.isSuccess());
    assert.deepStrictEqual(r1, {
        parser_nodes: [one, expr],
        range: [0, 1],
        value: '1',
        raw_value: '1',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const parser2 = new ParserImpl({ parser_nodes: [] });
    parser2.initParse({ src: '1+1', pos: 0 });
    const r2 = parser2.parseSingleNode(expr);
    assert(parser2.isSuccess());
    assert.deepStrictEqual(r2, {
        parser_nodes: [seq, expr],
        range: [0, 3],
        value: [
            { parser_nodes: [one, expr], range: [0, 1], value: '1', raw_value: '1', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [one], range: [2, 3], value: '1', raw_value: '1', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
        ],
        raw_value: [
            { parser_nodes: [one, expr], range: [0, 1], value: '1', raw_value: '1', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [one], range: [2, 3], value: '1', raw_value: '1', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
        ],
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    // One binary op per `PatternSet` expansion: longer input matches a prefix (same span as "1+1").
    const parser3 = new ParserImpl({ parser_nodes: [] });
    parser3.initParse({ src: '1+1+1', pos: 0 });
    const r3 = parser3.parseSingleNode(expr);
    assert(parser3.isSuccess());
    assert.deepStrictEqual(r3, r2);
    const parser4 = new ParserImpl({ parser_nodes: [] });
    parser4.initParse({ src: '+', pos: 0 });
    assert.strictEqual(parser4.parseSingleNode(expr), null);
    assert.ok(!parser4.isSuccess());
}
/**
 * Left recursion with binary shape: Expr ::= Expr '+' Expr | '1'
 * Unlike `Expr '+' '1'`, the right operand is `Expr`, so longer chains (e.g. `1+1+1`) extend the parse
 * in one top-level match (`range` covers the full string).
 */
function test_parsePatternSet_left_recursive_expr_plus_expr(): void {
    const one = completeCharSeq({ literal: '1' });
    const plus = completeCharSeq({ literal: '+' });
    const expr = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const seq = completePatternSeq({ sub_nodes: [expr, plus, expr], sub_quantifiers: '   ' });
    expr.sub_nodes.push(seq as unknown as ParserNode, one as unknown as ParserNode);
    expr.neg_flags.push(false, false);
    completePatternSet(expr);
    const leafAt = (lo: number, hi: number): ASTNode => ({
        parser_nodes: [one, expr],
        range: [lo, hi],
        value: '1',
        raw_value: '1',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const p1 = new ParserImpl({ parser_nodes: [] });
    p1.initParse({ src: '1', pos: 0 });
    const r1 = p1.parseSingleNode(expr);
    assert(p1.isSuccess());
    assert.deepStrictEqual(r1, {
        parser_nodes: [one, expr],
        range: [0, 1],
        value: '1',
        raw_value: '1',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const p2 = new ParserImpl({ parser_nodes: [] });
    p2.initParse({ src: '1+1', pos: 0 });
    const r2 = p2.parseSingleNode(expr);
    assert(p2.isSuccess());
    assert.deepStrictEqual(r2, {
        parser_nodes: [seq, expr],
        range: [0, 3],
        value: [leafAt(0, 1), { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [], enclosure: null, associate_enclosures: null, bindings: {} }, leafAt(2, 3)],
        raw_value: [leafAt(0, 1), { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [], enclosure: null, associate_enclosures: null, bindings: {} }, leafAt(2, 3)],
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const p3 = new ParserImpl({ parser_nodes: [] });
    p3.initParse({ src: '1+1+1', pos: 0 });
    const r3 = p3.parseSingleNode(expr);
    assert(p3.isSuccess());
    assert.deepStrictEqual(r3?.range, [0, 5]);
    assert.ok(Array.isArray(r3?.value) && r3!.value.length === 3);
    const right = r3!.value[2] as ASTNode;
    assert.deepStrictEqual(right.range, [2, 5]);
    assert.ok(Array.isArray(right.value) && right.value.length === 3);
    const inner = right.value as ASTNode[];
    assert.deepStrictEqual(inner[0], leafAt(2, 3));
    assert.deepStrictEqual(inner[1], { parser_nodes: [plus], range: [3, 4], value: '+', raw_value: '+', seps: [], enclosure: null, associate_enclosures: null, bindings: {} });
    assert.deepStrictEqual(inner[2], leafAt(4, 5));
    const pBad = new ParserImpl({ parser_nodes: [] });
    pBad.initParse({ src: '+', pos: 0 });
    assert.strictEqual(pBad.parseSingleNode(expr), null);
    assert.ok(!pBad.isSuccess());
}
/**
 * Left recursion: List ::= List 'b' | 'a'
 */
function test_parsePatternSet_left_recursive_list_ab(): void {
    const a = completeCharSeq({ literal: 'a' });
    const b = completeCharSeq({ literal: 'b' });
    const list = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const pair = completePatternSeq({ sub_nodes: [list, b], sub_quantifiers: '  ' });
    list.sub_nodes.push(pair as unknown as ParserNode, a as unknown as ParserNode);
    list.neg_flags.push(false, false);
    completePatternSet(list);
    const pA = new ParserImpl({ parser_nodes: [] });
    pA.initParse({ src: 'a', pos: 0 });
    const ra = pA.parseSingleNode(list);
    assert(pA.isSuccess());
    assert.deepStrictEqual(ra, {
        parser_nodes: [a, list],
        range: [0, 1],
        value: 'a',
        raw_value: 'a',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const pAB = new ParserImpl({ parser_nodes: [] });
    pAB.initParse({ src: 'ab', pos: 0 });
    const rab = pAB.parseSingleNode(list);
    assert(pAB.isSuccess());
    assert.deepStrictEqual(rab, {
        parser_nodes: [pair, list],
        range: [0, 2],
        value: [
            { parser_nodes: [a, list], range: [0, 1], value: 'a', raw_value: 'a', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [b], range: [1, 2], value: 'b', raw_value: 'b', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
        ],
        raw_value: [
            { parser_nodes: [a, list], range: [0, 1], value: 'a', raw_value: 'a', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [b], range: [1, 2], value: 'b', raw_value: 'b', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
        ],
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const pABB = new ParserImpl({ parser_nodes: [] });
    pABB.initParse({ src: 'abb', pos: 0 });
    const rabb = pABB.parseSingleNode(list);
    assert(pABB.isSuccess());
    assert.deepStrictEqual(rabb, rab);
}
function test_parsePatternSet_synx_shape_ABC(): void {
    // Synx (as requested):
    // C={"12";A};
    // B=("ab";C);
    // A={B};
    //
    // Interpreted in synx-ts node model:
    // - C is a PatternSet with alternatives: "12" | A
    // - B is a PatternSeq: "ab" , C
    // - A is a PatternSet with alternative: B
    const A = { sub_nodes: [], neg_flags: [] } as unknown as PatternSet;
    const C: PatternSet = completePatternSet({ sub_nodes: [completeCharSeq({ literal: '12' })] });
    const B = completePatternSeq({ sub_nodes: [completeCharSeq({ literal: 'ab' }), C], sub_quantifiers: '  ' });
    A.sub_nodes.push(B as unknown as ParserNode);
    C.sub_nodes.push(A as unknown as ParserNode);
    A.neg_flags.push(false);
    C.neg_flags.push(false);
    completePatternSet(A);
    completePatternSet(C);
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: 'ab12', pos: 0 });
    const result = parser.parseSingleNode(A);
    assert.deepStrictEqual(result, {
        parser_nodes: [B, A],
        range: [0, 4],
        value: [
            { parser_nodes: [B.sub_nodes[0] as ParserNode], range: [0, 2], value: 'ab', raw_value: 'ab', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [C.sub_nodes[0] as ParserNode, C], range: [2, 4], value: '12', raw_value: '12', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
        ],
        raw_value: [
            { parser_nodes: [B.sub_nodes[0] as ParserNode], range: [0, 2], value: 'ab', raw_value: 'ab', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
            { parser_nodes: [C.sub_nodes[0] as ParserNode, C], range: [2, 4], value: '12', raw_value: '12', seps: [], enclosure: null, associate_enclosures: null, bindings: {} },
        ],
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    assert(parser.isSuccess());
}
/** `neg_flags`: negated branch inner success fails whole set; inner failure falls through like non-neg failure. */
function test_parsePatternSet_neg_flags(): void {
    const aLit = completeCharSeq({ literal: 'a' });
    const bLit = completeCharSeq({ literal: 'b' });
    const negThenB = completePatternSet({ sub_nodes: [aLit, bLit], neg_flags: [true, false] });
    const p1 = new ParserImpl({ parser_nodes: [] });
    p1.initParse({ src: 'b', pos: 0 });
    const r1 = p1.parseSingleNode(negThenB);
    assert(p1.isSuccess());
    assert.deepStrictEqual(r1, {
        parser_nodes: [bLit, negThenB],
        range: [0, 1],
        value: 'b',
        raw_value: 'b',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const p2 = new ParserImpl({ parser_nodes: [] });
    p2.initParse({ src: 'a', pos: 0 });
    assert.strictEqual(p2.parseSingleNode(negThenB), null);
    assert.ok(!p2.isSuccess());
    const onlyNegA = completePatternSet({ sub_nodes: [aLit], neg_flags: [true] });
    const p3 = new ParserImpl({ parser_nodes: [] });
    p3.initParse({ src: 'x', pos: 0 });
    assert.strictEqual(p3.parseSingleNode(onlyNegA), null);
    assert.ok(!p3.isSuccess());
    const p4 = new ParserImpl({ parser_nodes: [] });
    p4.initParse({ src: 'a', pos: 0 });
    assert.strictEqual(p4.parseSingleNode(onlyNegA), null);
    assert.ok(!p4.isSuccess());
    const nonNegLikeNegFallthrough = completePatternSet({ sub_nodes: [aLit, bLit], neg_flags: [false, false] });
    const p5 = new ParserImpl({ parser_nodes: [] });
    p5.initParse({ src: 'b', pos: 0 });
    const r5 = p5.parseSingleNode(nonNegLikeNegFallthrough);
    assert(p5.isSuccess());
    assert.deepStrictEqual(r5, {
        parser_nodes: [bLit, nonNegLikeNegFallthrough],
        range: [0, 1],
        value: 'b',
        raw_value: 'b',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
}
function test_parsePatternSet_charset_flag_char_match_contract(): void {
    const lower = completeCharRange({ start: 'a', end: 'z' });
    const lowerSet = completePatternSet({ sub_nodes: [lower] });
    assert.strictEqual(lowerSet.charset_flag, true);
    const p1 = new ParserImpl({ parser_nodes: [] });
    p1.initParse({ src: 'm', pos: 0 });
    const r1 = p1.parseSingleNode(lowerSet);
    assert(p1.isSuccess());
    assert.deepStrictEqual(r1, {
        parser_nodes: [lowerSet],
        range: [0, 1],
        value: 'm',
        raw_value: 'm',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const p2 = new ParserImpl({ parser_nodes: [] });
    p2.initParse({ src: '5', pos: 0 });
    assert.strictEqual(p2.parseSingleNode(lowerSet), null);
    assert.ok(!p2.isSuccess());
}
function test_parsePatternSet_charset_flag_reject_patterns(): void {
    const quote = completeCharSeq({ literal: '"' });
    const notQuote = completePatternSet({ sub_nodes: [quote, AnyChar], neg_flags: [true, false] });
    assert.strictEqual(notQuote.charset_flag, true);
    const p1 = new ParserImpl({ parser_nodes: [] });
    p1.initParse({ src: 'x', pos: 0 });
    const r1 = p1.parseSingleNode(notQuote);
    assert(p1.isSuccess());
    assert.deepStrictEqual(r1, {
        parser_nodes: [notQuote],
        range: [0, 1],
        value: 'x',
        raw_value: 'x',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
    const p2 = new ParserImpl({ parser_nodes: [] });
    p2.initParse({ src: '"', pos: 0 });
    assert.strictEqual(p2.parseSingleNode(notQuote), null);
    assert.ok(!p2.isSuccess());
    assert.strictEqual(p2.input.pos, 0);
}
function test_parsePatternSet_charset_flag_multichar_reject_pattern(): void {
    const backslash = completeCharSeq({ literal: '\\' });
    const escape = completePatternSeq({ sub_nodes: [backslash, AnyChar], sub_quantifiers: '  ' });
    const quote = completeCharSeq({ literal: '"' });
    const stringChar = completePatternSet({ sub_nodes: [escape, quote, AnyChar], neg_flags: [true, true, false] });
    assert.strictEqual(stringChar.charset_flag, true);
    const p1 = new ParserImpl({ parser_nodes: [] });
    p1.initParse({ src: '\\n', pos: 0 });
    assert.strictEqual(p1.parseSingleNode(stringChar), null);
    assert.ok(!p1.isSuccess());
    assert.strictEqual(p1.input.pos, 0);
    const p2 = new ParserImpl({ parser_nodes: [] });
    p2.initParse({ src: '😀', pos: 0 });
    const r2 = p2.parseSingleNode(stringChar);
    assert(p2.isSuccess());
    assert.deepStrictEqual(r2, {
        parser_nodes: [stringChar],
        range: [0, 2],
        value: '😀',
        raw_value: '😀',
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
}
function test_parsePatternSet_charset_flag_repetition_merges_like_char_match_set(): void {
    const quote = completeCharSeq({ literal: '"' });
    const notQuote = completePatternSet({ sub_nodes: [quote, AnyChar], neg_flags: [true, false] });
    const text = completePatternSeq({ sub_nodes: [notQuote], sub_quantifiers: '+' });
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse({ src: 'abc"tail', pos: 0 });
    const result = parser.parseSingleNode(text);
    assert(parser.isSuccess());
    assert.deepStrictEqual(result, {
        parser_nodes: [text],
        range: [0, 3],
        value: [{
                parser_nodes: [notQuote],
                range: [0, 3],
                value: 'abc',
                raw_value: 'abc',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            }],
        raw_value: [{
                parser_nodes: [notQuote],
                range: [0, 3],
                value: 'abc',
                raw_value: 'abc',
                seps: [], enclosure: null, associate_enclosures: null, bindings: {},
            }],
        seps: [], enclosure: null, associate_enclosures: null, bindings: {},
    });
}
function runAllTests(): void {
    console.log('Running parsePatternSet tests...\n');
    test_parsePatternSet_basic();
    test_parsePatternSet_direct_char_match_alt();
    test_parsePatternSet_associateby();
    test_parsePatternSet_associateby_ignore();
    test_parsePatternSet_alternative_precedes_associateby();
    test_parsePatternSet_infinite_recursion_self();
    test_parsePatternSet_infinite_recursion_cycle();
    test_parsePatternSet_nested_seq_and_set();
    test_parsePatternSet_infinite_recursion_nested_cycle();
    test_parsePatternSet_left_recursive_plus_chain();
    test_parsePatternSet_left_recursive_expr_plus_expr();
    test_parsePatternSet_left_recursive_list_ab();
    test_parsePatternSet_synx_shape_ABC();
    test_parsePatternSet_neg_flags();
    test_parsePatternSet_charset_flag_char_match_contract();
    test_parsePatternSet_charset_flag_reject_patterns();
    test_parsePatternSet_charset_flag_multichar_reject_pattern();
    test_parsePatternSet_charset_flag_repetition_merges_like_char_match_set();
    console.log('\nAll parsePatternSet tests passed!');
}
if (require.main === module) {
    runAllTests();
}
