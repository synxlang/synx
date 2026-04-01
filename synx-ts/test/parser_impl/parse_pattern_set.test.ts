import { strict as assert } from 'assert';
import { ParserImpl } from '../../src/parser_impl';
import { mkCharSeq, mkPatternSeq, mkPatternSet } from '../../src/parser_node';
import type { PatternSet, ParserNode } from '../../src/parser_node';
import type { ASTNode, ParserInput } from '../../src/parser';

function test_parsePatternSet_basic(): void {
  const set: PatternSet = mkPatternSet([mkCharSeq('ab'), mkCharSeq('a')]);

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
        parser_nodes: [set.patterns[0] as ParserNode, set],
        range: [0, 2],
        value: 'ab',
        raw_value: 'ab',
      },
      expected_error: false,
    },
    {
      id: 2,
      input: { src: 'a', pos: 0 },
      expected: {
        parser_nodes: [set.patterns[1] as ParserNode, set],
        range: [0, 1],
        value: 'a',
        raw_value: 'a',
      },
      expected_error: false,
    },
    { id: 3, input: { src: 'x', pos: 0 }, expected: null, expected_error: false },
  ];

  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const result = parser.parseSingleNode(set);
    assert.deepStrictEqual(result, c.expected, `case ${c.id} AST mismatch`);
    assert.strictEqual(c.expected_error, parser.last_error !== null, `case ${c.id} error flag mismatch`);
  }
}

function test_parsePatternSet_infinite_recursion_self(): void {
  const set: PatternSet = mkPatternSet([]);
  // Self-recursive: attempting the only alternative re-enters the same (node,pos) on the call stack.
  set.patterns.push(set as unknown as ParserNode);

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'x', pos: 0 });
  const result = parser.parseSingleNode(set);
  assert.strictEqual(result, null);
  assert.strictEqual(parser.last_error, 'Infinite recursion detected');
}

function test_parsePatternSet_infinite_recursion_cycle(): void {
  const a: PatternSet = mkPatternSet([]);
  const b: PatternSet = mkPatternSet([]);
  a.patterns.push(b as unknown as ParserNode);
  b.patterns.push(a as unknown as ParserNode);

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'x', pos: 0 });
  const result = parser.parseSingleNode(a);
  assert.strictEqual(result, null);
  assert.strictEqual(parser.last_error, 'Infinite recursion detected');
}

function test_parsePatternSet_nested_seq_and_set(): void {
  // Synx shape:
  // innerSet = { "ab" ; "a" }
  const innerSet: PatternSet = mkPatternSet([mkCharSeq('ab'), mkCharSeq('a')]);
  // outerSet = { innerSet ; "x" }
  const outerSet: PatternSet = mkPatternSet([innerSet, mkCharSeq('x')]);
  // seq = outerSet , "!"
  //
  // Equivalent Synx-style pattern (schematically):
  // ( { { "ab" ; "a" } ; "x" } , "!" )
  const bang = mkCharSeq('!');
  const seq = mkPatternSeq([outerSet, bang], '  ');

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
        parser_nodes: [innerSet.patterns[0] as ParserNode, innerSet, outerSet],
        range: [0, 2],
        value: 'ab',
        raw_value: 'ab',
      },
      {
        parser_nodes: [bang],
        range: [2, 3],
        value: '!',
        raw_value: '!',
      },
    ],
    raw_value: [
      {
        parser_nodes: [innerSet.patterns[0] as ParserNode, innerSet, outerSet],
        range: [0, 2],
        value: 'ab',
        raw_value: 'ab',
      },
      {
        parser_nodes: [bang],
        range: [2, 3],
        value: '!',
        raw_value: '!',
      },
    ],
  });
  assert.strictEqual(parser.last_error, null);
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
  const q = mkCharSeq('q');
  const r = mkCharSeq('r');
  const s = mkCharSeq('s');
  const x = mkCharSeq('x');
  const y = mkCharSeq('y');
  const z = mkCharSeq('z');

  const seqA = mkPatternSeq([x, b], '  ');
  const seqB = mkPatternSeq([y, c], '  ');
  const seqC = mkPatternSeq([z, a], '  ');

  a.patterns.push(q as unknown as ParserNode, seqA as unknown as ParserNode);
  b.patterns.push(r as unknown as ParserNode, seqB as unknown as ParserNode);
  c.patterns.push(s as unknown as ParserNode, seqC as unknown as ParserNode);

  const parser = new ParserImpl({ parser_nodes: [] });
  // Make the first literal fail at pos=0 so the cycle starts immediately at the same position.
  parser.initParse({ src: 'x', pos: 0 });
  const result = parser.parseSingleNode(a);
  assert.strictEqual(result, null);
  // last_error may be overwritten by mandatory callers (e.g. parseNode turning null into "Parse match failed").
  assert(parser.last_error !== null);
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
  const C: PatternSet = mkPatternSet([mkCharSeq('12')]);
  const B = mkPatternSeq([mkCharSeq('ab'), C], '  ');
  A.patterns.push(B as unknown as ParserNode);
  C.patterns.push(A as unknown as ParserNode);

  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: 'ab12', pos: 0 });
  const result = parser.parseSingleNode(A);

  assert.deepStrictEqual(result, {
    parser_nodes: [B, A],
    range: [0, 4],
    value: [
      { parser_nodes: [B.sub_nodes[0] as ParserNode], range: [0, 2], value: 'ab', raw_value: 'ab' },
      { parser_nodes: [C.patterns[0] as ParserNode, C], range: [2, 4], value: '12', raw_value: '12' },
    ],
    raw_value: [
      { parser_nodes: [B.sub_nodes[0] as ParserNode], range: [0, 2], value: 'ab', raw_value: 'ab' },
      { parser_nodes: [C.patterns[0] as ParserNode, C], range: [2, 4], value: '12', raw_value: '12' },
    ],
  });
  assert.strictEqual(parser.last_error, null);
}

function runAllTests(): void {
  console.log('Running parsePatternSet tests...\n');
  test_parsePatternSet_basic();
  test_parsePatternSet_infinite_recursion_self();
  test_parsePatternSet_infinite_recursion_cycle();
  test_parsePatternSet_nested_seq_and_set();
  test_parsePatternSet_infinite_recursion_nested_cycle();
  test_parsePatternSet_synx_shape_ABC();
  console.log('\nAll parsePatternSet tests passed!');
}

if (require.main === module) {
  runAllTests();
}

