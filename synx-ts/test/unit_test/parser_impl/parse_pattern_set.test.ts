import { strict as assert } from 'assert';
import { ParserImpl } from '../../../src/parser_impl';
import { mkByteSeq, mkPatternSeq, mkPatternSet } from '../../../src/parser_node';
import type { PatternSet, ParserNode } from '../../../src/parser_node';
import type { ASTNode, ParserInput } from '../../../src/parser';

function test_parsePatternSet_basic(): void {
  const set: PatternSet = mkPatternSet([mkByteSeq('ab'), mkByteSeq('a')]);

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
        seps: [],
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
        seps: [],
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

function test_parsePatternSet_infinite_recursion_self(): void {
  const set: PatternSet = mkPatternSet([]);
  // Self-recursive: attempting the only alternative re-enters the same (node,pos) on the call stack.
  set.sub_nodes.push(set as unknown as ParserNode);
  set.neg_flags.push(false);

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'x', pos: 0 });
  const result = parser.parseSingleNode(set);
  assert.strictEqual(result, null);
  assert.ok(!parser.isSuccess());
}

function test_parsePatternSet_infinite_recursion_cycle(): void {
  const a: PatternSet = mkPatternSet([]);
  const b: PatternSet = mkPatternSet([]);
  a.sub_nodes.push(b as unknown as ParserNode);
  b.sub_nodes.push(a as unknown as ParserNode);
  a.neg_flags.push(false);
  b.neg_flags.push(false);

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'x', pos: 0 });
  const result = parser.parseSingleNode(a);
  assert.strictEqual(result, null);
  assert.ok(!parser.isSuccess());
}

function test_parsePatternSet_nested_seq_and_set(): void {
  // Synx shape:
  // innerSet = { "ab" ; "a" }
  const innerSet: PatternSet = mkPatternSet([mkByteSeq('ab'), mkByteSeq('a')]);
  // outerSet = { innerSet ; "x" }
  const outerSet: PatternSet = mkPatternSet([innerSet, mkByteSeq('x')]);
  // seq = outerSet , "!"
  //
  // Equivalent Synx-style pattern (schematically):
  // ( { { "ab" ; "a" } ; "x" } , "!" )
  const bang = mkByteSeq('!');
  const seq = mkPatternSeq([outerSet, bang], '  ');

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'ab!', pos: 0 });
  const result = parser.parseSingleNode(seq);

  // Expect: PatternSeq with two children.
  // - child[0] comes from outerSet picking innerSet picking "ab"
  //   flatten rules append sets into parser_nodes of the winning ByteSeq.
  assert.deepStrictEqual(result, {
    parser_nodes: [seq],
    range: [0, 3],
    value: [
      {
        parser_nodes: [innerSet.sub_nodes[0] as ParserNode, innerSet, outerSet],
        range: [0, 2],
        value: 'ab',
        raw_value: 'ab',
        seps: [],
      },
      {
        parser_nodes: [bang],
        range: [2, 3],
        value: '!',
        raw_value: '!',
        seps: [],
      },
    ],
    raw_value: [
      {
        parser_nodes: [innerSet.sub_nodes[0] as ParserNode, innerSet, outerSet],
        range: [0, 2],
        value: 'ab',
        raw_value: 'ab',
        seps: [],
      },
      {
        parser_nodes: [bang],
        range: [2, 3],
        value: '!',
        raw_value: '!',
        seps: [],
      },
    ],
    seps: [],
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
  const a: PatternSet = mkPatternSet([]);
  const b: PatternSet = mkPatternSet([]);
  const c: PatternSet = mkPatternSet([]);
  const q = mkByteSeq('q');
  const r = mkByteSeq('r');
  const s = mkByteSeq('s');
  const x = mkByteSeq('x');
  const y = mkByteSeq('y');
  const z = mkByteSeq('z');

  const seqA = mkPatternSeq([x, b], '  ');
  const seqB = mkPatternSeq([y, c], '  ');
  const seqC = mkPatternSeq([z, a], '  ');

  a.sub_nodes.push(q as unknown as ParserNode, seqA as unknown as ParserNode);
  b.sub_nodes.push(r as unknown as ParserNode, seqB as unknown as ParserNode);
  c.sub_nodes.push(s as unknown as ParserNode, seqC as unknown as ParserNode);
  a.neg_flags.push(false, false);
  b.neg_flags.push(false, false);
  c.neg_flags.push(false, false);

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
  const one = mkByteSeq('1');
  const plus = mkByteSeq('+');
  const expr = mkPatternSet([]);
  const seq = mkPatternSeq([expr, plus, one], '   ');
  expr.sub_nodes.push(seq as unknown as ParserNode, one as unknown as ParserNode);
  expr.neg_flags.push(false, false);

  const parser1 = new ParserImpl({ parser_nodes: [] });
  parser1.initParse({ src: '1', pos: 0 });
  const r1 = parser1.parseSingleNode(expr);
  assert(parser1.isSuccess());
  assert.deepStrictEqual(r1, {
    parser_nodes: [one, expr],
    range: [0, 1],
    value: '1',
    raw_value: '1',
    seps: [],
  });

  const parser2 = new ParserImpl({ parser_nodes: [] });
  parser2.initParse({ src: '1+1', pos: 0 });
  const r2 = parser2.parseSingleNode(expr);
  assert(parser2.isSuccess());
  assert.deepStrictEqual(r2, {
    parser_nodes: [seq, expr],
    range: [0, 3],
    value: [
      { parser_nodes: [one, expr], range: [0, 1], value: '1', raw_value: '1', seps: [] },
      { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [] },
      { parser_nodes: [one], range: [2, 3], value: '1', raw_value: '1', seps: [] },
    ],
    raw_value: [
      { parser_nodes: [one, expr], range: [0, 1], value: '1', raw_value: '1', seps: [] },
      { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [] },
      { parser_nodes: [one], range: [2, 3], value: '1', raw_value: '1', seps: [] },
    ],
    seps: [],
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
  const one = mkByteSeq('1');
  const plus = mkByteSeq('+');
  const expr = mkPatternSet([]);
  const seq = mkPatternSeq([expr, plus, expr], '   ');
  expr.sub_nodes.push(seq as unknown as ParserNode, one as unknown as ParserNode);
  expr.neg_flags.push(false, false);

  const leafAt = (lo: number, hi: number): ASTNode => ({
    parser_nodes: [one, expr],
    range: [lo, hi],
    value: '1',
    raw_value: '1',
    seps: [],
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
    seps: [],
  });

  const p2 = new ParserImpl({ parser_nodes: [] });
  p2.initParse({ src: '1+1', pos: 0 });
  const r2 = p2.parseSingleNode(expr);
  assert(p2.isSuccess());
  assert.deepStrictEqual(r2, {
    parser_nodes: [seq, expr],
    range: [0, 3],
    value: [leafAt(0, 1), { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [] }, leafAt(2, 3)],
    raw_value: [leafAt(0, 1), { parser_nodes: [plus], range: [1, 2], value: '+', raw_value: '+', seps: [] }, leafAt(2, 3)],
    seps: [],
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
  assert.deepStrictEqual(inner[1], { parser_nodes: [plus], range: [3, 4], value: '+', raw_value: '+', seps: [] });
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
  const a = mkByteSeq('a');
  const b = mkByteSeq('b');
  const list = mkPatternSet([]);
  const pair = mkPatternSeq([list, b], '  ');
  list.sub_nodes.push(pair as unknown as ParserNode, a as unknown as ParserNode);
  list.neg_flags.push(false, false);

  const pA = new ParserImpl({ parser_nodes: [] });
  pA.initParse({ src: 'a', pos: 0 });
  const ra = pA.parseSingleNode(list);
  assert(pA.isSuccess());
  assert.deepStrictEqual(ra, {
    parser_nodes: [a, list],
    range: [0, 1],
    value: 'a',
    raw_value: 'a',
    seps: [],
  });

  const pAB = new ParserImpl({ parser_nodes: [] });
  pAB.initParse({ src: 'ab', pos: 0 });
  const rab = pAB.parseSingleNode(list);
  assert(pAB.isSuccess());
  assert.deepStrictEqual(rab, {
    parser_nodes: [pair, list],
    range: [0, 2],
    value: [
      { parser_nodes: [a, list], range: [0, 1], value: 'a', raw_value: 'a', seps: [] },
      { parser_nodes: [b], range: [1, 2], value: 'b', raw_value: 'b', seps: [] },
    ],
    raw_value: [
      { parser_nodes: [a, list], range: [0, 1], value: 'a', raw_value: 'a', seps: [] },
      { parser_nodes: [b], range: [1, 2], value: 'b', raw_value: 'b', seps: [] },
    ],
    seps: [],
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

  const A: PatternSet = mkPatternSet([]);
  const C: PatternSet = mkPatternSet([mkByteSeq('12')]);
  const B = mkPatternSeq([mkByteSeq('ab'), C], '  ');
  A.sub_nodes.push(B as unknown as ParserNode);
  C.sub_nodes.push(A as unknown as ParserNode);
  A.neg_flags.push(false);
  C.neg_flags.push(false);

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'ab12', pos: 0 });
  const result = parser.parseSingleNode(A);

  assert.deepStrictEqual(result, {
    parser_nodes: [B, A],
    range: [0, 4],
    value: [
      { parser_nodes: [B.sub_nodes[0] as ParserNode], range: [0, 2], value: 'ab', raw_value: 'ab', seps: [] },
      { parser_nodes: [C.sub_nodes[0] as ParserNode, C], range: [2, 4], value: '12', raw_value: '12', seps: [] },
    ],
    raw_value: [
      { parser_nodes: [B.sub_nodes[0] as ParserNode], range: [0, 2], value: 'ab', raw_value: 'ab', seps: [] },
      { parser_nodes: [C.sub_nodes[0] as ParserNode, C], range: [2, 4], value: '12', raw_value: '12', seps: [] },
    ],
    seps: [],
  });
  assert(parser.isSuccess());
}

/** `neg_flags`: negated branch inner success fails whole set; inner failure falls through like non-neg failure. */
function test_parsePatternSet_neg_flags(): void {
  const aLit = mkByteSeq('a');
  const bLit = mkByteSeq('b');

  const negThenB = mkPatternSet([aLit, bLit], [true, false]);
  const p1 = new ParserImpl({ parser_nodes: [] });
  p1.initParse({ src: 'b', pos: 0 });
  const r1 = p1.parseSingleNode(negThenB);
  assert(p1.isSuccess());
  assert.deepStrictEqual(r1, {
    parser_nodes: [bLit, negThenB],
    range: [0, 1],
    value: 'b',
    raw_value: 'b',
    seps: [],
  });

  const p2 = new ParserImpl({ parser_nodes: [] });
  p2.initParse({ src: 'a', pos: 0 });
  assert.strictEqual(p2.parseSingleNode(negThenB), null);
  assert.ok(!p2.isSuccess());

  const onlyNegA = mkPatternSet([aLit], [true]);
  const p3 = new ParserImpl({ parser_nodes: [] });
  p3.initParse({ src: 'x', pos: 0 });
  assert.strictEqual(p3.parseSingleNode(onlyNegA), null);
  assert.ok(!p3.isSuccess());

  const p4 = new ParserImpl({ parser_nodes: [] });
  p4.initParse({ src: 'a', pos: 0 });
  assert.strictEqual(p4.parseSingleNode(onlyNegA), null);
  assert.ok(!p4.isSuccess());

  const nonNegLikeNegFallthrough = mkPatternSet([aLit, bLit], [false, false]);
  const p5 = new ParserImpl({ parser_nodes: [] });
  p5.initParse({ src: 'b', pos: 0 });
  const r5 = p5.parseSingleNode(nonNegLikeNegFallthrough);
  assert(p5.isSuccess());
  assert.deepStrictEqual(r5, {
    parser_nodes: [bLit, nonNegLikeNegFallthrough],
    range: [0, 1],
    value: 'b',
    raw_value: 'b',
    seps: [],
  });
}

function runAllTests(): void {
  console.log('Running parsePatternSet tests...\n');
  test_parsePatternSet_basic();
  test_parsePatternSet_infinite_recursion_self();
  test_parsePatternSet_infinite_recursion_cycle();
  test_parsePatternSet_nested_seq_and_set();
  test_parsePatternSet_infinite_recursion_nested_cycle();
  test_parsePatternSet_left_recursive_plus_chain();
  test_parsePatternSet_left_recursive_expr_plus_expr();
  test_parsePatternSet_left_recursive_list_ab();
  test_parsePatternSet_synx_shape_ABC();
  test_parsePatternSet_neg_flags();
  console.log('\nAll parsePatternSet tests passed!');
}

if (require.main === module) {
  runAllTests();
}

